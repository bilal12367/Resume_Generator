from db.connection import Base
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, JSON, ForeignKey
from sqlalchemy.orm import relationship as rs
import uuid
from sqlalchemy.sql import func

class WorkflowRun(Base):
    __tablename__ = 'workflowrun'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Total Token Consumption
    total_tokens: int = Column(Integer)
    
    # Total Time Taken for the workflow
    time_taken: str = Column(Integer)
    
    is_error: bool = Column(Boolean)
    
    # Final Output
    final_output: str = Column(Text)
    
    # Run outputs of each node.
    run_details: dict = Column(JSON)