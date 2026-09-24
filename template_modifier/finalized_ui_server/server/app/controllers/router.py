from fastapi import APIRouter
from app.controllers import auth_controller, health_controller, linkedin_controller, ats_workflow_controller

api_router = APIRouter()
api_router.include_router(auth_controller.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(health_controller.router, tags=["Health Check"])
api_router.include_router(linkedin_controller.router, prefix="/linkedin", tags=["LinkedIn Jobs"])
api_router.include_router(ats_workflow_controller.router, prefix="/workflow", tags=["ATS Workflow"])
