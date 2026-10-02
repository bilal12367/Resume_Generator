from sqlalchemy import Column, Integer, String, Text, DateTime, UniqueConstraint, func
from datetime import datetime, timezone
from app.db.connection import Base

class DBMessage(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), nullable=False, index=True)
    role = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    token_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DBSummary(Base):
    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), nullable=False, unique=True)
    summary = Column(Text, nullable=False)
    last_summarized_message_id = Column(Integer, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class DBTokenUsage(Base):
    __tablename__ = "token_usage"

    session_id = Column(String(255), primary_key=True)
    prompt_tokens = Column(Integer, default=0, nullable=False)
    completion_tokens = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class DBAgentLog(Base):
    __tablename__ = "agent_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), nullable=False, index=True)
    status = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DBSessionJob(Base):
    __tablename__ = "session_jobs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), nullable=False)
    message_id = Column(String(255), nullable=True, index=True)
    job_id = Column(String(255), nullable=False)
    job_title = Column(String(255), nullable=True)
    company = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("session_id", "job_id", "message_id", name="idx_session_job_msg"),
    )


class DBSessionMetadata(Base):
    __tablename__ = "session_metadata"

    session_id = Column(String(255), primary_key=True)
    title = Column(String(255), nullable=False)
    system_prompt = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class DBSessionEvent(Base):
    __tablename__ = "session_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), nullable=False, index=True)
    event_type = Column(String(100), nullable=False)
    data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DBJobDescription(Base):
    __tablename__ = "job_descriptions"

    job_id = Column(String(255), primary_key=True)
    title = Column(String(255), nullable=True)
    company_name = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    posted_time = Column(String(100), nullable=True)
    num_applicants = Column(String(100), nullable=True)
    seniority_level = Column(String(100), nullable=True)
    employment_type = Column(String(100), nullable=True)
    job_function = Column(String(100), nullable=True)
    job_url = Column(String(500), nullable=True)
    minimal_description = Column(Text, nullable=True)
    raw_description = Column(Text, nullable=True)
    skills_required = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DBSystemPrompt(Base):
    __tablename__ = "system_prompts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    prompt_text = Column(Text, nullable=False)
    is_default = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

