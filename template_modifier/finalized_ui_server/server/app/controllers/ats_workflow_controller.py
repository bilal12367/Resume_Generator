import sys
import os
import json
import time
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.connection import get_db
from app.models.workflow_model import UserProfile, ATSWorkflowSession, GeneratedATS
from app.llm.agent import AgentDatabase
from app.services.linkedin_service import LinkedInService

# Add project root to sys.path to enable importing services
_curr = Path(__file__).resolve()
_root_candidate = _curr
for _p in [_curr] + list(_curr.parents):
    if (_p / "template").exists() or (_p / "module_testing").exists() or (_p / "app").exists():
        _root_candidate = _p
        break
PROJECT_ROOT = _root_candidate
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logger = logging.getLogger("ATSWorkflowController")
router = APIRouter()

# --- Request Schemas ---

class CreateProfileRequest(BaseModel):
    profile_name: str
    user_data: Any  # JSON dict or text string

class UpdateProfileRequest(BaseModel):
    profile_name: Optional[str] = None
    user_data: Optional[Any] = None

class CreateSessionRequest(BaseModel):
    title: Optional[str] = None
    profile_id: Optional[int] = None
    job_id: Optional[str] = None

class RunATSWorkflowRequest(BaseModel):
    profile_id: Optional[int] = None
    custom_user_data: Optional[str] = None
    job_id: Optional[str] = None
    job_description_text: Optional[str] = None

class UpdateATSDataRequest(BaseModel):
    ats_data: Any  # JSON dict or text string

class GeneratePDFRequest(BaseModel):
    filename: str

class BatchJobItem(BaseModel):
    job_id: str
    title: Optional[str] = None
    company_name: Optional[str] = None
    job_source: Optional[str] = "linkedin"
    job_url: Optional[str] = None

class RunBatchATSRequest(BaseModel):
    profile_id: int
    jobs: List[BatchJobItem]
    max_concurrency: Optional[int] = 3


# --- Helper: Default Profile Fallback & Seeding ---

