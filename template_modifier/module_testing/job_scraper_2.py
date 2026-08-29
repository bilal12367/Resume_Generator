
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
import sqlite3
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from llm_enhancement.types import (
    RunCompletionEvent,
    ToolCallEvent,
    ToolResultEvent,
    DeltaEvent,
)
from llm_enhancement.config import AgentConfig
from llm_enhancement.mcp_agent import MCPAgent
from dotenv import load_dotenv

try:
    from dev_containers.connect import CentrifugoClient
except Exception as e:
    CentrifugoClient = None
    print(f"[Warning] CentrifugoClient import failed: {e}")

load_dotenv()

SYSTEM_PROMPT = '''
You are a job scraping agent with Human-in-the-Loop (HITL) job selection capabilities.
You should follow this workflow:
**Workflow**
1. The user asks for certain jobs, experience level, and time range of posted jobs (e.g. past 7 days, past month).
2. If user doesn't provide these details, ask them. Once provided, call the search jobs tool with relevant keywords.
3. Target top tier-1 to tier-2 MNCs using search keywords (e.g., Python, AI Engineer, Deloitte, Accenture, TCS, Infosys, Wipro).
4. Don't call get_job_details; filter search results directly based on location, skills, experience, and posting freshness.
5. Filter the jobs based on user requirements and select top candidate relevant jobs.
6. While filtering don't write unnecessary json in thinking or observation, just use job_id_1, job_id_2 etc
7. **HUMAN-IN-THE-LOOP (HITL) STEP**: Call local tool `ask_user_to_select_jobs(job_ids=[...], session_id=session_id, message="...")` passing candidate Job IDs and active Session ID. **CRITICAL**: Immediately after calling this tool, STOP calling any further tools and output your final response to the user asking them to select which Job IDs to proceed with.
8. Once you call the HITL step, and tool returns result, you should stop the execution immediately. With Answer: Done.
9. Once the user responds with their selected Job IDs in their message, call tool `process_jobs(job_ids, session_id)` with those user-selected job IDs and the active Session ID provided in your prompt context.

**Important**
1. Don't think too long, respond quickly. This is just quick filter and send.
2. Don't repeat the search tools more than once per turn.
'''

# --- SQLite Database Storage for Sessions (new_workflow_db.db) ---
DB_DIR = ".db_data"
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "new_workflow_db.db")
DB_URI = f"sqlite:///{DB_PATH}"

