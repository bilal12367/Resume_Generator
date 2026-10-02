from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from app.schemas.linkedin_schema import (
    LinkedInSearchRequest,
    LinkedInSearchResponse,
    LinkedInJobDetailResponse,
    JobAgentChatRequest,
    JobAgentChatResponse
)
from app.services.linkedin_service import LinkedInService
from app.services.centrifugo_service import CentrifugoService
from app.llm.job_search_agent import JobSearchAgent, get_session_events
from app.llm.agent import AgentDatabase

router = APIRouter()

# Reusable LinkedInService instance
linkedin_service = LinkedInService()

@router.post("/search", response_model=LinkedInSearchResponse, summary="Search LinkedIn Jobs (POST)")
async def search_jobs_endpoint(payload: LinkedInSearchRequest):
    """
    Search for jobs on LinkedIn matching specified keywords, locations, and time filters.
    """
    try:
        jobs = await linkedin_service.search_jobs(
            keywords=payload.keywords,
            locations=payload.locations,
            experience_level=payload.experience_level or "",
            posted_within=payload.posted_within,
            offset=payload.offset,
            limit=payload.limit
        )
        return {
            "count": len(jobs),
            "offset": payload.offset,
            "limit": payload.limit,
            "jobs": jobs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search jobs on LinkedIn: {str(e)}")


@router.get("/search", response_model=LinkedInSearchResponse, summary="Search LinkedIn Jobs (GET)")
async def search_jobs_get_endpoint(
    keywords: str = Query(default="Software Engineer", description="Keywords or job titles"),
    location: str = Query(default="Remote", description="Job location"),
    experience_level: Optional[str] = Query(default=None, description="Experience level"),
    posted_within: Optional[str] = Query(default=None, description="Time filter (e.g. 24h, 1d, 7d)"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=50)
):
    """
    GET endpoint for searching jobs on LinkedIn using query parameters.
    """
    try:
        jobs = await linkedin_service.search_jobs(
            keywords=keywords,
            locations=location,
            experience_level=experience_level or "",
            posted_within=posted_within,
            offset=offset,
            limit=limit
        )
        return {
            "count": len(jobs),
            "offset": offset,
            "limit": limit,
            "jobs": jobs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search jobs on LinkedIn: {str(e)}")


@router.get("/jobs/details/{job_id}", response_model=LinkedInJobDetailResponse, summary="Get LinkedIn Job Description")
@router.get("/jobs/detail/{job_id}", response_model=LinkedInJobDetailResponse, summary="Get LinkedIn Job Description")
@router.get("/job/{job_id}", response_model=LinkedInJobDetailResponse, summary="Get LinkedIn Job Description")
async def get_job_description_endpoint(job_id: str):
    """
    Fetch complete metadata, description, required skills, and location for a specific LinkedIn Job ID.
    Checks persistent DB cache first before launching web scraper.
    """
    try:
        db = AgentDatabase()
        cached = db.get_cached_job_description(job_id)
        if cached:
            return cached

        job_detail = await linkedin_service.get_job_description(job_id)
        if not job_detail or not job_detail.get("job_id"):
            raise HTTPException(status_code=404, detail=f"Job with ID '{job_id}' not found or description unavailable.")

        try:
            db.save_job_description(job_detail)
        except Exception as e:
            pass

        return job_detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job description for '{job_id}': {str(e)}")


@router.post("/agent/chat", response_model=JobAgentChatResponse, summary="Chat with LinkedIn Job Search Agent")
async def job_agent_chat_endpoint(payload: JobAgentChatRequest):
    """
    Interactive chat endpoint for Job Search Agent.
    Gathers preferences, performs job searches, presents HITL selections,
    and returns real-time delta events.
    """
    try:
        agent_instance = JobSearchAgent(session_id=payload.session_id)
        result = await agent_instance.chat(payload.message)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Job Agent Chat Error: {str(e)}")


@router.get("/agent/events/{session_id}", summary="Get Job Agent Session Events")
async def get_job_agent_events_endpoint(session_id: str):
    """
    Retrieves buffered real-time delta events (thinking, answering, tool calls, token usage) for a session.
    """
    events = get_session_events(session_id)
    return {"session_id": session_id, "count": len(events), "events": events}


@router.get("/agent/logs/{session_id}", summary="Get Job Agent DB Status Logs")
async def get_job_agent_logs_endpoint(session_id: str):
    """
    Fetches persistent status log entries recorded in the database for a session.
    """
    try:
        db = AgentDatabase()
        logs = db.get_agent_logs(session_id)
        return {"session_id": session_id, "count": len(logs), "logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch DB logs: {str(e)}")


@router.get("/jobs/saved", summary="Get All Saved LinkedIn Jobs from Database")
async def get_saved_jobs_endpoint(
    job_ids: Optional[str] = Query(default=None, description="Optional comma-separated job IDs to filter")
):
    """
    Fetches job descriptions stored in database table `job_descriptions`.
    Supports optional comma-separated `job_ids` parameter to fetch specific jobs.
    """
    try:
        from app.models.agent_model import DBJobDescription
        db = AgentDatabase()
        with db.SessionLocal() as session:
            query = session.query(DBJobDescription)
            if job_ids:
                id_list = [j.strip() for j in job_ids.split(",") if j.strip()]
                if id_list:
                    query = query.filter(DBJobDescription.job_id.in_(id_list))

            rows = query.order_by(DBJobDescription.created_at.desc()).all()
            jobs = []
            for jd in rows:
                skills_val = []
                if jd.skills_required:
                    try:
                        import json
                        skills_val = json.loads(jd.skills_required)
                    except Exception:
                        pass
                jobs.append({
                    "job_id": jd.job_id,
                    "title": jd.title,
                    "company_name": jd.company_name,
                    "location": jd.location,
                    "posted_time": jd.posted_time,
                    "num_applicants": jd.num_applicants,
                    "seniority_level": jd.seniority_level,
                    "employment_type": jd.employment_type,
                    "job_function": jd.job_function,
                    "job_url": jd.job_url,
                    "minimal_description": jd.minimal_description,
                    "raw_description": jd.raw_description,
                    "skills_required": skills_val,
                    "created_at": str(jd.created_at) if jd.created_at else None
                })
            return {"count": len(jobs), "jobs": jobs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch saved jobs: {str(e)}")


@router.get("/agent/sessions", summary="Get All Saved Agent Sessions")
async def get_agent_sessions_endpoint():
    """
    Fetches all active/historical agent chat session IDs recorded in the database.
    """
    try:
        db = AgentDatabase()
        sessions = db.get_all_sessions()
        return {"count": len(sessions), "sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch agent sessions: {str(e)}")


@router.get("/agent/history/{session_id}", summary="Get Session Chat Message History")
async def get_agent_history_endpoint(session_id: str):
    """
    Fetches stored conversation messages, delta events, and cached HITL job IDs for a specific agent session from MySQL DB.
    """
    try:
        db = AgentDatabase()
        messages = db.get_all_messages(session_id)
        events = db.get_session_events(session_id)
        cached_jobs = db.get_session_jobs(session_id)
        job_ids = [j["job_id"] for j in cached_jobs if j.get("job_id")]
        return {
            "session_id": session_id,
            "count": len(messages),
            "messages": messages,
            "events": events,
            "cached_jobs": cached_jobs,
            "job_ids": job_ids
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch message history: {str(e)}")


@router.delete("/agent/session/{session_id}", summary="Delete Agent Chat Session")
async def delete_agent_session_endpoint(session_id: str):
    """
    Deletes an agent chat session and all associated messages, logs, token records, and cached jobs from backend database.
    """
    try:
        db = AgentDatabase()
        db.delete_session(session_id)
        from app.llm.job_search_agent import clear_session_events
        clear_session_events(session_id)
        return {"status": "success", "message": f"Session '{session_id}' deleted successfully.", "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete agent session: {str(e)}")


class UpdateSessionTitleRequest(BaseModel):
    title: str = Field(..., description="New title/name for the chat session")

@router.put("/agent/session/{session_id}/title", summary="Update Agent Chat Session Title")
@router.patch("/agent/session/{session_id}/title", summary="Update Agent Chat Session Title")
async def update_agent_session_title_endpoint(session_id: str, payload: UpdateSessionTitleRequest):
    """
    Updates or renames the display title for a chat session in backend database.
    """
    try:
        new_title = payload.title.strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        db = AgentDatabase()
        db.update_session_title(session_id, new_title)
        return {
            "status": "success",
            "message": f"Session '{session_id}' title updated successfully.",
            "session_id": session_id,
            "title": new_title
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update session title: {str(e)}")


@router.get("/centrifugo/token", summary="Generate Centrifugo Connection JWT Token")
async def get_centrifugo_token_endpoint(user_id: str = Query(default="user_demo", description="Client user ID")):
    """
    Generates a signed Centrifugo JWT authentication token for client WebSocket connections.
    """
    try:
        cf_service = CentrifugoService()
        token = cf_service.generate_token(user_id=user_id)
        return {
            "user_id": user_id,
            "token": token,
            "ws_url": "ws://localhost:8008/connection/websocket"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Centrifugo token: {str(e)}")


class CreateSessionRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Optional custom session ID")
    title: Optional[str] = Field(None, description="Optional session title")
    system_prompt: Optional[str] = Field(None, description="System prompt to apply for this session")

@router.post("/agent/session/create", summary="Create New Agent Chat Session with System Prompt")
@router.post("/agent/session", summary="Create New Agent Chat Session")
async def create_agent_session_endpoint(payload: Optional[CreateSessionRequest] = None):
    """
    Creates a new chat session with optional title and custom system prompt.
    """
    try:
        import uuid
        s_id = (payload.session_id.strip() if payload and payload.session_id else str(uuid.uuid4()))
        title = payload.title.strip() if payload and payload.title else f"Session {s_id[:6]}"
        sp = payload.system_prompt.strip() if payload and payload.system_prompt else None

        db = AgentDatabase()
        db.save_session_metadata(session_id=s_id, title=title, system_prompt=sp)
        return {
            "status": "success",
            "session_id": s_id,
            "title": title,
            "system_prompt": sp
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create agent session: {str(e)}")


class CreateSystemPromptRequest(BaseModel):
    name: str = Field(..., description="Display name of system prompt")
    prompt_text: str = Field(..., description="Prompt instructions text")
    is_default: bool = Field(False, description="Whether to set as default prompt")

class UpdateSystemPromptRequest(BaseModel):
    name: Optional[str] = Field(None, description="Display name of system prompt")
    prompt_text: Optional[str] = Field(None, description="Prompt instructions text")
    is_default: Optional[bool] = Field(None, description="Whether to set as default prompt")


@router.get("/system-prompts", summary="Get All System Prompts")
async def get_system_prompts_endpoint():
    """
    Fetches all configured System Prompts.
    """
    try:
        db = AgentDatabase()
        prompts = db.get_all_system_prompts()
        return {"count": len(prompts), "prompts": prompts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch system prompts: {str(e)}")


@router.post("/system-prompts", summary="Create System Prompt")
async def create_system_prompt_endpoint(payload: CreateSystemPromptRequest):
    """
    Creates a new System Prompt entry.
    """
    try:
        if not payload.name.strip() or not payload.prompt_text.strip():
            raise HTTPException(status_code=400, detail="Name and prompt_text are required")
        db = AgentDatabase()
        p = db.create_system_prompt(
            name=payload.name.strip(),
            prompt_text=payload.prompt_text.strip(),
            is_default=payload.is_default
        )
        return {"status": "success", "prompt": p}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create system prompt: {str(e)}")


@router.put("/system-prompts/{prompt_id}", summary="Update System Prompt")
@router.patch("/system-prompts/{prompt_id}", summary="Update System Prompt")
async def update_system_prompt_endpoint(prompt_id: int, payload: UpdateSystemPromptRequest):
    """
    Updates an existing System Prompt entry.
    """
    try:
        db = AgentDatabase()
        p = db.update_system_prompt(
            prompt_id=prompt_id,
            name=payload.name.strip() if payload.name is not None else None,
            prompt_text=payload.prompt_text.strip() if payload.prompt_text is not None else None,
            is_default=payload.is_default
        )
        if not p:
            raise HTTPException(status_code=404, detail=f"System prompt with ID {prompt_id} not found")
        return {"status": "success", "prompt": p}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update system prompt: {str(e)}")


@router.delete("/system-prompts/{prompt_id}", summary="Delete System Prompt")
async def delete_system_prompt_endpoint(prompt_id: int):
    """
    Deletes a System Prompt entry by ID.
    """
    try:
        db = AgentDatabase()
        ok = db.delete_system_prompt(prompt_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"System prompt with ID {prompt_id} not found")
        return {"status": "success", "prompt_id": prompt_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete system prompt: {str(e)}")


@router.post("/system-prompts/{prompt_id}/set-default", summary="Set System Prompt as Default")
async def set_default_system_prompt_endpoint(prompt_id: int):
    """
    Sets a System Prompt as active default.
    """
    try:
        db = AgentDatabase()
        ok = db.set_default_system_prompt(prompt_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"System prompt with ID {prompt_id} not found")
        return {"status": "success", "prompt_id": prompt_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set default system prompt: {str(e)}")



