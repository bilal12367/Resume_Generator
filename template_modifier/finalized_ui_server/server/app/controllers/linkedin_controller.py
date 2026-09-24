from fastapi import APIRouter, HTTPException, Query
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
async def get_saved_jobs_endpoint():
    """
    Fetches all job descriptions stored in MySQL database table `job_descriptions`.
    Returns list of saved job objects with title, company, location, posted_time, seniority_level, skills_required, etc.
    """
    try:
        db = AgentDatabase()
        with db.engine.connect() as conn:
            from sqlalchemy import text
            query = text("""
                SELECT job_id, title, company_name, location, posted_time, num_applicants,
                       seniority_level, employment_type, job_function, job_url,
                       minimal_description, raw_description, skills_required, created_at
                FROM job_descriptions
                ORDER BY created_at DESC
            """)
            result = conn.execute(query)
            jobs = []
            for row in result.mappings():
                d = dict(row)
                if d.get("skills_required"):
                    try:
                        import json
                        d["skills_required"] = json.loads(d["skills_required"])
                    except Exception:
                        pass
                if d.get("created_at"):
                    d["created_at"] = str(d["created_at"])
                jobs.append(d)
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



