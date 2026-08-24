import os
import sys
import subprocess
import uuid
import asyncio
import json
import time
import re
from pathlib import Path

import traceback
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from llm_enhancement.types import (
    RunCompletionEvent,
    ToolCallEvent,
    ToolResultEvent,
    DeltaEvent,
    AgentLogEvent
)
from llm_enhancement.config import AgentConfig
from llm_enhancement.mcp_agent import MCPAgent

# Try importing CentrifugoClient
try:
    from dev_containers.connect import CentrifugoClient
    centrifugo = CentrifugoClient()
except Exception as e:
    centrifugo = None
    print(f"[Warning] CentrifugoClient not loaded: {e}")

# --- Agent Cache & Persistent Session Disk Storage ---
ACTIVE_AGENTS: Dict[str, MCPAgent] = {}

SESSIONS_FILE = os.path.join(os.path.dirname(__file__), "sessions_storage.json")

def load_sessions() -> Dict[str, Dict[str, Any]]:
    """Load sessions from disk on server startup."""
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print(f"[Warning] Failed to load sessions storage: {e}")
    return {}

def save_sessions():
    """Save sessions state to disk."""
    try:
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(SESSIONS, f, indent=2)
    except Exception as e:
        print(f"[Error] Failed to save sessions storage: {e}")

SESSIONS: Dict[str, Dict[str, Any]] = load_sessions()

SYSTEM_PROMPT = '''
You are a job scraping agent with Human-in-the-Loop (HITL) job selection capabilities.
You should follow this workflow:
**Workflow**
1. The user asks for certain jobs, experience level, and time range of posted jobs (e.g. past 7 days, past month).
2. If user doesn't provide these details, ask them. Once provided, call the search jobs tool with relevant keywords.
3. Target top tier-1 to tier-2 MNCs using search keywords (e.g., Python, AI Engineer, Deloitte, Accenture, TCS, Infosys, Wipro).
4. Once you receive job IDs, call tool `get_job_details` with the list of job IDs to retrieve metadata.
5. Filter the jobs based on user requirements and select top relevant jobs.
6. **HUMAN-IN-THE-LOOP (HITL) STEP**: Present the filtered list of jobs clearly showing Job IDs, Job Titles, Companies, Locations, and Experience. Explicitly ask the user to select which Job IDs they want to proceed with or process further. Do NOT call `process_jobs` until the user provides or confirms their selected Job IDs.
7. Once the user provides their selected Job IDs, call tool `process_jobs(job_ids, session_id)` with those user-selected job IDs and the active Session ID provided in your prompt context.
'''

async def get_or_create_agent(session_id: str) -> MCPAgent:
    if session_id not in ACTIVE_AGENTS:
        agnt_cnf = AgentConfig()
        (agnt_cnf
            .set_db_uri('sqlite:///agent_conv.db')
            .set_prompt(SYSTEM_PROMPT)
            .set_provider_type('SILICONFLOW')
            .set_token_limit(100000))
        mcp_url = os.getenv('MCP_URL', 'http://127.0.0.1:8000/sse')
        agent = MCPAgent(agent_config=agnt_cnf, run_id=session_id, mcp_urls=[mcp_url])
        try:
            await agent.connect_mcp()
        except Exception as e:
            print(f"[Warning] Failed to connect MCP for agent session {session_id}: {e}")
        ACTIVE_AGENTS[session_id] = agent
    return ACTIVE_AGENTS[session_id]

def publish_event(channel: str, data: dict):
    """Safely publish an event to Centrifugo."""
    if centrifugo:
        try:
            centrifugo.publish(channel, data)
        except Exception as err:
            print(f"[Centrifugo Publish Error] {err}")

# --- FastAPI Application ---

