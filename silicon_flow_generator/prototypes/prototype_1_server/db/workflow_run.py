from db.connection import Base
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, JSON, ForeignKey
from sqlalchemy.orm import relationship as rs
import uuid
from sqlalchemy.sql import func

class WorkflowRun(Base):
    __tablename__ = 'workflowruns'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String(100))
    
    # --- THE FIX ---
    # 1. Add the physical column to store the ID of the session
    session_id = Column(String(36), ForeignKey("workflow_sessions.id"))
    
    # 2. Keep the relationship (this is the Python-side helper)
    workflow = rs("WorkflowSession", back_populates="run_ids")
    # ---------------

    status = Column(String(50))
    is_error = Column(Boolean, default=False)
    message = Column(Text) # Changed from Boolean to Text so you can store the error message
    
    start_time = Column(DateTime, server_default=func.now())
    end_time = Column(DateTime, onupdate=func.now()) # Automatically updates when the run finishes
    
    model_input = Column(Text)
    model_output = Column(Text)
    total_tokens = Column(Integer, default=0)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)


class WorkflowSession(Base):
    __tablename__ = 'workflow_sessions'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # back_populates matches the 'workflow' variable in WorkflowRun
    run_ids = rs("WorkflowRun", back_populates='workflow')
    
    start_time = Column(DateTime, server_default=func.now())
    end_time = Column(DateTime)
    final_output = Column(Text)
    is_error = Column(Boolean, default=False)
    error_details = Column(JSON)