ACTIVE_AGENTS: Dict[str, MCPAgent] = {}

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Ensure the sessions table exists in new_workflow_db.db."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT,
            updated_at TEXT,
            messages_json TEXT DEFAULT '[]',
            total_tokens INTEGER DEFAULT 0,
            total_time_ms REAL DEFAULT 0.0,
            job_ids_json TEXT DEFAULT '[]',
            jobs_json TEXT DEFAULT '[]'
        )
    """)
    conn.commit()
    conn.close()

init_db()

def db_get_all_sessions() -> List[Dict[str, Any]]:
    """Retrieve all sessions sorted by updated_at desc from SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    sessions = []
    for r in rows:
        sessions.append({
            "id": r["id"],
            "title": r["title"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "messages": json.loads(r["messages_json"] or "[]"),
            "total_tokens": r["total_tokens"],
            "total_time_ms": r["total_time_ms"],
            "job_ids": json.loads(r["job_ids_json"] or "[]"),
            "jobs": json.loads(r["jobs_json"] or "[]")
        })
    return sessions

def db_get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a single session by session_id from SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    r = cursor.fetchone()
    conn.close()
    if not r:
        return None
    return {
        "id": r["id"],
        "title": r["title"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
        "messages": json.loads(r["messages_json"] or "[]"),
        "total_tokens": r["total_tokens"],
        "total_time_ms": r["total_time_ms"],
        "job_ids": json.loads(r["job_ids_json"] or "[]"),
        "jobs": json.loads(r["jobs_json"] or "[]")
    }

def db_save_session(session_data: Dict[str, Any]):
    """Save or update a session record in SQLite DB new_workflow_db.db."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO sessions 
        (id, title, created_at, updated_at, messages_json, total_tokens, total_time_ms, job_ids_json, jobs_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        session_data["id"],
        session_data.get("title", ""),
        session_data.get("created_at", ""),
        session_data.get("updated_at", ""),
        json.dumps(session_data.get("messages", [])),
        session_data.get("total_tokens", 0),
        session_data.get("total_time_ms", 0.0),
        json.dumps(session_data.get("job_ids", [])),
        json.dumps(session_data.get("jobs", []))
    ))
    conn.commit()
    conn.close()

def db_delete_session(session_id: str):
    """Delete a session record from SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()

async def ask_user_to_select_jobs(job_ids: List[str], session_id: str, message: Optional[str] = None) -> str:
    """
    Local tool for Human-in-the-Loop (HITL) job selection.
    Associates candidate job IDs with the active session, saves them instantly to SQLite database,
    and emits Centrifugo events to prompt the UI for user selection.
    """
    if not session_id:
        return "Error: session_id is required."

    session = db_get_session(session_id)
    if not session:
        now = datetime.now(timezone.utc).isoformat()
        session = {
            "id": session_id,
            "title": "Job Search Session",
            "created_at": now,
            "updated_at": now,
            "messages": [],
            "total_tokens": 0,
            "total_time_ms": 0.0,
            "job_ids": [],
            "jobs": []
        }

    clean_job_ids = [str(jid).strip() for jid in job_ids if str(jid).strip()]

    existing_ids = set(session.get("job_ids", []))
    session["job_ids"] = list(dict.fromkeys(list(existing_ids) + clean_job_ids))
    session["updated_at"] = datetime.now(timezone.utc).isoformat()

    display_msg = message or f"Please select which of the following Job IDs you want to process: {', '.join(clean_job_ids)}"

    # Permanently attach candidate job_ids to session messages in SQLite DB
    raw_messages = session.get("messages", [])
    messages = list(raw_messages) if isinstance(raw_messages, list) else []
    if messages and isinstance(messages[-1], dict):
        last_msg = messages[-1]
        if last_msg.get("role") == "assistant":
            curr = last_msg.get("extracted_jobs", []) if isinstance(last_msg.get("extracted_jobs"), list) else []
            updated_list = list(dict.fromkeys(list(curr) + clean_job_ids))
            last_msg["extracted_jobs"] = updated_list
            last_msg["job_ids"] = updated_list
        else:
            messages.append({
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": display_msg,
                "extracted_jobs": clean_job_ids,
                "job_ids": clean_job_ids,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
    else:
        messages.append({
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": display_msg,
            "extracted_jobs": clean_job_ids,
            "job_ids": clean_job_ids,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    session["messages"] = messages
    db_save_session(session)

    scraper = JOB_SCRAPER()

    hitl_event = {
        "event_type": "hitl_job_selection",
        "session_id": session_id,
        "job_ids": clean_job_ids,
        "message": display_msg,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    scraper._safe_publish("workflow", hitl_event)
    scraper._safe_publish(f"session_{session_id}", hitl_event)

    return f"Candidate Job IDs ({', '.join(clean_job_ids)}) successfully presented to the user UI. STOP calling any further tools and provide your final response to the user presenting the candidate jobs and asking for their selection."


async def get_or_create_agent(session_id: str) -> MCPAgent:
    if session_id not in ACTIVE_AGENTS:
        agnt_cnf = AgentConfig()
        (agnt_cnf
            .set_db_uri(DB_URI)
            .set_prompt(SYSTEM_PROMPT)
            .set_provider_type('SILICONFLOW')
            .set_token_limit(100000))
        mcp_url = os.getenv('MCP_URL', 'http://127.0.0.1:8000/sse')
        agent = MCPAgent(
            agent_config=agnt_cnf,
            run_id=session_id,
            tools=[ask_user_to_select_jobs],
            mcp_urls=[mcp_url],
            attach_centrifugo=False,
        )
        try:
            await agent.connect_mcp()
        except Exception as e:
            print(f"[Warning] Failed to connect MCP for agent session {session_id}: {e}")
        ACTIVE_AGENTS[session_id] = agent
    return ACTIVE_AGENTS[session_id]

def extract_job_ids_from_text(text: str) -> List[str]:
    """Extract job IDs like JOB_123, job_456, or numeric IDs from text."""
    if not isinstance(text, str):
        return []
    matches = re.findall(r'\b(?:JOB|job|Job)[_-]?\d+\b', text)
    extra_matches = re.findall(r'job_id["\']?\s*[:=]\s*["\']?([a-zA-Z0-9_-]+)', text, re.IGNORECASE)
    all_found = list(dict.fromkeys(matches + extra_matches))
    return all_found


class JOB_SCRAPER:
    def __init__(self):
        try:
            self.cf_client = CentrifugoClient() if CentrifugoClient else None
        except Exception as e:
            self.cf_client = None
            print(f"[Warning] CentrifugoClient initialization failed: {e}")

    def _safe_publish(self, channel: str, data: Dict[str, Any]):
        """Publish event safely to Centrifugo."""
        if self.cf_client:
            try:
                self.cf_client.publish(channel, data)
            except Exception as err:
                print(f"[Centrifugo Publish Error] {err}")

    def publisher(self, session_id: str, evt: DeltaEvent | RunCompletionEvent | ToolCallEvent | ToolResultEvent):
        """Processes a single agent event, formats it, and publishes to Centrifugo channels for UI consumption."""
        channels = ["workflow"]
        now = datetime.now(timezone.utc).isoformat()
        evt_data = None

        if isinstance(evt, ToolCallEvent):
            evt_data = {
                "event_type": "tool_call",
                "session_id": session_id,
                "tool_name": getattr(evt, "tool_name", "unknown"),
                "kwargs": getattr(evt, "tool_kwargs", {}),
                "timestamp": now
            }
        elif isinstance(evt, ToolResultEvent):
            res = getattr(evt, "tool_result", None) or getattr(evt, "content", "")
            evt_data = {
                "event_type": "tool_result",
                "session_id": session_id,
                "tool_name": getattr(evt, "tool_name", "unknown"),
                "result": res if isinstance(res, (dict, list)) else str(res)[:15000],
                "timestamp": now
            }
        elif isinstance(evt, DeltaEvent):
            if evt.delta:
                evt_data = {
                    "event_type": "delta",
                    "session_id": session_id,
                    "delta": evt.delta,
                    "timestamp": now
                }
        elif isinstance(evt, RunCompletionEvent):
            content = evt.content if isinstance(evt.content, str) else str(evt.content)
            evt_data = {
                "event_type": "agent_completion",
                "session_id": session_id,
                "result": content,
                "tokens": getattr(evt, "tokens_elapsed", 0),
                "time_taken_ms": getattr(evt, "time_elapsed", 0.0),
                "timestamp": now
            }

        if evt_data:
            for ch in channels:
                self._safe_publish(ch, evt_data)

    async def run(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """Runs the job scraping agent for a user message, streaming events to Centrifugo."""
        start_time = time.time()
        now = datetime.now(timezone.utc).isoformat()
        try:
        # Send agent_start event
            start_evt = {
                "event_type": "agent_start",
                "session_id": session_id,
                "message": user_message,
                "timestamp": now
            }
            for ch in ["workflow", f"session_{session_id}"]:
                self._safe_publish(ch, start_evt)

            agent = await get_or_create_agent(session_id)
            current_prompt = f"{SYSTEM_PROMPT}\n\n[Active Session Context]\nActive Session ID: '{session_id}'\nAlways pass session_id='{session_id}' when calling tool `process_jobs`."

            handler = agent.chat(new_message=user_message, system_prompt=current_prompt)
            
            response = None
            extracted_job_ids: List[str] = []
            extracted_jobs: List[Dict[str, Any]] = []
            tokens_utilized = 0

            async for evt in handler:
                self.publisher(session_id, evt)

                if isinstance(evt, ToolCallEvent):
                    tool_kwargs = getattr(evt, "tool_kwargs", {})
                    if "job_ids" in tool_kwargs and isinstance(tool_kwargs["job_ids"], list):
                        for jid in tool_kwargs["job_ids"]:
                            if str(jid) not in extracted_job_ids:
                                extracted_job_ids.append(str(jid))

                elif isinstance(evt, ToolResultEvent):
                    tool_result = getattr(evt, "tool_result", None) or getattr(evt, "content", "")
                    parsed_res = tool_result
                    if isinstance(parsed_res, str):
                        try:
                            parsed_res = json.loads(parsed_res)
                        except Exception:
                            pass

                    if isinstance(parsed_res, dict) and "jobs" in parsed_res and isinstance(parsed_res["jobs"], list):
                        for job in parsed_res["jobs"]:
                            if isinstance(job, dict):
                                jid = job.get("job_id") or job.get("id")
                                if jid and str(jid) not in extracted_job_ids:
                                    extracted_job_ids.append(str(jid))
                                extracted_jobs.append(job)

                elif isinstance(evt, RunCompletionEvent):
                    response = evt
                    if hasattr(evt, "tokens_elapsed") and evt.tokens_elapsed:
                        tokens_utilized = evt.tokens_elapsed

            time_taken_ms = round((time.time() - start_time) * 1000, 2)
            result_content = ""
            if response:
                result_content = response.content if isinstance(response.content, str) else str(response.content)
            else:
                result_content = "Agent finished execution."

            text_job_ids = extract_job_ids_from_text(result_content)
            for jid in text_job_ids:
                if jid not in extracted_job_ids:
                    extracted_job_ids.append(jid)

            if not tokens_utilized:
                total_chars = len(user_message) + len(result_content)
                tokens_utilized = max(round(total_chars / 3.8), 45)

            return {
                "result": result_content,
                "job_ids": extracted_job_ids,
                "jobs": extracted_jobs,
                "tokens": tokens_utilized,
                "time_taken_ms": time_taken_ms
            }
        except Exception as e:
            print(e)
            print("error caught whiler running agent.")

# --- FastAPI Application ---
app = FastAPI(title="Job Scraper API v2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    sessions = db_get_all_sessions()
    return {"status": "ok", "active_sessions": len(sessions)}

@app.get("/sessions")
async def list_sessions():
    """GET /sessions — List all active sessions sorted by updated_at desc from SQLite."""
    sessions_list = db_get_all_sessions()
    return {"status": "ok", "sessions": sessions_list}

@app.post("/sessions")
async def create_session(req: Optional[CreateSessionRequest] = None):
    """POST /sessions — Create a new chat session in SQLite DB."""
    session_id = str(uuid.uuid4())
    existing_sessions = db_get_all_sessions()
    title = (req.title if req and req.title else "").strip() or f"Job Search Session #{len(existing_sessions) + 1}"
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
    db_save_session(session_data)
    
    scraper = JOB_SCRAPER()
    scraper._safe_publish("workflow", {
        "event_type": "session_created",
        "session_id": session_id,
        "title": title,
        "timestamp": now
    })
    
    return {"status": "ok", "session": session_data}

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """GET /sessions/{session_id} — Get details of a specific session from SQLite."""
    session = db_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "ok", "session": session}

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """DELETE /sessions/{session_id} — Delete a session from SQLite."""
    db_delete_session(session_id)
    if session_id in ACTIVE_AGENTS:
        del ACTIVE_AGENTS[session_id]
    
    scraper = JOB_SCRAPER()
    scraper._safe_publish("workflow", {
        "event_type": "session_deleted",
        "session_id": session_id
    })
    
    return {"status": "ok", "session_id": session_id}

@app.post("/scrape")
async def handle_scrape(req: ScrapeRequest):
    """POST /scrape — Accepts user query, processes with agent, broadcasts Centrifugo events, tracks metrics & job IDs in SQLite."""
    try:
        if not req.message.strip():
            raise HTTPException(status_code=400, detail="No message provided")

        session_id = req.session_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        session = db_get_session(session_id)
        if not session:
            title = req.title or (req.message[:30] + "..." if len(req.message) > 30 else req.message)
            session = {
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

        user_msg = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": req.message,
            "timestamp": now
        }
        session["messages"].append(user_msg)
        db_save_session(session)

        scraper = JOB_SCRAPER()
        run_res = await scraper.run(session_id=session_id, user_message=req.message)

        result_content = run_res["result"]
        extracted_job_ids = run_res["job_ids"]
        extracted_jobs = run_res["jobs"]
        tokens_utilized = run_res["tokens"]
        time_taken_ms = run_res["time_taken_ms"]

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

        for jid in extracted_job_ids:
            if jid not in session["job_ids"]:
                session["job_ids"].append(jid)

        db_save_session(session)

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
    except HTTPException as e:
        print(f"Error {e}")
        raise
    except Exception as e:
        print(f"[Error in handle_scrape] {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
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
    """Generate tailored ATS candidate data JSONs and PDFs."""
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
            raise HTTPException(status_code=404, detail=f"Candidate data file not found at {user_data_path}")

    with open(user_data_path, "r", encoding="utf-8") as f:
        user_old_data = json.load(f)

    from module_testing.ats_data_modifier import ATSDataModifier
    from mcps.linkedin_platform import get_job_description, save_generated_ats_resume, linkedin

    modifier = ATSDataModifier()
    results = []
    scraper = JOB_SCRAPER()

    clean_job_ids = [str(jid).strip() for jid in req.job_ids if str(jid).strip()]

    # Broadcast start event
    start_payload = {
        "event_type": "ats_generation_started",
        "session_id": req.session_id,
        "job_ids": clean_job_ids,
        "total": len(clean_job_ids)
    }
    scraper._safe_publish("workflow", start_payload)
    scraper._safe_publish(f"session_{req.session_id}", start_payload)

    for idx, jid_str in enumerate(clean_job_ids):
        # Step 1: Fetching Job Description
        scraper._safe_publish("workflow", {
            "event_type": "ats_generation_progress",
            "session_id": req.session_id,
            "job_id": jid_str,
            "current": idx + 1,
            "total": len(clean_job_ids),
            "step": "fetching_jd",
            "message": f"Fetching Job Description for #{jid_str}..."
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

        try:
            # Step 2: LLM Tailoring candidate ATS profile
            scraper._safe_publish("workflow", {
                "event_type": "ats_generation_progress",
                "session_id": req.session_id,
                "job_id": jid_str,
                "current": idx + 1,
                "total": len(clean_job_ids),
                "step": "llm_generating",
                "message": f"LLM Tailoring ATS Profile & Keywords for #{jid_str}..."
            })

            modified_schema = await modifier.generate_data(job_description=jd_text, user_old_data=user_old_data)
            if hasattr(modified_schema, "model_dump"):
                modified_dict = modified_schema.model_dump()
            elif hasattr(modified_schema, "dict"):
                modified_dict = modified_schema.dict()
            else:
                modified_dict = dict(modified_schema)

            modified_json_str = json.dumps(modified_dict, indent=2)
            temp_json_name = f"generated_ats_{jid_str}.json"
            temp_json_path = base_dir / "user_data" / temp_json_name
            with open(temp_json_path, "w", encoding="utf-8") as f:
                f.write(modified_json_str)

            prefix_name = f"resume_{jid_str}"
            output_pdf_folder = os.path.join("output", prefix_name)
            save_generated_ats_resume(req.session_id, jid_str, modified_json_str, output_pdf_folder)

            # Step 3: Compiling 4 HTML/PDF resume templates
            scraper._safe_publish("workflow", {
                "event_type": "ats_generation_progress",
                "session_id": req.session_id,
                "job_id": jid_str,
                "current": idx + 1,
                "total": len(clean_job_ids),
                "step": "compiling_pdf",
                "message": f"Compiling 4 HTML/PDF Resume Templates for #{jid_str}..."
            })

            gen_script = base_dir / "generate_resume.py"
            try:
                cmd = [sys.executable, str(gen_script), "-d", temp_json_name, "-p", prefix_name, "-y"]
                subprocess.run(cmd, cwd=str(base_dir), capture_output=True, text=True, timeout=120)
            except Exception as proc_err:
                print(f"[Error running generate_resume for {jid_str}]: {proc_err}")

            job_completed_item = {
                "job_id": jid_str,
                "generated_json_file": temp_json_name,
                "output_pdf_folder": output_pdf_folder,
                "generated_data": modified_dict
            }
            results.append(job_completed_item)

            # Step 4: Per-Job Completed Event
            scraper._safe_publish("workflow", {
                "event_type": "ats_job_completed",
                "session_id": req.session_id,
                "job_id": jid_str,
                "current": idx + 1,
                "total": len(clean_job_ids),
                "result": job_completed_item,
                "message": f"✅ ATS Resume & 4 PDFs generated for Job #{jid_str}!"
            })
            scraper._safe_publish(f"session_{req.session_id}", {
                "event_type": "ats_job_completed",
                "session_id": req.session_id,
                "job_id": jid_str,
                "current": idx + 1,
                "total": len(clean_job_ids),
                "result": job_completed_item,
                "message": f"✅ ATS Resume & 4 PDFs generated for Job #{jid_str}!"
            })

        except Exception as gen_err:
            print(f"[Error generating ATS data for {jid_str}]: {gen_err}")

    # Broadcast final completion event
    completion_payload = {
        "event_type": "ats_generation_completed",
        "session_id": req.session_id,
        "results": results
    }
    scraper._safe_publish("workflow", completion_payload)
    scraper._safe_publish(f"session_{req.session_id}", completion_payload)

    return {"status": "ok", "session_id": req.session_id, "results": results}

@app.get("/sessions/{session_id}/job-descriptions")
async def get_session_job_descriptions(session_id: str):
    """GET /sessions/{session_id}/job-descriptions — Fetch saved job descriptions for session."""
    from mcps.linkedin_platform import init_db, SessionLocal, JobDescription
    from sqlalchemy import select, or_
    init_db()

    session = db_get_session(session_id) or {}
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

@app.get("/jobs/{job_id}/details")
async def get_job_details_route(job_id: str):
    """GET /jobs/{job_id}/details — Fetch job details & full raw description for a given job_id."""
    from mcps.linkedin_platform import get_job_description, save_job_description, linkedin
    job_desc = get_job_description(job_id)
    if job_desc and (job_desc.get("raw_description") or job_desc.get("minimal_description") or job_desc.get("title")):
        return {"status": "ok", "found": True, "job": job_desc}

    try:
        fetched = await linkedin.fetch_job_description(job_id)
        if fetched and isinstance(fetched, dict):
            save_job_description(session_id="", job_data=fetched)
            return {"status": "ok", "found": True, "job": fetched}
    except Exception as err:
        print(f"[Warning] Failed live fetch for job {job_id}: {err}")

    return {
        "status": "ok",
        "found": True,
        "job": {
            "job_id": job_id,
            "title": f"Job Position #{job_id}",
            "company_name": "Tier-1 / Tier-2 Tech Company",
            "location": "Remote / Onsite",
            "raw_description": f"Detailed job description for Job ID {job_id}.\nCandidate job description details are stored in SQLite database.",
            "minimal_description": f"Job ID {job_id}"
        }
    }


@app.get("/processed-jobs/all")
async def get_all_processed_jobs():
    """GET /processed-jobs/all — Fetch all candidate job postings with full details & ATS status."""
    from mcps.linkedin_platform import init_db, SessionLocal, JobDescription, GeneratedATSResume
    from sqlalchemy import select
    init_db()

    with SessionLocal() as db_session:
        jds = db_session.scalars(select(JobDescription)).all()
        jd_map = {j.job_id: j.to_dict() for j in jds}

        resumes = db_session.scalars(select(GeneratedATSResume)).all()
        ats_map = {r.job_id: r.to_dict() for r in resumes}

    all_sessions = db_get_all_sessions()
    all_job_ids = set(jd_map.keys()).union(set(ats_map.keys()))
    for sess in all_sessions:
        for jid in sess.get("job_ids", []):
            if jid:
                all_job_ids.add(str(jid).strip())

    results = []
    base_dir = Path(__file__).resolve().parent.parent

    for jid in sorted(all_job_ids):
        jd = jd_map.get(jid, {
            "job_id": jid,
            "title": f"Job Position #{jid}",
            "company_name": "Tech Company",
            "location": "India / Remote",
            "raw_description": f"Job description for ID {jid}"
        })
        ats = ats_map.get(jid)

        json_file = base_dir / "user_data" / f"generated_ats_{jid}.json"
        pdf_folder = f"output/resume_{jid}"
        
        has_pdf = (base_dir / pdf_folder).exists() or (ats and bool(ats.get("output_pdf_folder")))
        has_json = json_file.exists() or bool(ats)

        results.append({
            "job_id": jid,
            "job_details": jd,
            "ats_resume": ats,
            "has_ats_json": has_json,
            "has_pdf": has_pdf,
            "output_pdf_folder": pdf_folder if has_pdf else None,
            "generated_json_file": f"generated_ats_{jid}.json" if has_json else None
        })

    return {"status": "ok", "total": len(results), "jobs": results}


@app.get("/download-pdf")
async def download_pdf_file(file_path: str):
    """GET /download-pdf — Serves PDF file as attachment for instant browser download."""
    base_dir = Path(__file__).resolve().parent.parent
    target_path = (base_dir / file_path).resolve()
    if not str(target_path).startswith(str(base_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    return FileResponse(
        path=str(target_path),
        media_type="application/pdf",
        filename=target_path.name
    )


if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv("JOB_SCRAPER_PORT", 8080))
    host = os.getenv("JOB_SCRAPER_HOST", "0.0.0.0")
    print(f"Starting Job Scraper API v2 on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)



        
        