app = FastAPI(title="Job Scraper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles

output_static_dir = Path(__file__).resolve().parent.parent / "output"
output_static_dir.mkdir(exist_ok=True)
app.mount("/output", StaticFiles(directory=str(output_static_dir)), name="output")

class CreateSessionRequest(BaseModel):
    title: Optional[str] = None

class ScrapeRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    title: Optional[str] = None

@app.get("/health")
async def handle_health():
    """GET /health — simple health check."""
    return {"status": "ok", "active_sessions": len(SESSIONS)}

@app.get("/sessions")
async def list_sessions():
    """GET /sessions — List all active sessions sorted by updated_at desc."""
    sessions_list = sorted(
        list(SESSIONS.values()),
        key=lambda x: x.get("updated_at", ""),
        reverse=True
    )
    return {"status": "ok", "sessions": sessions_list}

@app.post("/sessions")
async def create_session(req: Optional[CreateSessionRequest] = None):
    """POST /sessions — Create a new chat session."""
    session_id = str(uuid.uuid4())
    title = (req.title if req and req.title else "").strip() or f"Job Search Session #{len(SESSIONS) + 1}"
    now = datetime.now(timezone.utc).isoformat()
    
    session_data = {
        "id": session_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
        "messages": [],
        "total_tokens": 0,
        "total_time_ms": 0.0,
        "job_ids": [],
        "jobs": []
    }
    SESSIONS[session_id] = session_data
    save_sessions()
    
    publish_event("workflow", {
        "event_type": "session_created",
        "session_id": session_id,
        "title": title,
        "timestamp": now
    })
    
    return {"status": "ok", "session": session_data}

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """GET /sessions/{session_id} — Get details of a specific session."""
    if session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "ok", "session": SESSIONS[session_id]}

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """DELETE /sessions/{session_id} — Delete a session."""
    if session_id in SESSIONS:
        del SESSIONS[session_id]
        save_sessions()
    if session_id in ACTIVE_AGENTS:
        del ACTIVE_AGENTS[session_id]
    
    publish_event("workflow", {
        "event_type": "session_deleted",
        "session_id": session_id
    })
    
    return {"status": "ok", "session_id": session_id}

def extract_job_ids_from_text(text: str) -> List[str]:
    """Extract job IDs like JOB_123, job_456, or numeric IDs from text."""
    if not isinstance(text, str):
        return []
    # Match patterns like JOB_101, job-402, JOB12345
    matches = re.findall(r'\b(?:JOB|job|Job)[_-]?\d+\b', text)
    # Also find stand-alone job ID patterns like ID: 1045 or job_id: "xyz"
    extra_matches = re.findall(r'job_id["\']?\s*[:=]\s*["\']?([a-zA-Z0-9_-]+)', text, re.IGNORECASE)
    all_found = list(dict.fromkeys(matches + extra_matches))
    return all_found

