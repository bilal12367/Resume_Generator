from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from service.workflow_service import WorkflowService as WS
from db.connection import get_db

class WorkflowRequest(BaseModel):
    user_data: dict
    color_custom_input: str = None

class WorkflowController:
    def __init__(self):
        # Class based api router for fast api
        self.router = APIRouter()
        self.router.add_api_route(
            '/workflow/start',
            self.start_workflow,
            methods=['POST']
        )

    async def start_workflow(self, request: WorkflowRequest, db: Session = Depends(get_db)):
        svc = WS(db)
        return await svc.start_workflow(user_data=str(request.user_data), color_custom_input=request.color_custom_input)