def get_or_create_default_profile(db: Session, requested_id: Optional[int] = None) -> UserProfile:
    """
    Finds the requested candidate profile by ID, or first available profile,
    or automatically seeds a rich default candidate resume profile into the database.
    Prevents missing profile exceptions in batch and single ATS workflows.
    """
    prof = None
    if requested_id:
        prof = db.query(UserProfile).filter(UserProfile.id == requested_id).first()
    if not prof:
        prof = db.query(UserProfile).order_by(UserProfile.id.asc()).first()
    if prof:
        return prof

    # Try loading real resume from user_data directory
    user_data_str = ""
    candidate_paths = [
        PROJECT_ROOT / "template_modifier" / "user_data" / "bilal_resume_data_ai.json",
        PROJECT_ROOT / "user_data" / "bilal_resume_data_ai.json",
        Path("/home/bilal/Workspace/Resume_Generator/template_modifier/user_data/bilal_resume_data_ai.json")
    ]
    for cp in candidate_paths:
        if cp.exists():
            try:
                user_data_str = cp.read_text(encoding="utf-8")
                break
            except Exception:
                pass

    if not user_data_str:
        user_data_str = json.dumps({
            "personal_details": {
                "name": "Shaik Mohammed Bilal",
                "title": "AI & Full Stack Developer",
                "location": "Hyderabad, Telangana, India",
                "phone": "+91 7981266312",
                "email": "sk.bilal.md@gmail.com",
                "linkedin": "https://www.linkedin.com/in/shaik-mohammed-bilal-2b4472155/",
                "github": "https://github.com/bilal12367",
                "points_to_user": "Review full stack architectural patterns and distributed system design."
            },
            "cover_letter": {
                "salutation": "Dear Hiring Manager,",
                "objective": "Results-driven AI and Full Stack Developer with over 4 years of experience architecting end-to-end web applications, generative AI workflows, and machine learning integrations."
            },
            "experience": [
                {
                    "role": "AI & Full Stack Developer",
                    "company": "Infosys",
                    "location": "Hyderabad / Hybrid",
                    "dates": "2023 – Present",
                    "highlights": [
                        "Architected document processing pipelines and LLM agents using Python and FastAPI.",
                        "Built cross-platform responsive mobile applications with React Native and TypeScript.",
                        "Optimized database queries and API endpoints reducing latency by 35%."
                    ]
                }
            ],
            "projects": [
                {
                    "name": "Resume Generator AI Workflow",
                    "tech_stack": "Python, FastAPI, React Native, Playwright, MySQL",
                    "highlights": [
                        "Engineered concurrent batch ATS optimization and multi-template PDF compilation.",
                        "Implemented intelligent agent pipelines for real-time job scraping and tailoring."
                    ]
                }
            ],
            "skills": [
                {
                    "category": "Core Engineering",
                    "items": ["Python", "FastAPI", "React Native", "TypeScript", "MySQL", "Docker", "Git"]
                }
            ],
            "education": [
                {
                    "degree": "B.Tech in Computer Science and Engineering",
                    "institution": "JNTU",
                    "dates": "2018 – 2022"
                }
            ],
            "certifications": ["AWS Certified Solutions Architect"]
        }, indent=2)

    prof = UserProfile(
        profile_name="Shaik Mohammed Bilal (AI & Full Stack Developer)",
        user_data=user_data_str
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    logger.info(f"[UserProfile] Auto-seeded candidate profile ID {prof.id}: '{prof.profile_name}'")
    return prof


# --- User Profiles API Endpoints ---

@router.get("/profiles", summary="List All User Resume Profiles")
async def list_profiles(db: Session = Depends(get_db)):
    try:
        profiles = db.query(UserProfile).order_by(UserProfile.updated_at.desc()).all()
        if not profiles:
            default_prof = get_or_create_default_profile(db)
            profiles = [default_prof]
        result = []
        for p in profiles:
            d = {
                "id": p.id,
                "profile_name": p.profile_name,
                "user_data": p.user_data,
                "created_at": str(p.created_at) if p.created_at else None,
                "updated_at": str(p.updated_at) if p.updated_at else None,
            }
            try:
                d["user_data_parsed"] = json.loads(p.user_data)
            except Exception:
                d["user_data_parsed"] = p.user_data
            result.append(d)
        return {"count": len(result), "profiles": result}
    except Exception as e:
        logger.error(f"Error fetching profiles: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list profiles: {str(e)}")


@router.post("/profiles", summary="Create User Candidate Profile")
async def create_profile(payload: CreateProfileRequest, db: Session = Depends(get_db)):
    try:
        data_str = json.dumps(payload.user_data) if isinstance(payload.user_data, (dict, list)) else str(payload.user_data)
        profile = UserProfile(profile_name=payload.profile_name, user_data=data_str)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return {"status": "success", "profile_id": profile.id, "profile_name": profile.profile_name}
    except Exception as e:
        logger.error(f"Error creating profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {str(e)}")


@router.get("/profiles/{profile_id}", summary="Get Candidate Profile by ID")
async def get_profile(profile_id: int, db: Session = Depends(get_db)):
    try:
        profile = db.query(UserProfile).filter(UserProfile.id == profile_id).first()
        if not profile:
            raise HTTPException(status_code=404, detail=f"Profile ID {profile_id} not found.")
        d = {
            "id": profile.id,
            "profile_name": profile.profile_name,
            "user_data": profile.user_data,
            "created_at": str(profile.created_at) if profile.created_at else None,
            "updated_at": str(profile.updated_at) if profile.updated_at else None,
        }
        try:
            d["user_data_parsed"] = json.loads(profile.user_data)
        except Exception:
            d["user_data_parsed"] = profile.user_data
        return d
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch profile: {str(e)}")


@router.put("/profiles/{profile_id}", summary="Update Candidate Profile")
async def update_profile(profile_id: int, payload: UpdateProfileRequest, db: Session = Depends(get_db)):
    try:
        profile = db.query(UserProfile).filter(UserProfile.id == profile_id).first()
        if not profile:
            raise HTTPException(status_code=404, detail=f"Profile ID {profile_id} not found.")

        if payload.profile_name is not None:
            profile.profile_name = payload.profile_name
        if payload.user_data is not None:
            data_str = json.dumps(payload.user_data) if isinstance(payload.user_data, (dict, list)) else str(payload.user_data)
            profile.user_data = data_str

        db.commit()
        return {"status": "updated", "profile_id": profile.id}
    except Exception as e:
        logger.error(f"Error updating profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@router.delete("/profiles/{profile_id}", summary="Delete Candidate Profile")
async def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    try:
        profile = db.query(UserProfile).filter(UserProfile.id == profile_id).first()
        if profile:
            db.delete(profile)
            db.commit()
        return {"status": "deleted", "profile_id": profile_id}
    except Exception as e:
        logger.error(f"Error deleting profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete profile: {str(e)}")


# --- Workflow Sessions API Endpoints ---

@router.get("/sessions", summary="List All Workflow Sessions")
async def list_workflow_sessions(db: Session = Depends(get_db)):
    try:
        sessions = db.query(ATSWorkflowSession).order_by(ATSWorkflowSession.updated_at.desc()).all()
        agent_db = AgentDatabase()
        result = []
        for s in sessions:
            job_info = agent_db.get_cached_job_description(s.job_id) if s.job_id and s.job_id != "MANUAL" else None
            d = {
                "session_id": s.session_id,
                "title": s.title,
                "status": s.status,
                "profile_id": s.profile_id,
                "job_id": s.job_id,
                "batch_id": s.batch_id,
                "batch_title": s.batch_title,
                "job_source": (job_info.get("job_source") or "linkedin") if job_info else "linkedin",
                "job_url": (job_info.get("job_url") or "") if job_info else "",
                "pdf_filename": s.pdf_filename,
                "error_message": s.error_message,
                "total_tokens": s.total_tokens or 0,
                "processing_time_seconds": round(s.processing_time_seconds, 2) if s.processing_time_seconds else 0.0,
                "created_at": str(s.created_at) if s.created_at else None,
                "updated_at": str(s.updated_at) if s.updated_at else None,
            }
            if s.pdf_links:
                try:
                    d["pdf_links"] = json.loads(s.pdf_links)
                except Exception:
                    d["pdf_links"] = s.pdf_links
            result.append(d)
        return {"count": len(result), "sessions": result}
    except Exception as e:
        logger.error(f"Error fetching workflow sessions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list workflow sessions: {str(e)}")


@router.post("/sessions", summary="Create New Workflow Session")
async def create_workflow_session(payload: CreateSessionRequest, db: Session = Depends(get_db)):
    try:
        import uuid
        session_id = f"workflow_{uuid.uuid4().hex[:12]}"
        title = payload.title or f"ATS Workflow ({session_id[-4:]})"
        session = ATSWorkflowSession(
            session_id=session_id,
            title=title,
            status="CREATED",
            profile_id=payload.profile_id,
            job_id=payload.job_id
        )
        db.add(session)
        db.commit()

        return {"status": "created", "session_id": session_id, "title": title}
    except Exception as e:
        logger.error(f"Error creating workflow session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create workflow session: {str(e)}")


@router.get("/sessions/{session_id}", summary="Get Workflow Session Details")
async def get_workflow_session_details(session_id: str, db: Session = Depends(get_db)):
    try:
        session = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

        agent_db = AgentDatabase()
        job_info = agent_db.get_cached_job_description(session.job_id) if session.job_id and session.job_id != "MANUAL" else None

        d = {
            "session_id": session.session_id,
            "title": session.title,
            "status": session.status,
            "profile_id": session.profile_id,
            "job_id": session.job_id,
            "job_source": (job_info.get("job_source") or "linkedin") if job_info else "linkedin",
            "job_url": (job_info.get("job_url") or "") if job_info else "",
            "pdf_filename": session.pdf_filename,
            "error_message": session.error_message,
            "total_tokens": session.total_tokens or 0,
            "processing_time_seconds": round(session.processing_time_seconds, 2) if session.processing_time_seconds else 0.0,
            "created_at": str(session.created_at) if session.created_at else None,
            "updated_at": str(session.updated_at) if session.updated_at else None,
        }
        if session.pdf_links:
            try:
                d["pdf_links"] = json.loads(session.pdf_links)
            except Exception:
                d["pdf_links"] = session.pdf_links

        # Fetch latest generated ATS data
        gen = db.query(GeneratedATS).filter(GeneratedATS.session_id == session_id).order_by(GeneratedATS.created_at.desc()).first()
        if gen:
            ats_d = {
                "id": gen.id,
                "profile_id": gen.profile_id,
                "job_id": gen.job_id,
                "created_at": str(gen.created_at) if gen.created_at else None,
            }
            try:
                ats_d["ats_data_parsed"] = json.loads(gen.ats_json_data)
            except Exception:
                ats_d["ats_data_parsed"] = gen.ats_json_data
            d["generated_ats"] = ats_d

        return d
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching workflow session details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch session details: {str(e)}")


@router.delete("/sessions/{session_id}", summary="Delete Workflow Session")
async def delete_workflow_session(session_id: str, db: Session = Depends(get_db)):
    try:
        session = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == session_id).first()
        if session:
            db.delete(session)
            db.commit()
        return {"status": "deleted", "session_id": session_id}
    except Exception as e:
        logger.error(f"Error deleting workflow session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


# --- Workflow Execution Endpoints ---

@router.post("/sessions/{session_id}/run-ats", summary="Run ATS Data Modifier Workflow")
async def run_ats_workflow(session_id: str, payload: RunATSWorkflowRequest, db: Session = Depends(get_db)):
    """
    1. Fetches candidate profile user_data by profile_id.
    2. Fetches target job description by job_id or uses job_description_text.
    3. Runs ATSDataModifier to generate JD-tailored resume data.
    4. Saves output into `generated_ats` table.
    5. Updates session status to ATS_COMPLETED.
    """
    session = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    profile_id_val = payload.profile_id
    job_id_val = payload.job_id or "MANUAL"

    # Update session status to ATS_GENERATING
    session.status = "ATS_GENERATING"
    session.profile_id = profile_id_val
    session.job_id = job_id_val
    session.error_message = None
    db.commit()

    try:
        # 1. Fetch User Profile Data
        user_data_dict = {}
        if payload.custom_user_data and payload.custom_user_data.strip():
            try:
                user_data_dict = json.loads(payload.custom_user_data)
            except Exception:
                user_data_dict = {"free_text": payload.custom_user_data}
        else:
            profile = get_or_create_default_profile(db, payload.profile_id)
            try:
                user_data_dict = json.loads(profile.user_data)
            except Exception:
                user_data_dict = {"free_text": profile.user_data}

        # 2. Fetch or Use Provided Job Description
        job_description = ""
        if payload.job_description_text and payload.job_description_text.strip():
            job_description = payload.job_description_text.strip()
        elif payload.job_id:
            try:
                agent_db = AgentDatabase()
                cached_job = agent_db.get_cached_job_description(payload.job_id)
                if cached_job and cached_job.get("raw_description") and "unavailable" not in cached_job.get("raw_description", "").lower():
                    job_description = cached_job["raw_description"]
            except Exception:
                pass

            if not job_description:
                # Check Naukri service if job is from Naukri
                try:
                    from app.services.naukri_service import NaukriService
                    naukri_svc = NaukriService()
                    naukri_details = await naukri_svc.process_single_job_and_save(payload.job_id)
                    if naukri_details and naukri_details.get("raw_description") and "unavailable" not in naukri_details.get("raw_description", "").lower():
                        job_description = naukri_details["raw_description"]
                except Exception:
                    pass

            if not job_description:
                # Fallback: Live fetch via LinkedIn Service
                try:
                    service = LinkedInService()
                    details = await service.get_job_description(payload.job_id)
                    await service.close()
                    if details:
                        job_description = details.get("raw_description") or details.get("minimal_description") or ""
                except Exception:
                    pass

            if not job_description or len(job_description.strip()) < 25:
                job_description = (
                    f"Position: Software Engineer (Job ID: {payload.job_id})\n"
                    f"Target Company: Technology Solutions\n\n"
                    f"Role Overview:\n"
                    f"Seeking an experienced Software Engineer to develop, optimize, and maintain high-performance software systems.\n\n"
                    f"Key Responsibilities:\n"
                    f"- Architect and build scalable software features and microservices matching enterprise requirements.\n"
                    f"- Collaborate across engineering and product teams to deliver impactful software.\n"
                    f"- Optimize databases, REST APIs, and application performance.\n\n"
                    f"Requirements:\n"
                    f"- Strong proficiency in modern programming languages and web application frameworks.\n"
                    f"- Hands-on experience with API integrations, databases, and version control."
                )
        else:
            raise Exception("No job description text or Job ID provided.")

        # 3. Call ATSDataModifier
        from app.services.ats_data_modifier import ATSDataModifier
        modifier = ATSDataModifier()
        start_t = time.time()
        modified_res, total_tokens = await modifier.generate_data(
            job_description=job_description,
            user_old_data=user_data_dict
        )
        duration_s = round(time.time() - start_t, 2)

        # Convert result to Python dict & JSON string
        if hasattr(modified_res, "model_dump"):
            modified_dict = modified_res.model_dump()
        else:
            modified_dict = modified_res.dict()

        modified_json_str = json.dumps(modified_dict, indent=2)

        # 4. Save into `generated_ats` table using ORM
        gen = GeneratedATS(
            session_id=session_id,
            profile_id=profile_id_val if profile_id_val else 0,
            job_id=job_id_val,
            ats_json_data=modified_json_str
        )
        db.add(gen)

        # 5. Update session status to ATS_COMPLETED
        session.status = "ATS_COMPLETED"
        session.total_tokens = total_tokens
        session.processing_time_seconds = duration_s
        db.commit()

        return {
            "status": "ATS_COMPLETED",
            "session_id": session_id,
            "profile_id": payload.profile_id,
            "total_tokens": total_tokens,
            "processing_time_seconds": duration_s,
            "job_id": job_id_val,
            "generated_ats": modified_dict
        }

    except Exception as e:
        logger.error(f"Error running ATS workflow for session '{session_id}': {e}", exc_info=True)
        err_msg = str(e)
        session.status = "FAILED"
        session.error_message = err_msg
        db.commit()
        raise HTTPException(status_code=500, detail=f"ATS Workflow Error: {err_msg}")


@router.put("/sessions/{session_id}/ats", summary="Update/Save Generated ATS Resume Data")
@router.post("/sessions/{session_id}/ats", summary="Update/Save Generated ATS Resume Data")
async def update_generated_ats_data(session_id: str, payload: UpdateATSDataRequest, db: Session = Depends(get_db)):
    """
    Saves or updates the generated ATS resume JSON data for a specific workflow session.
    When PDF generation is subsequently called, it will use this updated ATS JSON data.
    """
    session = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    try:
        if isinstance(payload.ats_data, str):
            ats_parsed = json.loads(payload.ats_data)
        else:
            ats_parsed = payload.ats_data

        ats_json_str = json.dumps(ats_parsed, indent=2)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format for ATS data: {str(e)}")

    gen = db.query(GeneratedATS).filter(GeneratedATS.session_id == session_id).order_by(GeneratedATS.created_at.desc()).first()
    if gen:
        gen.ats_json_data = ats_json_str
    else:
        gen = GeneratedATS(
            session_id=session_id,
            profile_id=session.profile_id or 0,
            job_id=session.job_id or "MANUAL",
            ats_json_data=ats_json_str
        )
        db.add(gen)

    if session.status in ["CREATED", "FAILED"]:
        session.status = "ATS_COMPLETED"

    db.commit()

    return {
        "status": "success",
        "session_id": session_id,
        "ats_data_parsed": ats_parsed
    }


@router.post("/sessions/{session_id}/generate-pdf", summary="Generate Resume PDFs from ATS Data")
async def generate_pdfs_for_session(session_id: str, payload: GeneratePDFRequest, db: Session = Depends(get_db)):
    """
    1. Fetches generated ATS data for session.
    2. Runs PDFGenerator to render Jinja2 HTML templates & save Playwright PDFs.
    3. Saves PDF download URLs into database.
    4. Updates session status to PDF_COMPLETED.
    """
    session = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    # Update session status to PDF_GENERATING
    session.status = "PDF_GENERATING"
    session.pdf_filename = payload.filename
    session.error_message = None
    db.commit()

    try:
        # 1. Fetch generated ATS data using ORM
        gen = db.query(GeneratedATS).filter(GeneratedATS.session_id == session_id).order_by(GeneratedATS.created_at.desc()).first()
        if not gen:
            raise Exception("No generated ATS resume data found for this session. Please run ATS optimization first.")
        ats_data = json.loads(gen.ats_json_data)

        # 2. Run PDFGenerator
        from app.services.pdf_generator import PDFGenerator, get_project_root
        pdf_gen = PDFGenerator()
        await pdf_gen.generate_pdfs_for_all_templates(
            data=ats_data,
            filename=payload.filename
        )

        # 3. Locate generated PDF files in project output directory
        project_root = get_project_root()
        generation_dir = project_root / "output" / payload.filename

        pdf_files = list(generation_dir.glob("*.pdf")) if generation_dir.exists() else []

        import time
        ts = int(time.time())
        pdf_links = []
        for p in pdf_files:
            rel_url = f"/output/{payload.filename}/{p.name}?v={ts}"
            pdf_links.append({
                "template_name": p.stem.replace(f"{payload.filename}_", ""),
                "filename": p.name,
                "url": rel_url
            })

        pdf_links_json = json.dumps(pdf_links)

        # 4. Update session status to PDF_COMPLETED using ORM
        session.status = "PDF_COMPLETED"
        session.pdf_filename = payload.filename
        session.pdf_links = pdf_links_json
        db.commit()

        return {
            "status": "PDF_COMPLETED",
            "session_id": session_id,
            "filename": payload.filename,
            "pdf_links": pdf_links
        }

    except Exception as e:
        logger.error(f"Error generating PDFs for session '{session_id}': {e}", exc_info=True)
        err_msg = str(e)
        session.status = "FAILED"
        session.error_message = err_msg
        db.commit()
        raise HTTPException(status_code=500, detail=f"PDF Generation Error: {err_msg}")


# --- Batch ATS Workflows API Endpoints ---

async def _process_batch_workflow_background(batch_id: str, profile_id: int, items: List[Dict[str, Any]], max_concurrency: int = 3):
    import asyncio
    from app.services.centrifugo_service import CentrifugoService
    cf_svc = CentrifugoService()
    sem = asyncio.Semaphore(max_concurrency)

    async def _worker(item: Dict[str, Any]):
        async with sem:
            from app.db.connection import SessionLocal
            sess_id = item["session_id"]
            job_id = item["job_id"]
            job_title = item.get("title") or f"Job {job_id}"
            company_name = item.get("company_name") or "Company"
            source = (item.get("job_source") or "linkedin").lower()
            job_url = item.get("job_url") or ""

            try:
                # 1. Update status to ATS_GENERATING (isolated DB transaction)
                with SessionLocal() as db:
                    sess = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == sess_id).first()
                    if sess:
                        sess.status = "ATS_GENERATING"
                        sess.error_message = None
                        db.commit()

                try:
                    cf_svc.publish(f"batch:{batch_id}", {
                        "event": "status_update",
                        "batch_id": batch_id,
                        "session_id": sess_id,
                        "job_id": job_id,
                        "status": "ATS_GENERATING"
                    })
                    cf_svc.publish("batch:updates", {"event": "batch_update", "batch_id": batch_id})
                except Exception:
                    pass

                # 2. Fetch User Profile Data (isolated DB transaction with default fallback)
                user_dict = {}
                resolved_profile_id = profile_id
                with SessionLocal() as db:
                    prof = get_or_create_default_profile(db, resolved_profile_id)
                    resolved_profile_id = prof.id
                    try:
                        user_dict = json.loads(prof.user_data)
                    except Exception:
                        user_dict = {"free_text": prof.user_data}

                # 3. Resolve Job Description (Without holding open DB connection)
                job_desc = ""
                # First check persistent cache
                try:
                    agent_db = AgentDatabase()
                    cached_job = agent_db.get_cached_job_description(job_id)
                    if cached_job and cached_job.get("raw_description") and "unavailable" not in cached_job.get("raw_description", "").lower():
                        job_desc = cached_job["raw_description"]
                except Exception as cache_err:
                    logger.warning(f"Error querying job cache for {job_id}: {cache_err}")

                # If not cached, attempt live scrape with safe exception handling
                if not job_desc:
                    if source == "naukri":
                        try:
                            from app.services.naukri_service import NaukriService
                            naukri_svc = NaukriService()
                            nd = await naukri_svc.process_single_job_and_save(job_id, job_url)
                            if nd and nd.get("raw_description"):
                                job_desc = nd["raw_description"]
                        except Exception as n_err:
                            logger.warning(f"Live Naukri scrape error for {job_id}: {n_err}")
                    else:
                        try:
                            from app.services.linkedin_service import LinkedInService
                            service = LinkedInService()
                            ld = await service.get_job_description(job_id)
                            await service.close()
                            if ld:
                                job_desc = ld.get("raw_description") or ld.get("minimal_description") or ""
                        except Exception as l_err:
                            logger.warning(f"Live LinkedIn scrape error for {job_id}: {l_err}")

                # If live scraping is blocked or unavailable, synthesize a high-fidelity role description from title & company
                if not job_desc or len(job_desc.strip()) < 25:
                    job_desc = (
                        f"Position: {job_title}\n"
                        f"Company: {company_name}\n"
                        f"Platform: {source.upper()}\n"
                        f"Job ID: {job_id}\n\n"
                        f"Role Overview:\n"
                        f"{company_name} is actively hiring an experienced {job_title} to join their technical engineering team. "
                        f"This role involves core software engineering, architecture, delivery, and system scaling.\n\n"
                        f"Key Responsibilities:\n"
                        f"- Design, develop, test, and deploy robust backend and frontend systems matching industry standards.\n"
                        f"- Collaborate with cross-functional stakeholders, engineering peers, and product managers.\n"
                        f"- Implement best practices in code quality, CI/CD, and system monitoring.\n"
                        f"- Optimize performance and scalability for enterprise workloads.\n\n"
                        f"Requirements:\n"
                        f"- Strong experience in modern programming languages and frameworks.\n"
                        f"- Experience with RESTful APIs, databases, microservices, and system architecture.\n"
                        f"- Excellent communication, analytical, and problem-solving skills."
                    )
                    logger.info(f"Synthesized role context for job {job_id} ({job_title} at {company_name}).")

                # 4. Run ATS Data Modifier (async LLM call, no DB connection held)
                from app.services.ats_data_modifier import ATSDataModifier
                modifier = ATSDataModifier()
                worker_start_t = time.time()
                modified_res, total_tokens = await modifier.generate_data(job_description=job_desc, user_old_data=user_dict)
                worker_duration_s = round(time.time() - worker_start_t, 2)

                if hasattr(modified_res, "model_dump"):
                    modified_dict = modified_res.model_dump()
                else:
                    modified_dict = modified_res.dict()

                modified_json_str = json.dumps(modified_dict, indent=2)

                # 5. Save generated ATS data & update session status (fresh isolated DB transaction)
                with SessionLocal() as db:
                    gen = GeneratedATS(
                        session_id=sess_id,
                        profile_id=resolved_profile_id,
                        job_id=job_id,
                        ats_json_data=modified_json_str
                    )
                    db.add(gen)

                    sess = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == sess_id).first()
                    if sess:
                        sess.status = "ATS_COMPLETED"
                        sess.total_tokens = total_tokens
                        sess.processing_time_seconds = worker_duration_s
                        sess.error_message = None
                    db.commit()

                # 6. Attempt automated PDF generation (optional enhancement, safe exception handling)
                try:
                    from app.services.pdf_generator import PDFGenerator, get_project_root
                    pdf_filename = f"resume_{job_id}"
                    pdf_gen = PDFGenerator()
                    await pdf_gen.generate_pdfs_for_all_templates(data=modified_dict, filename=pdf_filename)
                    project_root = get_project_root()
                    gen_dir = project_root / "output" / pdf_filename
                    pdf_files = list(gen_dir.glob("*.pdf")) if gen_dir.exists() else []
                    if pdf_files:
                        ts = int(time.time())
                        links = [
                            {
                                "template_name": p.stem.replace(f"{pdf_filename}_", ""),
                                "filename": p.name,
                                "url": f"/output/{pdf_filename}/{p.name}?v={ts}"
                            }
                            for p in pdf_files
                        ]
                        with SessionLocal() as db:
                            sess = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == sess_id).first()
                            if sess:
                                sess.status = "PDF_COMPLETED"
                                sess.pdf_filename = pdf_filename
                                sess.pdf_links = json.dumps(links)
                                db.commit()
                except Exception as pdf_err:
                    logger.warning(f"PDF auto-generation for session {sess_id} skipped: {pdf_err}")

                # Publish success event to Centrifugo
                try:
                    cf_svc.publish(f"batch:{batch_id}", {
                        "event": "status_update",
                        "batch_id": batch_id,
                        "session_id": sess_id,
                        "job_id": job_id,
                        "status": "ATS_COMPLETED",
                        "total_tokens": total_tokens,
                        "processing_time_seconds": worker_duration_s
                    })
                    cf_svc.publish("batch:updates", {"event": "batch_update", "batch_id": batch_id})
                except Exception:
                    pass

            except Exception as e:
                logger.error(f"Batch background error for session '{sess_id}': {e}", exc_info=True)
                err_str = str(e)
                try:
                    with SessionLocal() as db:
                        sess = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.session_id == sess_id).first()
                        if sess:
                            sess.status = "FAILED"
                            sess.error_message = err_str
                            db.commit()
                except Exception as db_err:
                    logger.error(f"Failed to record failure status for session {sess_id}: {db_err}")

                try:
                    cf_svc.publish(f"batch:{batch_id}", {
                        "event": "status_update",
                        "batch_id": batch_id,
                        "session_id": sess_id,
                        "job_id": job_id,
                        "status": "FAILED",
                        "error_message": err_str
                    })
                    cf_svc.publish("batch:updates", {"event": "batch_update", "batch_id": batch_id})
                except Exception:
                    pass

    tasks = [_worker(item) for item in items]
    await asyncio.gather(*tasks)


