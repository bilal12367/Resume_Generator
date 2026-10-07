from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from app.schemas.naukri_schema import (
    NaukriSearchRequest,
    NaukriSearchResponse,
    NaukriJobDetailResponse
)
from app.services.naukri_service import NaukriService
from app.llm.agent import AgentDatabase

router = APIRouter()

# Reusable NaukriService instance
naukri_service = NaukriService()

@router.post("/search", response_model=NaukriSearchResponse, summary="Search Naukri Jobs (POST)")
async def search_jobs_endpoint(payload: NaukriSearchRequest):
    """
    Search for jobs on Naukri matching specified keywords, location, and experience filters.
    """
    try:
        jobs = await naukri_service.search_jobs(
            keywords=payload.keywords,
            location=payload.location or "",
            experience=payload.experience or "",
            page_no=payload.pageNo,
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
        raise HTTPException(status_code=500, detail=f"Failed to search jobs on Naukri: {str(e)}")


@router.get("/search", response_model=NaukriSearchResponse, summary="Search Naukri Jobs (GET)")
async def search_jobs_get_endpoint(
    keywords: str = Query(default="Software Engineer", description="Keywords or job titles"),
    location: str = Query(default="Bangalore", description="Job location"),
    experience: Optional[str] = Query(default="", description="Experience level in years"),
    pageNo: int = Query(default=1, ge=1, description="Page number"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=50)
):
    """
    GET endpoint for searching jobs on Naukri using query parameters.
    """
    try:
        jobs = await naukri_service.search_jobs(
            keywords=keywords,
            location=location,
            experience=experience or "",
            page_no=pageNo,
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
        raise HTTPException(status_code=500, detail=f"Failed to search jobs on Naukri: {str(e)}")


@router.get("/jobs/details/{job_id}", response_model=NaukriJobDetailResponse, summary="Get Naukri Job Description")
@router.get("/jobs/detail/{job_id}", response_model=NaukriJobDetailResponse, summary="Get Naukri Job Description")
@router.get("/job/{job_id}", response_model=NaukriJobDetailResponse, summary="Get Naukri Job Description")
async def get_job_description_endpoint(job_id: str, job_url: Optional[str] = Query(default=None)):
    """
    Fetch complete metadata, description, required skills, and location for a specific Naukri Job ID.
    Checks persistent DB cache first (segregated by job_source='naukri'). Passes full job_url if provided.
    """
    try:
        db = AgentDatabase()
        cached = db.get_cached_job_description(job_id, job_source="naukri")
        if cached and cached.get("raw_description") and len(cached.get("raw_description", "").strip()) > 20 and "unavailable" not in cached.get("raw_description", "").lower():
            return cached

        job_detail = await naukri_service.get_job_description(job_id, job_url=job_url or "")
        if not job_detail or not job_detail.get("job_id"):
            raise HTTPException(status_code=404, detail=f"Job with ID '{job_id}' not found on Naukri or description unavailable.")

        try:
            db.save_job_description(job_detail, job_source="naukri")
        except Exception as e:
            pass

        return job_detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job description for '{job_id}': {str(e)}")


@router.get("/jobs/saved", summary="Get All Saved Naukri Jobs from Database")
async def get_saved_jobs_endpoint(
    job_ids: Optional[str] = Query(default=None, description="Optional comma-separated job IDs to filter")
):
    """
    Fetches job descriptions stored in database table `job_descriptions` specifically for job_source='naukri'.
    Supports optional comma-separated `job_ids` parameter to filter specific jobs.
    """
    try:
        from app.models.agent_model import DBJobDescription
        db = AgentDatabase()
        with db.SessionLocal() as session:
            query = session.query(DBJobDescription).filter(DBJobDescription.job_source == "naukri")
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
                    "job_source": jd.job_source,
                    "created_at": str(jd.created_at) if jd.created_at else None
                })
            return {"count": len(jobs), "jobs": jobs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch saved Naukri jobs: {str(e)}")


class BulkSaveNaukriJobsRequest(BaseModel):
    job_ids: List[str] = Field(..., description="List of Naukri job IDs to save into database")

@router.post("/jobs/save-bulk", summary="Bulk Save Naukri Jobs to Database")
async def save_naukri_jobs_bulk_endpoint(payload: BulkSaveNaukriJobsRequest):
    """
    Asynchronously fetches details for a batch of Naukri job IDs and caches them in DB with job_source='naukri'.
    """
    try:
        await naukri_service.save_job_details_bulk(payload.job_ids)
        return {"status": "success", "message": f"Bulk save initiated for {len(payload.job_ids)} Naukri jobs."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk save Naukri jobs: {str(e)}")
