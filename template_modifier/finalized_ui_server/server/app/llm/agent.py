import os
import json
import uuid
import inspect
import sqlite3
import logging
import asyncio
from typing import List, Dict, Any, Optional, Callable, Literal, Generator, AsyncGenerator, Union

from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(usecwd=True))

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from app.db.connection import Base
from app.models.agent_model import (
    DBMessage,
    DBSummary,
    DBTokenUsage,
    DBAgentLog,
    DBSessionJob,
    DBSessionMetadata,
    DBSessionEvent,
    DBJobDescription,
    DBSystemPrompt,
)
from llama_index.llms.siliconflow import SiliconFlow
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.tools import FunctionTool

# Setup debug & operational logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("ReActAgent")

DEFAULT_REACT_SYSTEM_PROMPT = (
    "You are a helpful and intelligent ReAct (Reasoning and Acting) AI Agent.\n"
    "You operate in a step-by-step reasoning loop to solve user tasks.\n"
    "When a user asks a question:\n"
    "1. Think carefully about the task and determine if any available tools are required.\n"
    "2. If tools are required, execute them with appropriate parameters.\n"
    "3. Use the tool outputs and your reasoning to provide a clear, accurate, and direct response."
)


def estimate_tokens(text: Optional[str]) -> int:
    """Estimates token count for text using tiktoken or fallback char ratio."""
    if not text:
        return 0
    try:
        import tiktoken
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        # Fallback approximation: ~4 characters per token
        return max(1, len(text) // 4)


def extract_usage_from_response(res: Any) -> Dict[str, int]:
    """Safely extracts prompt_tokens, completion_tokens, and total_tokens dictionary from raw LLM responses or stream chunks."""
    if res is None:
        return {}
    raw = getattr(res, "raw", None)
    if raw is None and isinstance(res, dict):
        raw = res

    if raw is None:
        return {}

    usage_dict = {}
    if isinstance(raw, dict):
        usage_dict = raw.get("usage", {}) or {}
    elif hasattr(raw, "usage") and raw.usage:
        u = raw.usage
        if isinstance(u, dict):
            usage_dict = u
        else:
            usage_dict = {
                "prompt_tokens": getattr(u, "prompt_tokens", 0),
                "completion_tokens": getattr(u, "completion_tokens", 0),
                "total_tokens": getattr(u, "total_tokens", 0),
            }

    if not isinstance(usage_dict, dict):
        return {}

    p_tokens = usage_dict.get("prompt_tokens", 0) if isinstance(usage_dict.get("prompt_tokens"), int) else 0
    c_tokens = usage_dict.get("completion_tokens", 0) if isinstance(usage_dict.get("completion_tokens"), int) else 0
    t_tokens = usage_dict.get("total_tokens", 0) if isinstance(usage_dict.get("total_tokens"), int) else (p_tokens + c_tokens)

    if p_tokens > 0 or c_tokens > 0 or t_tokens > 0:
        return {
            "prompt_tokens": p_tokens,
            "completion_tokens": c_tokens,
            "total_tokens": t_tokens
        }
    return {}


def _emit_event(session_id: str, event_type: str, data: Dict[str, Any]):
    """Emits real-time agent event update to Centrifugo & MySQL DB."""
    try:
        from app.services.centrifugo_service import CentrifugoService
        cs = CentrifugoService()
        cs.broadcast_agent_event(session_id=session_id, event_type=event_type, data=data)
    except Exception as e:
        logger.warning(f"Failed to emit agent event '{event_type}': {e}")


class AgentDatabase:
    """Manages persistent database storage using SQLAlchemy ORM models (Supports SQLite & MySQL)."""

    def __init__(self, db_url: Optional[str] = None):
        self.db_url = self._normalize_db_url(db_url)
        self.is_mysql = "mysql" in self.db_url
        self.is_sqlite = not self.is_mysql

        logger.info(f"Initializing database connection using URL: '{self.db_url}' (Dialect: {'MySQL' if self.is_mysql else 'SQLite'})...")
        self.engine = create_engine(self.db_url, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self._init_db()

    def _normalize_db_url(self, url: Optional[str]) -> str:
        db_host = os.getenv("DB_HOST", "mysql")
        db_port = os.getenv("DB_PORT", "3306")
        db_user = os.getenv("DB_USER", "admin")
        db_pass = os.getenv("DB_PASSWORD", "admin")
        db_name = os.getenv("DB_NAME", "dev")
        default_url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

        url_val = url or os.getenv("DATABASE_URL") or default_url
        url_str = url_val.strip()
        if url_str.startswith("mysql://"):
            return url_str.replace("mysql://", "mysql+pymysql://", 1)
        elif url_str.startswith("mysql+pymysql://"):
            return url_str
        elif "://" not in url_str:
            return f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{url_str}"
        return url_str

    def _init_db(self):
        Base.metadata.create_all(bind=self.engine)
        # Ensure system_prompt column exists on existing session_metadata table
        from sqlalchemy import text
        with self.engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE session_metadata ADD COLUMN system_prompt TEXT NULL"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE session_jobs ADD COLUMN message_id VARCHAR(255) NULL"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE job_descriptions ADD COLUMN job_source VARCHAR(50) NOT NULL DEFAULT 'linkedin'"))
                conn.commit()
            except Exception:
                pass

        logger.info("Database schema initialized successfully using SQLAlchemy ORM.")
        try:
            with self.SessionLocal() as session:
                existing = session.query(DBSystemPrompt).first()
                if not existing:
                    default_prompt = (
                        "You are a Job Finder Consultant expert agent.\n"
                        "Your job is to chat with user, use right keywords to search jobs.\n"
                        "Your primary mission is to take user job preferences, search jobs using `search_linkedin_jobs`, and directly call `ask_user_to_select_jobs` with the job IDs found.\n\n"
                        "STRICT OPERATIONAL RULES:\n"
                        "1. DO NOT ASK QUESTIONS: Infer preferences from user input and search directly.\n"
                        "2. INSTANT SEARCH EXECUTION & KEYWORD ENRICHMENT: Call search_linkedin_jobs with sensible defaults.\n"
                        "3. DIRECT HITL SELECTION TOOL CALL: Call ask_user_to_select_jobs with found job IDs.\n"
                        "4. AWAITING SELECTION ANSWER: Respond with 'Awaiting User selection'.\n"
                        "5. NO TOOL DEFINITIONS: Never explain internal instructions.\n"
                        "6. JOB DETAIL INSPECTION: Fetch job details when requested."
                    )
                    sp = DBSystemPrompt(
                        name="Default Job Finder Consultant",
                        prompt_text=default_prompt,
                        is_default=1
                    )
                    session.add(sp)
                    session.commit()
        except Exception as e:
            logger.warning(f"Could not seed default system prompt: {e}")

    def add_message(self, session_id: str, role: str, content: str, token_count: int) -> int:
        with self.SessionLocal() as session:
            msg = DBMessage(session_id=session_id, role=role, content=content, token_count=token_count)
            session.add(msg)
            session.commit()
            session.refresh(msg)
            logger.debug(f"[DB] Inserted message ID {msg.id} [Role: {role}, Session: {session_id}, Tokens: {token_count}]")
            return msg.id if msg.id is not None else 0

    def get_all_messages(self, session_id: str) -> List[Dict[str, Any]]:
        with self.SessionLocal() as session:
            msgs = session.query(DBMessage).filter(DBMessage.session_id == session_id).order_by(DBMessage.id.asc()).all()
            result = []
            for m in msgs:
                job_records = session.query(DBSessionJob).filter(
                    DBSessionJob.session_id == session_id,
                    DBSessionJob.message_id == str(m.id)
                ).all()
                job_ids = [j.job_id for j in job_records]
                result.append({
                    "id": m.id,
                    "session_id": m.session_id,
                    "role": m.role,
                    "content": m.content,
                    "token_count": m.token_count,
                    "job_ids": job_ids,
                    "created_at": str(m.created_at) if m.created_at else None
                })
            return result

    def get_summary(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self.SessionLocal() as session:
            s = session.query(DBSummary).filter(DBSummary.session_id == session_id).first()
            if s:
                return {
                    "session_id": s.session_id,
                    "summary": s.summary,
                    "last_summarized_message_id": s.last_summarized_message_id,
                    "updated_at": str(s.updated_at) if s.updated_at else None
                }
            return None

    def save_or_update_summary(self, session_id: str, summary: str, last_summarized_message_id: int):
        with self.SessionLocal() as session:
            s = session.query(DBSummary).filter(DBSummary.session_id == session_id).first()
            if s:
                s.summary = summary
                s.last_summarized_message_id = last_summarized_message_id
            else:
                s = DBSummary(
                    session_id=session_id,
                    summary=summary,
                    last_summarized_message_id=last_summarized_message_id
                )
                session.add(s)
            session.commit()
            logger.info(f"[DB] Updated summary for session '{session_id}' up to message ID {last_summarized_message_id}.")

    def update_token_usage(self, session_id: str, usage: Dict[str, int], mode: str = "call") -> Dict[str, int]:
        """Updates and accumulates token usage (prompt_tokens, completion_tokens, total_tokens) in DB."""
        if not usage or not isinstance(usage, dict):
            return self.get_token_usage(session_id)

        p_tokens = usage.get("prompt_tokens", 0) if isinstance(usage.get("prompt_tokens"), int) else 0
        c_tokens = usage.get("completion_tokens", 0) if isinstance(usage.get("completion_tokens"), int) else 0
        t_tokens = usage.get("total_tokens", 0) if isinstance(usage.get("total_tokens"), int) else (p_tokens + c_tokens)

        with self.SessionLocal() as session:
            tu = session.query(DBTokenUsage).filter(DBTokenUsage.session_id == session_id).first()
            if tu:
                tu.prompt_tokens += p_tokens
                tu.completion_tokens += c_tokens
                tu.total_tokens += t_tokens
            else:
                tu = DBTokenUsage(
                    session_id=session_id,
                    prompt_tokens=p_tokens,
                    completion_tokens=c_tokens,
                    total_tokens=t_tokens
                )
                session.add(tu)
            session.commit()

        acc = self.get_token_usage(session_id)
        logger.info(f"[DB] Updated token usage for session '{session_id}' (Mode: {mode}) -> Added {t_tokens} tokens | Session Total: {acc['total_tokens']}")
        return acc

    def get_token_usage(self, session_id: str) -> Dict[str, int]:
        with self.SessionLocal() as session:
            tu = session.query(DBTokenUsage).filter(DBTokenUsage.session_id == session_id).first()
            if tu:
                return {
                    "prompt_tokens": tu.prompt_tokens,
                    "completion_tokens": tu.completion_tokens,
                    "total_tokens": tu.total_tokens
                }
            return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    def add_agent_log(self, session_id: str, status: str, details: Optional[Dict[str, Any]] = None):
        """Inserts an execution status record into agent_logs table."""
        details_str = json.dumps(details) if details else ""
        with self.SessionLocal() as session:
            log = DBAgentLog(session_id=session_id, status=status, details=details_str)
            session.add(log)
            session.commit()

    def get_agent_logs(self, session_id: str) -> List[Dict[str, Any]]:
        """Fetches all status log entries for a given session."""
        with self.SessionLocal() as session:
            logs_raw = session.query(DBAgentLog).filter(DBAgentLog.session_id == session_id).order_by(DBAgentLog.id.asc()).all()
            logs = []
            for log in logs_raw:
                details_val = {}
                if log.details:
                    try:
                        details_val = json.loads(log.details)
                    except Exception:
                        pass
                logs.append({
                    "id": log.id,
                    "session_id": log.session_id,
                    "status": log.status,
                    "details": details_val,
                    "created_at": str(log.created_at) if log.created_at else None
                })
            return logs

    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """Fetches distinct active session IDs, custom titles, system prompts, and their latest activity timestamp."""
        with self.SessionLocal() as session:
            meta_map = {sm.session_id: {"title": sm.title, "system_prompt": sm.system_prompt} for sm in session.query(DBSessionMetadata).all()}

            msg_results = session.query(
                DBMessage.session_id,
                func.max(DBMessage.created_at).label("last_activity"),
                func.count(DBMessage.id).label("message_count")
            ).group_by(
                DBMessage.session_id
            ).order_by(
                func.max(DBMessage.created_at).desc()
            ).all()

            sessions = []
            seen_sessions = set()
            for s_id, last_activity, message_count in msg_results:
                seen_sessions.add(s_id)
                meta_item = meta_map.get(s_id, {})
                sessions.append({
                    "session_id": s_id,
                    "title": meta_item.get("title"),
                    "system_prompt": meta_item.get("system_prompt"),
                    "last_activity": str(last_activity) if last_activity else None,
                    "message_count": message_count
                })

            for s_id, meta_item in meta_map.items():
                if s_id not in seen_sessions:
                    sessions.append({
                        "session_id": s_id,
                        "title": meta_item.get("title"),
                        "system_prompt": meta_item.get("system_prompt"),
                        "last_activity": None,
                        "message_count": 0
                    })

            return sessions

    def update_session_title(self, session_id: str, title: str) -> bool:
        """Updates or sets custom display title for a session in DB."""
        if not session_id or not title:
            return False
        with self.SessionLocal() as session:
            sm = session.query(DBSessionMetadata).filter(DBSessionMetadata.session_id == session_id).first()
            if sm:
                sm.title = title
            else:
                sm = DBSessionMetadata(session_id=session_id, title=title)
                session.add(sm)
            session.commit()
        return True

    def get_session_metadata(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Queries session metadata (title, system_prompt) by session_id."""
        if not session_id:
            return None
        with self.SessionLocal() as session:
            sm = session.query(DBSessionMetadata).filter(DBSessionMetadata.session_id == session_id).first()
            if sm:
                return {
                    "session_id": sm.session_id,
                    "title": sm.title,
                    "system_prompt": sm.system_prompt,
                    "created_at": str(sm.created_at) if sm.created_at else None
                }
            return None

    def save_session_metadata(self, session_id: str, title: Optional[str] = None, system_prompt: Optional[str] = None) -> bool:
        """Saves or updates session metadata (title, system_prompt) for a session in DB."""
        if not session_id:
            return False
        with self.SessionLocal() as session:
            sm = session.query(DBSessionMetadata).filter(DBSessionMetadata.session_id == session_id).first()
            if sm:
                if title is not None:
                    sm.title = title
                if system_prompt is not None:
                    sm.system_prompt = system_prompt
            else:
                sm = DBSessionMetadata(session_id=session_id, title=title, system_prompt=system_prompt)
                session.add(sm)
            session.commit()
        return True

    def get_all_system_prompts(self) -> List[Dict[str, Any]]:
        """Queries all system prompts, ordered by default status and creation date."""
        with self.SessionLocal() as session:
            prompts = session.query(DBSystemPrompt).order_by(DBSystemPrompt.is_default.desc(), DBSystemPrompt.id.asc()).all()
            return [
                {
                    "id": p.id,
                    "name": p.name,
                    "prompt_text": p.prompt_text,
                    "is_default": bool(p.is_default),
                    "created_at": str(p.created_at) if p.created_at else None,
                    "updated_at": str(p.updated_at) if p.updated_at else None,
                }
                for p in prompts
            ]

    def get_default_system_prompt(self) -> Optional[Dict[str, Any]]:
        """Queries the current active default system prompt."""
        with self.SessionLocal() as session:
            p = session.query(DBSystemPrompt).filter(DBSystemPrompt.is_default == 1).first()
            if not p:
                p = session.query(DBSystemPrompt).order_by(DBSystemPrompt.id.asc()).first()
            if p:
                return {
                    "id": p.id,
                    "name": p.name,
                    "prompt_text": p.prompt_text,
                    "is_default": bool(p.is_default),
                    "created_at": str(p.created_at) if p.created_at else None,
                    "updated_at": str(p.updated_at) if p.updated_at else None,
                }
            return None

    def create_system_prompt(self, name: str, prompt_text: str, is_default: bool = False) -> Dict[str, Any]:
        """Creates a new System Prompt record."""
        with self.SessionLocal() as session:
            if is_default:
                session.query(DBSystemPrompt).update({DBSystemPrompt.is_default: 0})
            
            p = DBSystemPrompt(name=name, prompt_text=prompt_text, is_default=1 if is_default else 0)
            session.add(p)
            session.commit()
            session.refresh(p)
            return {
                "id": p.id,
                "name": p.name,
                "prompt_text": p.prompt_text,
                "is_default": bool(p.is_default),
                "created_at": str(p.created_at) if p.created_at else None,
                "updated_at": str(p.updated_at) if p.updated_at else None,
            }

    def update_system_prompt(
        self,
        prompt_id: int,
        name: Optional[str] = None,
        prompt_text: Optional[str] = None,
        is_default: Optional[bool] = None
    ) -> Optional[Dict[str, Any]]:
        """Updates an existing System Prompt record."""
        with self.SessionLocal() as session:
            p = session.query(DBSystemPrompt).filter(DBSystemPrompt.id == prompt_id).first()
            if not p:
                return None

            if is_default is True:
                session.query(DBSystemPrompt).update({DBSystemPrompt.is_default: 0})
                p.is_default = 1
            elif is_default is False:
                p.is_default = 0

            if name is not None:
                p.name = name
            if prompt_text is not None:
                p.prompt_text = prompt_text

            session.commit()
            session.refresh(p)
            return {
                "id": p.id,
                "name": p.name,
                "prompt_text": p.prompt_text,
                "is_default": bool(p.is_default),
                "created_at": str(p.created_at) if p.created_at else None,
                "updated_at": str(p.updated_at) if p.updated_at else None,
            }

    def delete_system_prompt(self, prompt_id: int) -> bool:
        """Deletes a System Prompt record by ID."""
        with self.SessionLocal() as session:
            p = session.query(DBSystemPrompt).filter(DBSystemPrompt.id == prompt_id).first()
            if not p:
                return False
            was_default = bool(p.is_default)
            session.delete(p)
            session.commit()

            # If we deleted the default prompt, make the first remaining prompt default
            if was_default:
                first_p = session.query(DBSystemPrompt).order_by(DBSystemPrompt.id.asc()).first()
                if first_p:
                    first_p.is_default = 1
                    session.commit()
            return True

    def set_default_system_prompt(self, prompt_id: int) -> bool:
        """Sets a System Prompt as the active default."""
        with self.SessionLocal() as session:
            p = session.query(DBSystemPrompt).filter(DBSystemPrompt.id == prompt_id).first()
            if not p:
                return False
            session.query(DBSystemPrompt).update({DBSystemPrompt.is_default: 0})
            p.is_default = 1
            session.commit()
            return True

    def delete_session(self, session_id: str) -> bool:
        """Deletes all persistent records (messages, summaries, status logs, token usage, session jobs, metadata, events) for a given session_id from DB."""
        if not session_id:
            return False
        with self.SessionLocal() as session:
            session.query(DBMessage).filter(DBMessage.session_id == session_id).delete(synchronize_session=False)
            session.query(DBSummary).filter(DBSummary.session_id == session_id).delete(synchronize_session=False)
            session.query(DBAgentLog).filter(DBAgentLog.session_id == session_id).delete(synchronize_session=False)
            session.query(DBTokenUsage).filter(DBTokenUsage.session_id == session_id).delete(synchronize_session=False)
            session.query(DBSessionJob).filter(DBSessionJob.session_id == session_id).delete(synchronize_session=False)
            session.query(DBSessionEvent).filter(DBSessionEvent.session_id == session_id).delete(synchronize_session=False)
            session.query(DBSessionMetadata).filter(DBSessionMetadata.session_id == session_id).delete(synchronize_session=False)
            session.commit()
        logger.info(f"[DB DELETE] Deleted all persistent records for session '{session_id}'.")
        return True

    def save_session_job(
        self,
        session_id: str,
        job_id: str,
        message_id: Optional[Union[int, str]] = None,
        job_title: str = "",
        company: str = "",
        location: str = "",
        details: Optional[Dict[str, Any]] = None
    ):
        """Caches a job ID associated with a session_id and optional message_id in DB."""
        details_json = json.dumps(details) if details else None
        msg_id_str = str(message_id) if message_id is not None else None
        with self.SessionLocal() as session:
            query = session.query(DBSessionJob).filter(
                DBSessionJob.session_id == session_id,
                DBSessionJob.job_id == str(job_id)
            )
            if msg_id_str:
                query = query.filter(DBSessionJob.message_id == msg_id_str)
            else:
                query = query.filter((DBSessionJob.message_id.is_(None)) | (DBSessionJob.message_id == ""))

            job = query.first()
            if job:
                job.job_title = job_title or job.job_title or ""
                job.company = company or job.company or ""
                job.location = location or job.location or ""
                if details_json:
                    job.details = details_json
                if msg_id_str:
                    job.message_id = msg_id_str
            else:
                job = DBSessionJob(
                    session_id=session_id,
                    message_id=msg_id_str,
                    job_id=str(job_id),
                    job_title=job_title or "",
                    company=company or "",
                    location=location or "",
                    details=details_json
                )
                session.add(job)
            session.commit()

    def link_session_jobs_to_message(self, session_id: str, job_ids: List[str], message_id: Union[int, str]):
        """Links session jobs to a specific message_id in DB."""
        if not session_id or not job_ids or message_id is None:
            return
        msg_id_str = str(message_id)
        job_id_strs = [str(j) for j in job_ids]
        with self.SessionLocal() as session:
            session.query(DBSessionJob).filter(
                DBSessionJob.session_id == session_id,
                DBSessionJob.job_id.in_(job_id_strs)
            ).update({DBSessionJob.message_id: msg_id_str}, synchronize_session=False)
            session.commit()

    def link_unassigned_jobs_to_message(self, session_id: str, message_id: Union[int, str]):
        """Links any unassigned session jobs for this session to the given message_id."""
        if not session_id or message_id is None:
            return
        msg_id_str = str(message_id)
        with self.SessionLocal() as session:
            session.query(DBSessionJob).filter(
                DBSessionJob.session_id == session_id,
                (DBSessionJob.message_id.is_(None)) | (DBSessionJob.message_id == "")
            ).update({DBSessionJob.message_id: msg_id_str}, synchronize_session=False)
            session.commit()

    def clear_unassigned_session_jobs(self, session_id: str):
        """Removes any unassigned session jobs for a session before starting a new tool selection."""
        if not session_id:
            return
        with self.SessionLocal() as session:
            session.query(DBSessionJob).filter(
                DBSessionJob.session_id == session_id,
                (DBSessionJob.message_id.is_(None)) | (DBSessionJob.message_id == "")
            ).delete(synchronize_session=False)
            session.commit()

    def get_session_jobs(self, session_id: str, message_id: Optional[Union[int, str]] = None) -> List[Dict[str, Any]]:
        """Retrieves cached job IDs for a given session_id from DB."""
        with self.SessionLocal() as session:
            query = session.query(DBSessionJob).filter(DBSessionJob.session_id == session_id)
            if message_id is not None:
                query = query.filter(DBSessionJob.message_id == str(message_id))
            jobs_raw = query.order_by(DBSessionJob.id.asc()).all()
            jobs = []
            for j in jobs_raw:
                details_val = None
                if j.details:
                    try:
                        details_val = json.loads(j.details)
                    except Exception:
                        pass
                jobs.append({
                    "id": j.id,
                    "session_id": j.session_id,
                    "message_id": j.message_id,
                    "job_id": j.job_id,
                    "job_title": j.job_title,
                    "company": j.company,
                    "location": j.location,
                    "details": details_val,
                    "created_at": str(j.created_at) if j.created_at else None
                })
            return jobs

    def save_session_event(self, session_id: str, event_type: str, data: Dict[str, Any]) -> None:
        """Saves a real-time delta event into MySQL database."""
        if not session_id or not event_type:
            return
        data_json = json.dumps(data) if isinstance(data, (dict, list)) else str(data)
        with self.SessionLocal() as session:
            event = DBSessionEvent(session_id=session_id, event_type=event_type, data=data_json)
            session.add(event)
            session.commit()

    def get_session_events(self, session_id: str) -> List[Dict[str, Any]]:
        """Queries recorded delta events for a given session_id from MySQL database."""
        if not session_id:
            return []
        with self.SessionLocal() as session:
            # Fetch assistant messages to map turn message_ids to their exact job_ids
            asst_msgs = session.query(DBMessage).filter(
                DBMessage.session_id == session_id,
                DBMessage.role == "assistant"
            ).order_by(DBMessage.id.asc()).all()

            turn_jobs_map = []
            for m in asst_msgs:
                job_records = session.query(DBSessionJob).filter(
                    DBSessionJob.session_id == session_id,
                    DBSessionJob.message_id == str(m.id)
                ).order_by(DBSessionJob.id.asc()).all()
                if job_records:
                    turn_jobs_map.append({
                        "message_id": m.id,
                        "job_ids": [j.job_id for j in job_records]
                    })

            events_raw = session.query(DBSessionEvent).filter(DBSessionEvent.session_id == session_id).order_by(DBSessionEvent.id.asc()).all()
            events = []
            hitl_event_idx = 0
            for e in events_raw:
                data_val = {}
                if e.data:
                    try:
                        data_val = json.loads(e.data)
                    except Exception:
                        pass

                if e.event_type == "hitl_prompt" and isinstance(data_val, dict):
                    if hitl_event_idx < len(turn_jobs_map):
                        if not data_val.get("job_ids"):
                            data_val["job_ids"] = turn_jobs_map[hitl_event_idx]["job_ids"]
                        data_val["message_id"] = turn_jobs_map[hitl_event_idx]["message_id"]
                    hitl_event_idx += 1

                events.append({
                    "timestamp": str(e.created_at) if e.created_at else None,
                    "session_id": e.session_id,
                    "event_type": e.event_type,
                    "data": data_val
                })
            return events

    def save_job_description(self, job_data: Dict[str, Any], job_source: Optional[str] = None) -> None:
        """Caches a complete job description metadata dictionary into DB by job_id."""
        if not job_data or not job_data.get("job_id"):
            return

        job_id = str(job_data.get("job_id"))
        skills = job_data.get("skills_required") or []
        skills_json = json.dumps(skills) if isinstance(skills, (list, dict)) else str(skills)
        source_val = job_source or job_data.get("job_source") or job_data.get("source") or "linkedin"

        with self.SessionLocal() as session:
            jd = session.query(DBJobDescription).filter(
                DBJobDescription.job_id == job_id,
                DBJobDescription.job_source == source_val
            ).first()
            if not jd:
                jd = session.query(DBJobDescription).filter(DBJobDescription.job_id == job_id).first()

            if jd:
                jd.title = job_data.get("title") or jd.title or ""
                jd.company_name = job_data.get("company_name") or jd.company_name or ""
                jd.location = job_data.get("location") or jd.location or ""
                jd.posted_time = job_data.get("posted_time") or jd.posted_time or ""
                jd.num_applicants = job_data.get("num_applicants") or jd.num_applicants or ""
                jd.seniority_level = job_data.get("seniority_level") or jd.seniority_level or ""
                jd.employment_type = job_data.get("employment_type") or jd.employment_type or ""
                jd.job_function = job_data.get("job_function") or jd.job_function or ""
                jd.job_url = job_data.get("job_url") or jd.job_url or ""
                jd.job_source = source_val
                jd.minimal_description = job_data.get("minimal_description") or jd.minimal_description or ""
                jd.raw_description = job_data.get("raw_description") or jd.raw_description or ""
                jd.skills_required = skills_json
            else:
                jd = DBJobDescription(
                    job_id=job_id,
                    title=job_data.get("title") or "",
                    company_name=job_data.get("company_name") or "",
                    location=job_data.get("location") or "",
                    posted_time=job_data.get("posted_time") or "",
                    num_applicants=job_data.get("num_applicants") or "",
                    seniority_level=job_data.get("seniority_level") or "",
                    employment_type=job_data.get("employment_type") or "",
                    job_function=job_data.get("job_function") or "",
                    job_url=job_data.get("job_url") or "",
                    job_source=source_val,
                    minimal_description=job_data.get("minimal_description") or "",
                    raw_description=job_data.get("raw_description") or "",
                    skills_required=skills_json
                )
                session.add(jd)
            session.commit()
            logger.info(f"[DB CACHE] Cached job description ({source_val}) in DB for job_id '{job_id}'.")

    def get_cached_job_description(self, job_id: str, job_source: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Queries cached job description by job_id and optional job_source from DB."""
        if not job_id:
            return None

        with self.SessionLocal() as session:
            query = session.query(DBJobDescription).filter(DBJobDescription.job_id == str(job_id))
            if job_source:
                query_source = query.filter(DBJobDescription.job_source == str(job_source))
                jd = query_source.first()
                if not jd:
                    jd = query.first()
            else:
                jd = query.first()

            if not jd:
                return None

            skills_val = []
            if jd.skills_required:
                try:
                    skills_val = json.loads(jd.skills_required)
                except Exception:
                    pass

            return {
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
                "job_source": getattr(jd, "job_source", "linkedin") or "linkedin",
                "minimal_description": jd.minimal_description,
                "raw_description": jd.raw_description,
                "skills_required": skills_val,
                "created_at": str(jd.created_at) if jd.created_at else None
            }


class Agent:
    """
    ReAct AI Agent with SiliconFlow LLM, persistent SQLite/MySQL DB history,
    token limit management, progressive message condensation/summarization,
    real-time DB token usage accumulation, and automatic tool inspection.
    """

    def __init__(
        self,
        session_id: Optional[str] = None,
        SYSTEM_PROMPT: str = DEFAULT_REACT_SYSTEM_PROMPT,
        token_limit: int = 3000,
        db_url: Optional[str] = None,
        tools: Optional[List[Any]] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None
    ):
        self.session_id = session_id if session_id else str(uuid.uuid4())
        self.SYSTEM_PROMPT = SYSTEM_PROMPT
        self.token_limit = token_limit
        self.last_assistant_message_id = None

        # Resolve DB URL (defaults to os.getenv('DATABASE_URL') or MySQL dev DB)
        db_host = os.getenv("DB_HOST", "mysql")
        db_port = os.getenv("DB_PORT", "3306")
        db_user = os.getenv("DB_USER", "admin")
        db_pass = os.getenv("DB_PASSWORD", "admin")
        db_name = os.getenv("DB_NAME", "dev")
        final_db_url = db_url or os.getenv("DATABASE_URL") or f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
        self.db = AgentDatabase(final_db_url)

        # Initialize cumulative token usage from DB
        self.usage = self.db.get_token_usage(self.session_id)

        # Initialize tools by inspecting callables & docstrings
        self.tools = self._parse_tools(tools)

        # Initialize SiliconFlow LLM
        sf_api_key = api_key or os.getenv("SILICONFLOW_API_KEY")
        sf_base_url = base_url or os.getenv("SILICONFLOW_BASE_URL")
        if sf_base_url and not sf_base_url.endswith('/chat/completions'):
            sf_base_url = sf_base_url.rstrip('/') + '/chat/completions'
        sf_model = model or os.getenv("SILICONFLOW_MODEL_ID", "Qwen/Qwen2.5-72B-Instruct")
        print(sf_api_key, sf_base_url, sf_model)
        kwargs = {"model": sf_model, "timeout": 120.0}
        if sf_api_key:
            kwargs["api_key"] = sf_api_key
        if sf_base_url:
            kwargs["base_url"] = sf_base_url
        if sf_model:
            kwargs["model_id"] = sf_model

        logger.info(f"Initializing SiliconFlow LLM [Model: {sf_model}] for session '{self.session_id}'...")
        self.llm = SiliconFlow(**kwargs)
        logger.info(f"Agent initialized successfully. Token Limit: {self.token_limit}, Current Total Tokens in DB: {self.usage['total_tokens']}")

    def update_token_usage(self, usage: Dict[str, Any], mode: Literal['call', 'stream'] = 'call') -> Dict[str, int]:
        """Captures raw token usage dictionary and updates DB with accumulative total logic."""
        if not usage or not isinstance(usage, dict):
            return self.usage

        self.usage = self.db.update_token_usage(self.session_id, usage, mode=mode)
        return self.usage

    def _parse_tools(self, raw_tools: Optional[List[Any]]) -> List[FunctionTool]:
        """Reads function docstring and inspects signature to convert callables into FunctionTool objects."""
        parsed = []
        if not raw_tools:
            return parsed

        for item in raw_tools:
            if isinstance(item, FunctionTool):
                parsed.append(item)
                logger.info(f"Registered FunctionTool: '{item.metadata.name}'")
            elif callable(item):
                docstring = inspect.getdoc(item)
                fn_name = getattr(item, "__name__", str(item))
                description = docstring.strip() if docstring else f"Function {fn_name}"
                
                logger.info(f"Inspecting callable tool '{fn_name}': Description='{description}'")
                tool_obj = FunctionTool.from_defaults(
                    fn=item,
                    name=fn_name,
                    description=description
                )
                parsed.append(tool_obj)
            else:
                logger.warning(f"Item {item} is neither callable nor FunctionTool. Skipping.")

        return parsed

    def _prepare_context_and_condense(self) -> tuple[List[ChatMessage], Optional[str]]:
        """
        Fetches session messages from DB.
        Calculates available token budget.
        Condenses overflow messages outside token limit (previous summary + new messages = updated summary).
        Marks cutoff message ID in DB.
        Returns context ChatMessages for LLM call and current summary string.
        """
        logger.info(f"Preparing context & checking token limits for session '{self.session_id}'...")

        # 1. Fetch current summary from DB
        summary_data = self.db.get_summary(self.session_id)
        existing_summary = summary_data["summary"] if summary_data else None
        last_summarized_id = summary_data["last_summarized_message_id"] if summary_data else 0

        if existing_summary:
            logger.info(f"Found existing summary up to message ID {last_summarized_id}.")
        else:
            logger.info("No prior summary found for this session.")

        # 2. Retrieve all messages for session
        all_messages = self.db.get_all_messages(self.session_id)

        # Filter messages after last_summarized_id
        unsummarized = [m for m in all_messages if m["id"] > last_summarized_id]

        # The latest user message was just inserted into DB, exclude it from history evaluation
        if unsummarized and unsummarized[-1]["role"] == "user":
            history_eval = unsummarized[:-1]
        else:
            history_eval = unsummarized

        # 3. Calculate token budgets
        sys_tokens = estimate_tokens(self.SYSTEM_PROMPT)
        summary_prompt_part = f"Previous Conversation Summary (up to message ID {last_summarized_id}):\n{existing_summary}" if existing_summary else ""
        sum_tokens = estimate_tokens(summary_prompt_part)

        available_budget = self.token_limit - sys_tokens - sum_tokens
        logger.info(f"Token Budget Breakdown -> Limit: {self.token_limit} | System: {sys_tokens} | Summary: {sum_tokens} => Available: {available_budget}")

        # 4. Determine recent messages within token budget (scanning backwards)
        recent_messages = []
        overflow_messages = []
        used_tokens = 0

        for msg in reversed(history_eval):
            msg_tokens = msg["token_count"] or estimate_tokens(msg["content"])
            if used_tokens + msg_tokens <= available_budget:
                recent_messages.insert(0, msg)
                used_tokens += msg_tokens
            else:
                overflow_messages.insert(0, msg)

        logger.info(f"Context fit: {len(recent_messages)} recent message(s) within token limit ({used_tokens} tokens), {len(overflow_messages)} overflow message(s).")

        # 5. Incremental Condensation if overflow exists
        current_summary = existing_summary
        if overflow_messages:
            cutoff_id = overflow_messages[-1]["id"]
            logger.info(f"Condensation triggered! Summarizing overflow messages (IDs {overflow_messages[0]['id']} to {cutoff_id})...")

            overflow_text = "\n".join(
                f"[{m['role'].upper()} - Msg ID {m['id']}]: {m['content']}" for m in overflow_messages
            )

            if existing_summary:
                summarize_input = (
                    f"Previous Conversation Summary (up to message ID {last_summarized_id}):\n{existing_summary}\n\n"
                    f"New messages to incorporate into updated summary (Msg IDs {overflow_messages[0]['id']} to {cutoff_id}):\n{overflow_text}\n\n"
                    f"Provide an updated, concise summary combining the previous summary and new messages. Retain key decisions, user facts, and important context."
                )
            else:
                summarize_input = (
                    f"Conversation messages to summarize (Msg IDs {overflow_messages[0]['id']} to {cutoff_id}):\n{overflow_text}\n\n"
                    f"Provide a concise summary of the conversation above, retaining key decisions, user facts, and important context."
                )

            logger.info("Requesting SiliconFlow LLM to generate updated summary...")
            try:
                sum_res = self.llm.complete(summarize_input)
                new_summary = sum_res.text.strip()
                logger.info(f"Summary generated! New summary length: {len(new_summary)} chars. Marking cutoff ID {cutoff_id}.")

                # Capture token usage for summarization run
                sum_usage = extract_usage_from_response(sum_res)
                if sum_usage:
                    self.update_token_usage(sum_usage, mode='call')

                self.db.save_or_update_summary(
                    session_id=self.session_id,
                    summary=new_summary,
                    last_summarized_message_id=cutoff_id
                )
                current_summary = new_summary
                last_summarized_id = cutoff_id
            except Exception as err:
                logger.error(f"Summarization request failed: {err}", exc_info=True)

        # 6. Build ChatMessage objects
        context_chat = []

        system_text = self.SYSTEM_PROMPT
        if current_summary:
            system_text += f"\n\n--- PREVIOUS CONVERSATION SUMMARY (Up to Message ID {last_summarized_id}) ---\n{current_summary}"

        context_chat.append(ChatMessage(role=MessageRole.SYSTEM, content=system_text))

        for msg in recent_messages:
            role_enum = MessageRole.USER if msg["role"] == "user" else (MessageRole.ASSISTANT if msg["role"] == "assistant" else MessageRole.SYSTEM)
            context_chat.append(ChatMessage(role=role_enum, content=msg["content"]))

        return context_chat, current_summary

    def chat(self, user_input: str) -> str:
        """Processes user chat request synchronously with DB recording, condensation, token usage accumulation, and tool execution."""
        logger.info(f"=== Starting chat execution [Session: {self.session_id}] ===")
        logger.info(f"User Input: '{user_input}'")

        # 1. Store User Message in DB
        u_tokens = estimate_tokens(user_input)
        self.db.add_message(
            session_id=self.session_id,
            role="user",
            content=user_input,
            token_count=u_tokens
        )

        # 2. Prepare Context & Condense Overflow
        context_messages, _ = self._prepare_context_and_condense()

        # 3. Call LLM
        logger.info(f"Invoking SiliconFlow LLM with {len(context_messages)} context message(s)...")
        if self.tools:
            logger.info(f"Executing predict_and_call with {len(self.tools)} tool(s)...")
            try:
                tool_res = self.llm.predict_and_call(
                    tools=self.tools,
                    user_msg=user_input,
                    chat_history=context_messages,
                    verbose=True
                )
                response_text = str(tool_res.response)

                usage = extract_usage_from_response(tool_res)
                if usage:
                    self.update_token_usage(usage, mode='call')

                if hasattr(tool_res, 'sources') and tool_res.sources:
                    for src in tool_res.sources:
                        tool_name = getattr(src, 'tool_name', 'tool')
                        tool_out = getattr(src, 'content', str(src))
                        logger.info(f"Tool Executed: {tool_name} -> Output: {tool_out}")

            except Exception as e:
                logger.error(f"predict_and_call failed: {e}. Falling back to chat method.", exc_info=True)
                full_msgs = context_messages + [ChatMessage(role=MessageRole.USER, content=user_input)]
                res = self.llm.chat(full_msgs)
                response_text = res.message.content
                usage = extract_usage_from_response(res)
                if usage:
                    self.update_token_usage(usage, mode='call')
        else:
            full_msgs = context_messages + [ChatMessage(role=MessageRole.USER, content=user_input)]
            res = self.llm.chat(full_msgs)
            response_text = res.message.content
            usage = extract_usage_from_response(res)
            if usage:
                self.update_token_usage(usage, mode='call')

        logger.info(f"Assistant Output: '{response_text}'")

        # 4. Store Assistant Message in DB
        a_tokens = estimate_tokens(response_text)
        self.db.add_message(
            session_id=self.session_id,
            role="assistant",
            content=response_text,
            token_count=a_tokens
        )

        logger.info(f"=== Completed chat execution [Session: {self.session_id}] | DB Accumulated Tokens: {self.usage['total_tokens']} ===")
        return response_text

    async def achat(self, user_input: str) -> str:
        """Processes user chat request asynchronously with ReAct reasoning, live event emission, DB logging, and tool execution."""
        logger.info(f"=== Starting async ReAct chat execution [Session: {self.session_id}] ===")
        logger.info(f"User Input: '{user_input}'")

        # 1. Store User Message in DB
        u_tokens = estimate_tokens(user_input)
        self.db.add_message(
            session_id=self.session_id,
            role="user",
            content=user_input,
            token_count=u_tokens
        )

        # 2. Prepare Context & Condense Overflow
        context_messages, _ = self._prepare_context_and_condense()

        # 3. Execute ReAct Reasoning & Tool Execution Loop
        if self.tools:
            logger.info(f"Executing async ReAct loop for session '{self.session_id}' with {len(self.tools)} tool(s)...")
            response_text = await self._run_react_loop_async(user_input, context_messages)
        else:
            full_msgs = context_messages + [ChatMessage(role=MessageRole.USER, content=user_input)]
            res = await self.llm.achat(full_msgs)
            response_text = res.message.content
            usage = extract_usage_from_response(res)
            if usage:
                self.update_token_usage(usage, mode='call')

        logger.info(f"Assistant Output: '{response_text}'")

        # 4. Store Assistant Message in DB
        a_tokens = estimate_tokens(response_text)
        asst_msg_id = self.db.add_message(
            session_id=self.session_id,
            role="assistant",
            content=response_text,
            token_count=a_tokens
        )
        self.last_assistant_message_id = asst_msg_id

        if asst_msg_id:
            try:
                self.db.link_unassigned_jobs_to_message(self.session_id, asst_msg_id)
            except Exception as e:
                logger.warning(f"Failed to link unassigned jobs to message '{asst_msg_id}': {e}")

        logger.info(f"=== Completed async chat execution [Session: {self.session_id}] | DB Accumulated Tokens: {self.usage['total_tokens']} ===")
        return response_text

    async def _run_react_loop_async(self, user_input: str, context_messages: List[ChatMessage]) -> str:
        """Runs an async ReAct reasoning & tool execution loop with live Centrifugo delta streaming."""
        import re

        tool_map = {t.metadata.name: t for t in self.tools}

        tool_descriptions = []
        for t in self.tools:
            name = t.metadata.name
            desc = t.metadata.description or f"Function {name}"
            tool_descriptions.append(f"- {name}: {desc}")
        tools_str = "\n".join(tool_descriptions)

        react_system_prompt = (
            f"{self.SYSTEM_PROMPT}\n\n"
            "AVAILABLE TOOLS:\n"
            f"{tools_str}\n\n"
            "OPERATIONAL FORMAT INSTRUCTIONS:\n"
            "To use a tool, respond ONLY in this exact format:\n"
            "Thought: <explain your reasoning step-by-step>\n"
            "Action: <tool_name>\n"
            "Action Input: <JSON formatted parameters object>\n\n"
            "When you have finished executing tools and have the final response, respond in this format:\n"
            "Thought: <explain final reasoning>\n"
            "Final Answer: <your final response to user>\n"
        )

        messages = [ChatMessage(role=MessageRole.SYSTEM, content=react_system_prompt)]
        for m in context_messages:
            if m.role != MessageRole.SYSTEM:
                messages.append(m)
        messages.append(ChatMessage(role=MessageRole.USER, content=user_input))

        max_iterations = 6
        final_response = ""

        _emit_event(self.session_id, "thinking", {
            "text": f"Analyzing user request: '{user_input}' and planning execution steps...",
            "user_input": user_input
        })

        for iteration in range(max_iterations):
            logger.info(f"[ReAct Loop Step {iteration + 1}/{max_iterations}] Calling LLM...")

            res = await self.llm.achat(messages)
            usage = extract_usage_from_response(res)
            if usage:
                self.update_token_usage(usage, mode='call')

            content = res.message.content or ""
            logger.info(f"[ReAct Loop Step {iteration + 1} Output]:\n{content}")

            # 1. Native LlamaIndex Function/Tool Calls check
            tool_calls = res.message.additional_kwargs.get("tool_calls", [])
            if tool_calls:
                for tc in tool_calls:
                    fn_info = tc.get("function", {})
                    fn_name = fn_info.get("name")
                    fn_args_raw = fn_info.get("arguments", "{}")
                    try:
                        fn_args = json.loads(fn_args_raw) if isinstance(fn_args_raw, str) else (fn_args_raw or {})
                    except Exception:
                        fn_args = {}

                    if fn_name in tool_map:
                        _emit_event(self.session_id, "action", {
                            "tool_name": fn_name,
                            "params": fn_args,
                            "text": f"Executing tool: {fn_name}({json.dumps(fn_args)})"
                        })

                        tool_fn = tool_map[fn_name].fn
                        sig = inspect.signature(tool_fn)
                        has_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
                        exec_args = fn_args if has_var_kw else {k: v for k, v in fn_args.items() if k in sig.parameters}

                        if inspect.iscoroutinefunction(tool_fn):
                            tool_out = await tool_fn(**exec_args)
                        else:
                            tool_out = tool_fn(**exec_args)

                        _emit_event(self.session_id, "observation", {
                            "tool_name": fn_name,
                            "text": f"Observed: Tool {fn_name} returned execution results."
                        })

                        messages.append(ChatMessage(role=MessageRole.ASSISTANT, content=f"Executed tool {fn_name}"))
                        messages.append(ChatMessage(role=MessageRole.USER, content=f"Observation: {json.dumps(tool_out) if isinstance(tool_out, (dict, list)) else str(tool_out)}"))

                continue

            # 2. Parse Text ReAct Format (Thought / Action / Action Input / Final Answer)
            thought_match = re.search(r'Thought:\s*(.*?)(?=\nAction:|\nFinal Answer:|$)', content, re.DOTALL)
            if thought_match:
                thought_text = thought_match.group(1).strip()
                if thought_text:
                    _emit_event(self.session_id, "thinking", {"text": thought_text})

            action_match = re.search(r'Action:\s*([a-zA-Z0-9_]+)', content)
            action_input_match = re.search(r'Action Input:\s*({.*?}|\[.*?\]|".*?"|\d+)', content, re.DOTALL)

            if action_match and action_match.group(1) in tool_map:
                target_tool = action_match.group(1)
                raw_input = action_input_match.group(1).strip() if action_input_match else "{}"

                try:
                    params = json.loads(raw_input) if raw_input.startswith('{') or raw_input.startswith('[') else {"query": raw_input}
                except Exception:
                    params = {"query": raw_input}

                _emit_event(self.session_id, "action", {
                    "tool_name": target_tool,
                    "params": params,
                    "text": f"Executing tool: {target_tool}({json.dumps(params)})"
                })

                tool_fn = tool_map[target_tool].fn
                sig = inspect.signature(tool_fn)
                has_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
                exec_params = params if has_var_kw else {k: v for k, v in params.items() if k in sig.parameters}

                if inspect.iscoroutinefunction(tool_fn):
                    tool_out = await tool_fn(**exec_params)
                else:
                    tool_out = tool_fn(**exec_params)

                _emit_event(self.session_id, "observation", {
                    "tool_name": target_tool,
                    "text": f"Observed: Tool {target_tool} returned execution results."
                })

                obs_str = json.dumps(tool_out) if isinstance(tool_out, (dict, list)) else str(tool_out)
                messages.append(ChatMessage(role=MessageRole.ASSISTANT, content=content))
                messages.append(ChatMessage(role=MessageRole.USER, content=f"Observation: {obs_str}"))
                continue

            final_match = re.search(r'Final Answer:\s*(.*)', content, re.DOTALL)
            if final_match:
                final_response = final_match.group(1).strip()
                break

            # Fallback tool call if job search intent is detected without explicit Action syntax
            if iteration == 0 and "search_linkedin_jobs" in tool_map and any(k in user_input.lower() for k in ["job", "search", "find", "developer", "engineer", "role", "python", "ai"]):
                keywords = user_input
                for drop in ["search", "find", "for", "me", "jobs", "job", "please", "can", "you", "in", "with"]:
                    keywords = re.sub(rf'\b{drop}\b', '', keywords, flags=re.IGNORECASE)
                keywords = keywords.strip() or "Developer"

                search_fn = tool_map["search_linkedin_jobs"].fn
                jobs = await search_fn(keywords=keywords, location="Remote", posted_within="24h", limit=10) if inspect.iscoroutinefunction(search_fn) else search_fn(keywords=keywords, location="Remote", posted_within="24h", limit=10)
                job_ids = [str(j.get("job_id") or j.get("id")) for j in (jobs or []) if (j.get("job_id") or j.get("id"))]

                if "ask_user_to_select_jobs" in tool_map and job_ids:
                    hitl_fn = tool_map["ask_user_to_select_jobs"].fn
                    if inspect.iscoroutinefunction(hitl_fn):
                        await hitl_fn(job_ids=job_ids)
                    else:
                        hitl_fn(job_ids=job_ids)
                    final_response = "Awaiting User selection"
                    break

            final_response = content.replace("Thought:", "").strip()
            break

        if not final_response:
            final_response = content or "Agent completed processing."

        # Stream delta level updates word-by-word to Centrifugo & session events
        if final_response:
            words = final_response.split(" ")
            accumulated = ""
            for idx, word in enumerate(words):
                accumulated += word + (" " if idx < len(words) - 1 else "")
                _emit_event(self.session_id, "answering", {
                    "response": accumulated,
                    "text": accumulated,
                    "delta": word
                })
                await asyncio.sleep(0.015)

        return final_response

    async def _fallback_tool_call_exec_async(self, user_input: str, context_messages: List[ChatMessage]) -> str:
        """Direct tool execution fallback when LlamaIndex ReAct agent format fails."""
        import re
        tool_map = {t.metadata.name: t for t in self.tools}

        job_id_match = re.search(r'\b4?\d{9}\b|\b\d{8,12}\b', user_input)
        if job_id_match and "get_linkedin_job_details" in tool_map:
            target_id = job_id_match.group(0)
            fn = tool_map["get_linkedin_job_details"].fn
            details = await fn(job_id=target_id) if inspect.iscoroutinefunction(fn) else fn(job_id=target_id)
            return json.dumps(details, indent=2) if isinstance(details, dict) else str(details)

        if "search_linkedin_jobs" in tool_map:
            keywords = user_input
            for drop in ["search", "find", "for", "me", "jobs", "job", "please", "can", "you", "in", "with", "experience"]:
                keywords = re.sub(rf'\b{drop}\b', '', keywords, flags=re.IGNORECASE)
            keywords = keywords.strip() or "Developer"

            search_fn = tool_map["search_linkedin_jobs"].fn
            jobs = await search_fn(keywords=keywords, location="Remote", posted_within="24h", limit=10) if inspect.iscoroutinefunction(search_fn) else search_fn(keywords=keywords, location="Remote", posted_within="24h", limit=10)

            job_ids = [str(j.get("job_id") or j.get("id")) for j in (jobs or []) if (j.get("job_id") or j.get("id"))]

            if "ask_user_to_select_jobs" in tool_map and job_ids:
                hitl_fn = tool_map["ask_user_to_select_jobs"].fn
                if inspect.iscoroutinefunction(hitl_fn):
                    await hitl_fn(job_ids=job_ids)
                else:
                    hitl_fn(job_ids=job_ids)
                return "Awaiting User selection"
            elif jobs:
                return f"Found {len(jobs)} jobs matching '{keywords}'. Job IDs: {', '.join(job_ids)}"

        full_msgs = context_messages + [ChatMessage(role=MessageRole.USER, content=user_input)]
        res = await self.llm.achat(full_msgs)
        usage = extract_usage_from_response(res)
        if usage:
            self.update_token_usage(usage, mode='call')
        return res.message.content

    def chat_stream(self, user_input: str) -> Generator[str, None, None]:
        """
        Streams chat response tokens synchronously in real-time.
        Saves user input and assistant response to SQLite database,
        handles condensation, tool execution, and updates accumulated token usage in DB.
        """
        logger.info(f"=== Starting chat stream execution [Session: {self.session_id}] ===")
        logger.info(f"User Input: '{user_input}'")

        # 1. Store User message in DB
        u_tokens = estimate_tokens(user_input)
        self.db.add_message(self.session_id, "user", user_input, u_tokens)

        # 2. Context preparation & condensation
        context_messages, _ = self._prepare_context_and_condense()

        # 3. Handle Tool execution if tools are present
        if self.tools:
            logger.info(f"Tools present ({len(self.tools)}). Executing tools prior to response streaming...")
            try:
                tool_res = self.llm.predict_and_call(
                    tools=self.tools,
                    user_msg=user_input,
                    chat_history=context_messages,
                    verbose=True
                )
                response_text = str(tool_res.response)
                usage = extract_usage_from_response(tool_res)
                if usage:
                    self.update_token_usage(usage, mode='call')

                if hasattr(tool_res, 'sources') and tool_res.sources:
                    for src in tool_res.sources:
                        tool_name = getattr(src, 'tool_name', 'tool')
                        tool_out = getattr(src, 'content', str(src))
                        logger.info(f"Tool Executed: {tool_name} -> Output: {tool_out}")

                # Yield response_text as stream delta
                yield response_text

                # Store Assistant message in DB
                a_tokens = estimate_tokens(response_text)
                self.db.add_message(self.session_id, "assistant", response_text, a_tokens)
                return
            except Exception as e:
                logger.error(f"predict_and_call in chat_stream failed: {e}. Falling back to standard streaming.", exc_info=True)

        # 4. Stream response tokens from LLM
        full_msgs = context_messages + [ChatMessage(role=MessageRole.USER, content=user_input)]
        logger.info(f"Streaming tokens from SiliconFlow LLM (Context messages: {len(full_msgs)})...")
        handler = self.llm.stream_chat(full_msgs)
        accumulated_text = ""
        last_stream_usage = None

        for chunk in handler:
            delta = getattr(chunk, "delta", "") or (chunk.message.content if hasattr(chunk, "message") else "")
            if not delta and hasattr(chunk, "text"):
                delta = chunk.text

            usage = extract_usage_from_response(chunk)
            if usage:
                last_stream_usage = usage

            accumulated_text += delta
            if delta:
                yield delta

        # Update DB token usage ONCE after stream loop completes
        if last_stream_usage:
            self.update_token_usage(last_stream_usage, mode='stream')
        else:
            prompt_toks = sum(estimate_tokens(m.content) for m in full_msgs)
            comp_toks = estimate_tokens(accumulated_text)
            self.update_token_usage({
                "prompt_tokens": prompt_toks,
                "completion_tokens": comp_toks,
                "total_tokens": prompt_toks + comp_toks
            }, mode='stream')

        # 5. Store completed Assistant response in DB
        a_tokens = estimate_tokens(accumulated_text)
        self.db.add_message(self.session_id, "assistant", accumulated_text, a_tokens)
        logger.info(f"=== Completed chat stream [Session: {self.session_id}] | DB Total Tokens: {self.usage['total_tokens']} ===")

    async def achat_stream(self, user_input: str) -> AsyncGenerator[str, None]:
        """
        Streams chat response tokens asynchronously in real-time.
        Ideal for FastAPI StreamingResponse, WebSockets, or async event loops.
        Saves user input and assistant response to SQLite database,
        handles condensation, tool execution, and updates accumulated token usage in DB.
        """
        logger.info(f"=== Starting async chat stream execution [Session: {self.session_id}] ===")
        logger.info(f"User Input: '{user_input}'")

        # 1. Store User message in DB
        u_tokens = estimate_tokens(user_input)
        self.db.add_message(self.session_id, "user", user_input, u_tokens)

        # 2. Context preparation & condensation
        context_messages, _ = self._prepare_context_and_condense()

        # 3. Handle Tool execution if tools are present
        if self.tools:
            logger.info(f"Tools present ({len(self.tools)}). Executing tools prior to async response streaming...")
            try:
                tool_res = await self.llm.apredict_and_call(
                    tools=self.tools,
                    user_msg=user_input,
                    chat_history=context_messages,
                    verbose=True
                )
                response_text = str(tool_res.response)
                usage = extract_usage_from_response(tool_res)
                if usage:
                    self.update_token_usage(usage, mode='call')

                if hasattr(tool_res, 'sources') and tool_res.sources:
                    for src in tool_res.sources:
                        tool_name = getattr(src, 'tool_name', 'tool')
                        tool_out = getattr(src, 'content', str(src))
                        logger.info(f"Tool Executed: {tool_name} -> Output: {tool_out}")

                # Yield response_text as stream delta
                yield response_text

                # Store Assistant message in DB
                a_tokens = estimate_tokens(response_text)
                self.db.add_message(self.session_id, "assistant", response_text, a_tokens)
                return
            except Exception as e:
                logger.error(f"apredict_and_call in achat_stream failed: {e}. Falling back to standard async streaming.", exc_info=True)

        # 4. Stream response tokens asynchronously from LLM
        full_msgs = context_messages + [ChatMessage(role=MessageRole.USER, content=user_input)]
        logger.info(f"Streaming tokens asynchronously from SiliconFlow LLM (Context messages: {len(full_msgs)})...")
        handler = await self.llm.astream_chat(full_msgs)
        accumulated_text = ""
        last_stream_usage = None

        async for chunk in handler:
            delta = getattr(chunk, "delta", "") or (chunk.message.content if hasattr(chunk, "message") else "")
            if not delta and hasattr(chunk, "text"):
                delta = chunk.text

            usage = extract_usage_from_response(chunk)
            if usage:
                last_stream_usage = usage

            accumulated_text += delta
            if delta:
                yield delta

        # Update DB token usage ONCE after async stream loop completes
        if last_stream_usage:
            self.update_token_usage(last_stream_usage, mode='stream')
        else:
            prompt_toks = sum(estimate_tokens(m.content) for m in full_msgs)
            comp_toks = estimate_tokens(accumulated_text)
            self.update_token_usage({
                "prompt_tokens": prompt_toks,
                "completion_tokens": comp_toks,
                "total_tokens": prompt_toks + comp_toks
            }, mode='stream')

        # 5. Store completed Assistant response in DB
        a_tokens = estimate_tokens(accumulated_text)
        self.db.add_message(self.session_id, "assistant", accumulated_text, a_tokens)
        logger.info(f"=== Completed async chat stream [Session: {self.session_id}] | DB Total Tokens: {self.usage['total_tokens']} ===")


# Example usage demonstrator
if __name__ == "__main__":
    def add_numbers(a: float, b: float) -> float:
        """Adds two numbers and returns their sum."""
        return a + b

    def multiply_numbers(a: float, b: float) -> float:
        """Multiplies two numbers and returns their product."""
        return a * b

    agent = Agent(
        session_id="demo_session",
        token_limit=1500,
        tools=[add_numbers, multiply_numbers]
    )

    print("\n--- Testing Agent Chat Stream ---")
    print("Agent Stream Output: ", end="", flush=True)
    for delta_text in agent.chat_stream("Explain what Python generators are in 2 simple sentences."):
        print(delta_text, end="", flush=True)
    print("\n")
    print(f"Accumulated Token Usage in DB: {agent.usage}\n")