@app.post("/scrape")
async def handle_scrape(req: ScrapeRequest):
    """POST /scrape — Accepts user query, processes with agent, broadcasts Centrifugo events, tracks metrics & job IDs."""
    try:
        if not req.message.strip():
            raise HTTPException(status_code=400, detail="No message provided")

        session_id = req.session_id or str(uuid.uuid4())
        now = datetime.now().isoformat() + "Z"

        # Ensure session exists in SESSIONS
        if session_id not in SESSIONS:
            title = req.title or (req.message[:30] + "..." if len(req.message) > 30 else req.message)
            SESSIONS[session_id] = {
                "id": session_id,
                "title": title,
                "created_at": now,
                "updated_at": now,
                "messages": [],
                "total_tokens": 0,
                "total_time_ms": 0.0,
                "job_ids": [],
                "jobs": []
            }

        session = SESSIONS[session_id]
        
        # Add user message
        user_msg = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": req.message,
            "timestamp": now
        }
        session["messages"].append(user_msg)

        start_time = time.time()
        
        publish_event("workflow", {
            "event_type": "agent_start",
            "session_id": session_id,
            "message": req.message,
            "timestamp": now
        })
        publish_event(f"session_{session_id}", {
            "event_type": "agent_start",
            "session_id": session_id,
            "message": req.message,
            "timestamp": now
        })

        agent = await get_or_create_agent(session_id)
        current_prompt = f"{SYSTEM_PROMPT}\n\n[Active Session Context]\nActive Session ID: '{session_id}'\nAlways pass session_id='{session_id}' when calling tool `process_jobs`."
        handler = agent.chat(req.message, current_prompt)

        response = None
        extracted_job_ids: List[str] = []
        extracted_jobs: List[Dict[str, Any]] = []
        tokens_utilized = 0
        events_log: List[Dict[str, Any]] = []

        async for evt in handler:
            event_type = getattr(evt, "type", evt.__class__.__name__)
            
            # Record & broadcast tool calls
            if isinstance(evt, ToolCallEvent):
                tool_name = evt.tool_name
                tool_kwargs = evt.tool_kwargs
                evt_data = {
                    "event_type": "tool_call",
                    "session_id": session_id,
                    "tool_name": tool_name,
                    "kwargs": tool_kwargs,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                events_log.append(evt_data)
                publish_event("workflow", evt_data)
                publish_event(f"session_{session_id}", evt_data)

                # Check if job_ids passed to tool
                if "job_ids" in tool_kwargs and isinstance(tool_kwargs["job_ids"], list):
                    for jid in tool_kwargs["job_ids"]:
                        if str(jid) not in extracted_job_ids:
                            extracted_job_ids.append(str(jid))

            elif isinstance(evt, ToolResultEvent):
                tool_name = evt.tool_name
                tool_result = evt.tool_result or evt.content
                evt_data = {
                    "event_type": "tool_result",
                    "session_id": session_id,
                    "tool_name": tool_name,
                    "result": str(tool_result)[:500],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                events_log.append(evt_data)
                publish_event("workflow", evt_data)
                publish_event(f"session_{session_id}", evt_data)

                # Parse jobs if process_jobs or get_job_details returned structured job list
                parsed_res = tool_result
                if isinstance(parsed_res, str):
                    try:
                        parsed_res = json.loads(parsed_res)
                    except Exception:
                        pass

                if isinstance(parsed_res, dict):
                    if "jobs" in parsed_res and isinstance(parsed_res["jobs"], list):
                        for job in parsed_res["jobs"]:
                            if isinstance(job, dict):
                                jid = job.get("job_id") or job.get("id")
                                if jid and str(jid) not in extracted_job_ids:
                                    extracted_job_ids.append(str(jid))
                                extracted_jobs.append(job)

            elif isinstance(evt, DeltaEvent):
                if evt.delta:
                    evt_data = {
                        "event_type": "delta",
                        "session_id": session_id,
                        "delta": evt.delta,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    publish_event("workflow", evt_data)
                    publish_event(f"session_{session_id}", evt_data)

            elif isinstance(evt, RunCompletionEvent):
                response = evt
                if hasattr(evt, "tokens_elapsed") and evt.tokens_elapsed:
                    tokens_utilized = evt.tokens_elapsed

        time_taken_sec = time.time() - start_time
        time_taken_ms = round(time_taken_sec * 1000, 2)

        result_content = ""
        if response:
            result_content = response.content if isinstance(response.content, str) else str(response.content)
        else:
            result_content = "Agent finished execution."

        # Also extract any job IDs mentioned in final text response
        text_job_ids = extract_job_ids_from_text(result_content)
        for jid in text_job_ids:
            if jid not in extracted_job_ids:
                extracted_job_ids.append(jid)

        # Estimate tokens if not directly returned
        if not tokens_utilized:
            # Approx 1 token per 4 chars of input + output
            total_chars = len(req.message) + len(result_content)
            tokens_utilized = max(round(total_chars / 3.8), 45)

        # Update session history & totals
        assistant_msg = {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": result_content,
            "job_ids": extracted_job_ids,
            "jobs": extracted_jobs,
            "tokens": tokens_utilized,
            "time_taken_ms": time_taken_ms,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        session["messages"].append(assistant_msg)
        session["total_tokens"] = session.get("total_tokens", 0) + tokens_utilized
        session["total_time_ms"] = round(session.get("total_time_ms", 0.0) + time_taken_ms, 2)
        session["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Combine session unique job_ids
        for jid in extracted_job_ids:
            if jid not in session["job_ids"]:
                session["job_ids"].append(jid)

        # Save updated sessions to disk
        save_sessions()

        completion_event = {
            "event_type": "agent_completion",
            "session_id": session_id,
            "result": result_content,
            "job_ids": extracted_job_ids,
            "tokens": tokens_utilized,
            "time_taken_ms": time_taken_ms,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        publish_event("workflow", completion_event)
        publish_event(f"session_{session_id}", completion_event)

        return {
            "status": "ok",
            "session_id": session_id,
            "result": result_content,
            "job_ids": extracted_job_ids,
            "jobs": extracted_jobs,
            "tokens": tokens_utilized,
            "time_taken_ms": time_taken_ms,
            "session": session
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Error in handle_scrape] {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class GenerateATSResumesRequest(BaseModel):
    session_id: str
    job_ids: List[str]
    candidate_data_file: Optional[str] = None

@app.post("/generate-ats-resumes")
async def generate_ats_resumes(req: GenerateATSResumesRequest):
    """
    Generate tailored ATS candidate data JSONs for selected job IDs via ATSDataModifier,
    save JSONs in SQLite table `generated_ats_resumes`, and invoke `generate_resume.py` for each job ID.
    """
    if not req.job_ids:
        raise HTTPException(status_code=400, detail="No job_ids provided")

    base_dir = Path(__file__).resolve().parent.parent
    data_file_name = req.candidate_data_file or "bilal_resume_data_ai.json"
    user_data_path = base_dir / "user_data" / data_file_name
    if not user_data_path.exists():
        json_files = list((base_dir / "user_data").glob("*.json"))
        if json_files:
            user_data_path = json_files[0]
        else:
            raise HTTPException(status_code=404, detail=f"Candidate baseline data file not found at {user_data_path}")

    with open(user_data_path, "r", encoding="utf-8") as f:
        user_old_data = json.load(f)

    from module_testing.ats_data_modifier import ATSDataModifier
    from mcps.linkedin_platform import get_job_description, save_generated_ats_resume, linkedin

    modifier = ATSDataModifier()
    results = []

    for idx, jid in enumerate(req.job_ids):
        jid_str = str(jid).strip()
        if not jid_str:
            continue

        publish_event("workflow", {
            "event_type": "ats_generation_progress",
            "session_id": req.session_id,
            "job_id": jid_str,
            "current": idx + 1,
            "total": len(req.job_ids),
            "status": f"Fetching Job Description for {jid_str}..."
        })

        job_desc_dict = get_job_description(jid_str)
        if not job_desc_dict or not (job_desc_dict.get("raw_description") or job_desc_dict.get("minimal_description")):
            try:
                fetched = await linkedin.fetch_job_description(jid_str)
                job_desc_dict = fetched
            except Exception as err:
                print(f"[Warning] Failed to fetch live job description for {jid_str}: {err}")
                job_desc_dict = {"job_id": jid_str, "raw_description": f"Job ID {jid_str}"}

        jd_text = job_desc_dict.get("raw_description") or job_desc_dict.get("minimal_description") or f"Job ID {jid_str}"

        publish_event("workflow", {
            "event_type": "ats_generation_progress",
            "session_id": req.session_id,
            "job_id": jid_str,
            "current": idx + 1,
            "total": len(req.job_ids),
            "status": f"Running ATS Data Modifier LLM for {jid_str}..."
        })

        try:
            modified_schema = await modifier.generate_data(
                job_description=jd_text,
                user_old_data=user_old_data
            )

            if hasattr(modified_schema, "model_dump"):
                modified_dict = modified_schema.model_dump()
            elif hasattr(modified_schema, "dict"):
                modified_dict = modified_schema.dict()
            else:
                modified_dict = dict(modified_schema)

            modified_json_str = json.dumps(modified_dict, indent=2)

            # Write generated JSON into user_data
            temp_json_name = f"generated_ats_{jid_str}.json"
            temp_json_path = base_dir / "user_data" / temp_json_name
            with open(temp_json_path, "w", encoding="utf-8") as f:
                f.write(modified_json_str)

            # Save record in SQLite table
            prefix_name = f"resume_{jid_str}"
            output_pdf_folder = os.path.join("output", prefix_name)
            save_generated_ats_resume(req.session_id, jid_str, modified_json_str, output_pdf_folder)

            publish_event("workflow", {
                "event_type": "ats_generation_progress",
                "session_id": req.session_id,
                "job_id": jid_str,
                "current": idx + 1,
                "total": len(req.job_ids),
                "status": f"Generating PDF Resumes for {jid_str}..."
            })

            gen_script = base_dir / "generate_resume.py"
            try:
                cmd = [
                    sys.executable,
                    str(gen_script),
                    "-d", temp_json_name,
                    "-p", prefix_name,
                    "-y"
                ]
                proc = subprocess.run(cmd, cwd=str(base_dir), capture_output=True, text=True, timeout=120)
                print(f"[generate_resume stdout for {jid_str}]: {proc.stdout}")
            except Exception as proc_err:
                print(f"[Error running generate_resume for {jid_str}]: {proc_err}")

            results.append({
                "job_id": jid_str,
                "generated_json_file": temp_json_name,
                "output_pdf_folder": output_pdf_folder,
                "generated_data": modified_dict
            })
        except Exception as gen_err:
            print(f"[Error generating ATS data for {jid_str}]: {gen_err}")

    publish_event("workflow", {
        "event_type": "ats_generation_completed",
        "session_id": req.session_id,
        "results": results
    })

    return {
        "status": "ok",
        "session_id": req.session_id,
        "results": results
    }

@app.get("/sessions/{session_id}/job-descriptions")
async def get_session_job_descriptions(session_id: str):
    """GET /sessions/{session_id}/job-descriptions — Fetch saved job descriptions for session."""
    from mcps.linkedin_platform import init_db, SessionLocal, JobDescription
    from sqlalchemy import select, or_
    init_db()

    session = SESSIONS.get(session_id, {})
    sess_job_ids = [str(jid) for jid in session.get("job_ids", []) if jid]

    with SessionLocal() as db_session:
        stmt = select(JobDescription)
        if sess_job_ids:
            stmt = stmt.where(or_(JobDescription.session_id == session_id, JobDescription.job_id.in_(sess_job_ids)))
        else:
            stmt = stmt.where(JobDescription.session_id == session_id)
        
        entities = db_session.scalars(stmt).all()
        jobs = []
        seen = set()
        for entity in entities:
            if entity.job_id in seen:
                continue
            seen.add(entity.job_id)
            jobs.append(entity.to_dict())

    return {"status": "ok", "session_id": session_id, "jobs": jobs}

@app.get("/sessions/{session_id}/ats-resumes")
async def get_session_ats_resumes(session_id: str):
    """GET /sessions/{session_id}/ats-resumes — Fetch generated ATS resumes for session."""
    from mcps.linkedin_platform import get_generated_ats_resumes
    resumes = get_generated_ats_resumes(session_id=session_id)
    return {"status": "ok", "session_id": session_id, "resumes": resumes}

@app.get("/jobs/{job_id}/ats-resume")
async def get_job_ats_resume(job_id: str):
    """GET /jobs/{job_id}/ats-resume — Fetch generated ATS resume data for job_id."""
    from mcps.linkedin_platform import get_generated_ats_resumes
    resumes = get_generated_ats_resumes(job_id=job_id)
    if resumes:
        return {"status": "ok", "found": True, "resume": resumes[0]}

    base_dir = Path(__file__).resolve().parent.parent
    json_path = base_dir / "user_data" / f"generated_ats_{job_id}.json"
    if json_path.exists():
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            pdf_folder = f"output/resume_{job_id}"
            return {
                "status": "ok",
                "found": True,
                "resume": {
                    "job_id": job_id,
                    "generated_json": data,
                    "output_pdf_folder": pdf_folder,
                }
            }
        except Exception:
            pass
    return {"status": "ok", "found": False, "resume": None}

class RegeneratePDFRequest(BaseModel):
    session_id: str
    job_id: str

@app.post("/regenerate-pdf")
async def regenerate_pdf_endpoint(req: RegeneratePDFRequest):
    """POST /regenerate-pdf — Regenerate PDFs for a job_id with custom/updated session_id."""
    jid_str = req.job_id.strip()
    sess_id = req.session_id.strip()
    if not jid_str:
        raise HTTPException(status_code=400, detail="job_id is required.")

    base_dir = Path(__file__).resolve().parent.parent
    temp_json_name = f"generated_ats_{jid_str}.json"
    json_path = base_dir / "user_data" / temp_json_name

    json_str = ""
    parsed_dict = {}

    if json_path.exists():
        with open(json_path, "r", encoding="utf-8") as f:
            json_str = f.read()
            try:
                parsed_dict = json.loads(json_str)
            except Exception:
                pass

    if not json_str:
        from mcps.linkedin_platform import get_generated_ats_resumes
        resumes = get_generated_ats_resumes(job_id=jid_str)
        if resumes and resumes[0].get("generated_json"):
            parsed_dict = resumes[0]["generated_json"]
            json_str = json.dumps(parsed_dict, indent=2)
            with open(json_path, "w", encoding="utf-8") as f:
                f.write(json_str)

    # Fallback: If no ATS JSON data exists yet, run ATSDataModifier to generate it now
    if not json_str:
        from mcps.linkedin_platform import get_job_description, linkedin
        from module_testing.ats_data_modifier import ATSDataModifier

        job_desc_dict = get_job_description(jid_str)
        if not job_desc_dict or not (job_desc_dict.get("raw_description") or job_desc_dict.get("minimal_description")):
            try:
                job_desc_dict = await linkedin.fetch_job_description(jid_str)
            except Exception:
                job_desc_dict = {"job_id": jid_str, "raw_description": f"Job ID {jid_str}"}

        jd_text = job_desc_dict.get("raw_description") or job_desc_dict.get("minimal_description") or f"Job ID {jid_str}"

        user_data_path = base_dir / "user_data" / "bilal_resume_data_ai.json"
        if not user_data_path.exists():
            json_files = list((base_dir / "user_data").glob("*.json"))
            if json_files:
                user_data_path = json_files[0]

        with open(user_data_path, "r", encoding="utf-8") as f:
            user_old_data = json.load(f)

        modifier = ATSDataModifier()
        modified_schema = await modifier.generate_data(job_description=jd_text, user_old_data=user_old_data)
        if hasattr(modified_schema, "model_dump"):
            parsed_dict = modified_schema.model_dump()
        elif hasattr(modified_schema, "dict"):
            parsed_dict = modified_schema.dict()
        else:
            parsed_dict = dict(modified_schema)

        json_str = json.dumps(parsed_dict, indent=2)
        with open(json_path, "w", encoding="utf-8") as f:
            f.write(json_str)

    prefix_name = f"resume_{jid_str}"
    output_pdf_folder = os.path.join("output", prefix_name)

    from mcps.linkedin_platform import save_generated_ats_resume
    save_generated_ats_resume(sess_id, jid_str, json_str, output_pdf_folder)

    gen_script = base_dir / "generate_resume.py"
    try:
        cmd = [
            sys.executable,
            str(gen_script),
            "-d", temp_json_name,
            "-p", prefix_name,
            "-y"
        ]
        proc = subprocess.run(cmd, cwd=str(base_dir), capture_output=True, text=True, timeout=120)
        print(f"[regenerate_pdf stdout for {jid_str}]: {proc.stdout}")
    except Exception as proc_err:
        print(f"[Error running generate_resume for {jid_str}]: {proc_err}")

    return {
        "status": "ok",
        "message": f"Successfully regenerated PDFs for job_id '{jid_str}'.",
        "session_id": sess_id,
        "job_id": jid_str,
        "output_pdf_folder": output_pdf_folder,
        "generated_json_file": temp_json_name,
        "generated_data": parsed_dict
    }

class DirectJDRequest(BaseModel):
    session_id: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_description: str

@app.post("/process-direct-jd")
async def process_direct_jd_endpoint(req: DirectJDRequest):
    """
    POST /process-direct-jd — Accepts raw job description directly, runs ATSDataModifier to generate JSON,
    saves JSON, compiles PDF resumes, and returns downloadable PDF links & JSON data.
    """
    jd_text = req.job_description.strip()
    if not jd_text:
        raise HTTPException(status_code=400, detail="job_description is required.")

    sess_id = req.session_id.strip() if req.session_id else str(uuid.uuid4())
    job_id = f"DIRECT_{int(time.time())}"
    title = (req.job_title or "").strip() or "Custom Job Posting"
    company = (req.company or "").strip() or "Target Enterprise"

    # Step 1: Save Job Description into SQLite DB
    from mcps.linkedin_platform import save_job_description, save_generated_ats_resume
    jd_details = {
        "job_id": job_id,
        "title": title,
        "company_name": company,
        "location": "Remote / Flexible",
        "minimal_description": jd_text[:300] + "...",
        "raw_description": jd_text,
        "skills_required": [],
        "job_url": ""
    }
    save_job_description(sess_id, jd_details)

    # Step 2: Run ATSDataModifier
    base_dir = Path(__file__).resolve().parent.parent
    user_data_path = base_dir / "user_data" / "bilal_resume_data_ai.json"
    if not user_data_path.exists():
        json_files = list((base_dir / "user_data").glob("*.json"))
        if json_files:
            user_data_path = json_files[0]

    with open(user_data_path, "r", encoding="utf-8") as f:
        user_old_data = json.load(f)

    from module_testing.ats_data_modifier import ATSDataModifier
    modifier = ATSDataModifier()
    modified_schema = await modifier.generate_data(job_description=jd_text, user_old_data=user_old_data)

    if hasattr(modified_schema, "model_dump"):
        modified_dict = modified_schema.model_dump()
    elif hasattr(modified_schema, "dict"):
        modified_dict = modified_schema.dict()
    else:
        modified_dict = dict(modified_schema)

    modified_json_str = json.dumps(modified_dict, indent=2)

    # Save JSON to disk & SQLite
    temp_json_name = f"generated_ats_{job_id}.json"
    temp_json_path = base_dir / "user_data" / temp_json_name
    with open(temp_json_path, "w", encoding="utf-8") as f:
        f.write(modified_json_str)

    prefix_name = f"resume_{job_id}"
    output_pdf_folder = os.path.join("output", prefix_name)
    save_generated_ats_resume(sess_id, job_id, modified_json_str, output_pdf_folder)

    # Step 3: Run generate_resume.py to compile PDFs
    gen_script = base_dir / "generate_resume.py"
    try:
        cmd = [
            sys.executable,
            str(gen_script),
            "-d", temp_json_name,
            "-p", prefix_name,
            "-y"
        ]
        proc = subprocess.run(cmd, cwd=str(base_dir), capture_output=True, text=True, timeout=120)
        print(f"[process_direct_jd stdout for {job_id}]: {proc.stdout}")
    except Exception as proc_err:
        print(f"[Error running generate_resume for {job_id}]: {proc_err}")

    # Discover compiled PDF files in output directory
    pdf_dir = base_dir / "output" / prefix_name
    pdf_files = []
    if pdf_dir.exists():
        for pfile in pdf_dir.glob("*.pdf"):
            pdf_files.append({
                "name": pfile.name,
                "download_url": f"/output/{prefix_name}/{pfile.name}"
            })

    return {
        "status": "ok",
        "message": f"Successfully processed Direct Job Description and generated ATS JSON & PDFs for job_id '{job_id}'.",
        "session_id": sess_id,
        "job_id": job_id,
        "title": title,
        "company": company,
        "generated_json_file": temp_json_name,
        "generated_data": modified_dict,
        "output_pdf_folder": output_pdf_folder,
        "pdf_files": pdf_files
    }


@app.get('/health')
def health():
    return "== Server Healthy and Listening =="


if __name__ == '__main__':
    import uvicorn
    from dotenv import load_dotenv
    load_dotenv()

    port = int(os.getenv("JOB_SCRAPER_PORT", 8080))
    host = os.getenv("JOB_SCRAPER_HOST", "0.0.0.0")
    print(f"Starting Job Scraper API on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)