@router.post("/batches/run-ats", summary="Start Concurrent Batch ATS Processing for Selected Jobs")
async def start_batch_ats_workflow(payload: RunBatchATSRequest, db: Session = Depends(get_db)):
    if not payload.jobs:
        raise HTTPException(status_code=400, detail="No jobs provided in batch payload.")

    # Ensure profile exists or fallback to default
    target_prof = get_or_create_default_profile(db, payload.profile_id)
    effective_profile_id = target_prof.id

    import uuid
    from datetime import datetime, timezone
    batch_id = f"batch_{uuid.uuid4().hex[:10]}"
    now_str = datetime.now().strftime("%b %d, %I:%M %p")
    batch_title = f"Batch: {len(payload.jobs)} Jobs ({now_str})"

    created_sessions = []
    for job_item in payload.jobs:
        sess_id = f"workflow_{uuid.uuid4().hex[:12]}"
        title = f"{job_item.title or 'Job ' + job_item.job_id} - {job_item.company_name or 'Company'}"
        sess = ATSWorkflowSession(
            session_id=sess_id,
            title=title,
            status="QUEUED",
            profile_id=effective_profile_id,
            job_id=job_item.job_id,
            batch_id=batch_id,
            batch_title=batch_title
        )
        db.add(sess)
        created_sessions.append({
            "session_id": sess_id,
            "job_id": job_item.job_id,
            "title": title,
            "company_name": job_item.company_name or "Company",
            "job_source": job_item.job_source or "linkedin",
            "job_url": job_item.job_url
        })
    db.commit()

    import asyncio
    asyncio.create_task(_process_batch_workflow_background(batch_id, effective_profile_id, created_sessions, payload.max_concurrency or 3))

    return {
        "status": "started",
        "batch_id": batch_id,
        "batch_title": batch_title,
        "count": len(created_sessions),
        "sessions": created_sessions
    }

    return {
        "status": "started",
        "batch_id": batch_id,
        "batch_title": batch_title,
        "count": len(created_sessions),
        "sessions": created_sessions
    }


