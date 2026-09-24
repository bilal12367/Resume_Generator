from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime, timezone
from app.db.connection import Base

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    profile_name = Column(String(255), nullable=False)
    user_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ATSWorkflowSession(Base):
    __tablename__ = "ats_workflow_sessions"

    session_id = Column(String(255), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    status = Column(String(50), default="CREATED", nullable=False)
    profile_id = Column(Integer, nullable=True)
    job_id = Column(String(255), nullable=True)
    pdf_filename = Column(String(255), nullable=True)
    pdf_links = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class GeneratedATS(Base):
    __tablename__ = "generated_ats"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), index=True, nullable=False)
    profile_id = Column(Integer, default=0)
    job_id = Column(String(255), nullable=False)
    ats_json_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
