import sys
import os
import json
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
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
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

class GeneratePDFRequest(BaseModel):
    filename: str


# --- User Profiles API Endpoints ---

@router.get("/profiles", summary="List All User Resume Profiles")
async def list_profiles(db: Session = Depends(get_db)):
    try:
        profiles = db.query(UserProfile).order_by(UserProfile.updated_at.desc()).all()
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
        result = []
        for s in sessions:
            d = {
                "session_id": s.session_id,
                "title": s.title,
                "status": s.status,
                "profile_id": s.profile_id,
                "job_id": s.job_id,
                "pdf_filename": s.pdf_filename,
                "error_message": s.error_message,
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

        d = {
            "session_id": session.session_id,
            "title": session.title,
            "status": session.status,
            "profile_id": session.profile_id,
            "job_id": session.job_id,
            "pdf_filename": session.pdf_filename,
            "error_message": session.error_message,
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
        if payload.profile_id:
            profile = db.query(UserProfile).filter(UserProfile.id == payload.profile_id).first()
            if not profile:
                raise Exception(f"User profile ID {payload.profile_id} not found.")
            try:
                user_data_dict = json.loads(profile.user_data)
            except Exception:
                user_data_dict = {"free_text": profile.user_data}
        elif payload.custom_user_data:
            try:
                user_data_dict = json.loads(payload.custom_user_data)
            except Exception:
                user_data_dict = {"free_text": payload.custom_user_data}
        else:
            raise Exception("Please select a candidate profile or enter custom user data.")

        # 2. Fetch or Use Provided Job Description
        if payload.job_description_text and payload.job_description_text.strip():
            job_description = payload.job_description_text.strip()
        elif payload.job_id:
            agent_db = AgentDatabase()
            cached_job = agent_db.get_cached_job_description(payload.job_id)
            if cached_job and cached_job.get("raw_description"):
                job_description = cached_job["raw_description"]
            else:
                # Fallback: Live fetch via Playwright LinkedIn Service
                service = LinkedInService()
                details = await service.get_job_details(payload.job_id)
                await service.close()
                job_description = details.get("raw_description") or details.get("minimal_description") or ""
        else:
            raise Exception("No job description text or Job ID provided.")

        if not job_description:
            raise Exception("Job Description text could not be resolved.")

        # 3. Call ATSDataModifier
        from app.services.ats_data_modifier import ATSDataModifier
        modifier = ATSDataModifier()
        modified_res = await modifier.generate_data(
            job_description=job_description,
            user_old_data=user_data_dict
        )

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
        db.commit()

        return {
            "status": "ATS_COMPLETED",
            "session_id": session_id,
            "profile_id": payload.profile_id,
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

        pdf_links = []
        for p in pdf_files:
            rel_url = f"http://localhost:8000/output/{payload.filename}/{p.name}"
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