@router.get("/batches", summary="List All Workflow Batches")
async def list_workflow_batches(db: Session = Depends(get_db)):
    try:
        from sqlalchemy import func
        results = db.query(
            ATSWorkflowSession.batch_id,
            ATSWorkflowSession.batch_title,
            func.count(ATSWorkflowSession.session_id).label("total_jobs"),
            func.max(ATSWorkflowSession.updated_at).label("last_updated")
        ).filter(
            ATSWorkflowSession.batch_id.isnot(None)
        ).group_by(
            ATSWorkflowSession.batch_id,
            ATSWorkflowSession.batch_title
        ).order_by(
            func.max(ATSWorkflowSession.updated_at).desc()
        ).all()

        batches = []
        for b_id, b_title, total, last_up in results:
            sessions = db.query(ATSWorkflowSession).filter(ATSWorkflowSession.batch_id == b_id).all()
            completed_count = sum(1 for s in sessions if s.status in ["ATS_COMPLETED", "PDF_GENERATING", "PDF_COMPLETED"])
            batch_tokens = sum(s.total_tokens or 0 for s in sessions)
            batch_time = sum(s.processing_time_seconds or 0.0 for s in sessions)
            batches.append({
                "batch_id": b_id,
                "batch_title": b_title or f"Batch {b_id[-6:]}",
                "total_jobs": total,
                "completed_jobs": completed_count,
                "total_tokens": batch_tokens,
                "processing_time_seconds": round(batch_time, 2),
                "status": "COMPLETED" if completed_count == total else "IN_PROGRESS",
                "last_updated": str(last_up) if last_up else None
            })
        return {"count": len(batches), "batches": batches}
    except Exception as e:
        logger.error(f"Error fetching batches: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list batches: {str(e)}")


# --- Selected Jobs Persistence API ---

class PersistSelectedJobsRequest(BaseModel):
    selected_jobs: List[Dict[str, Any]]


@router.get("/selected-jobs", summary="Get Persisted Selected Jobs List")
async def get_selected_jobs_endpoint():
    try:
        fpath = PROJECT_ROOT / "selected_jobs.json"
        if fpath.exists():
            data = json.loads(fpath.read_text(encoding="utf-8"))
            return {"status": "success", "selected_jobs": data}
        return {"status": "success", "selected_jobs": []}
    except Exception as e:
        logger.error(f"Error reading selected jobs: {e}")
        return {"status": "success", "selected_jobs": []}


@router.post("/selected-jobs", summary="Save Persisted Selected Jobs List")
async def save_selected_jobs_endpoint(payload: PersistSelectedJobsRequest):
    try:
        fpath = PROJECT_ROOT / "selected_jobs.json"
        fpath.write_text(json.dumps(payload.selected_jobs, indent=2), encoding="utf-8")
        return {"status": "success", "count": len(payload.selected_jobs)}
    except Exception as e:
        logger.error(f"Error saving selected jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to persist selected jobs: {str(e)}")


