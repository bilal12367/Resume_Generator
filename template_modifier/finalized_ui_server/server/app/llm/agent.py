import os
import json
import uuid
import inspect
import sqlite3
import logging
import asyncio
from typing import List, Dict, Any, Optional, Callable, Literal, Generator, AsyncGenerator

from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(usecwd=True))

from sqlalchemy import create_engine, text
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
    """Manages persistent database storage for conversation history, condensation summaries, and accumulated token usage (Supports SQLite & MySQL)."""

    def __init__(self, db_url: Optional[str] = None):
        self.db_url = self._normalize_db_url(db_url)
        self.is_mysql = "mysql" in self.db_url
        self.is_sqlite = not self.is_mysql

        logger.info(f"Initializing database connection using URL: '{self.db_url}' (Dialect: {'MySQL' if self.is_mysql else 'SQLite'})...")
        self.engine = create_engine(self.db_url, pool_pre_ping=True)
        self._init_db()

    def _normalize_db_url(self, url: Optional[str]) -> str:
        url_val = url or os.getenv("DATABASE_URL") or "mysql+pymysql://admin:admin@127.0.0.1:3306/dev"
        url_str = url_val.strip()
        if url_str.startswith("mysql://"):
            return url_str.replace("mysql://", "mysql+pymysql://", 1)
        elif url_str.startswith("mysql+pymysql://"):
            return url_str
        elif "://" not in url_str:
            return f"mysql+pymysql://admin:admin@127.0.0.1:3306/{url_str}"
        return url_str

    def _init_db(self):
        with self.engine.connect() as conn:
            if self.is_mysql:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL,
                        role VARCHAR(50) NOT NULL,
                        content LONGTEXT NOT NULL,
                        token_count INT NOT NULL DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_session (session_id)
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS summaries (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL UNIQUE,
                        summary LONGTEXT NOT NULL,
                        last_summarized_message_id INT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS token_usage (
                        session_id VARCHAR(255) PRIMARY KEY,
                        prompt_tokens INT NOT NULL DEFAULT 0,
                        completion_tokens INT NOT NULL DEFAULT 0,
                        total_tokens INT NOT NULL DEFAULT 0,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS agent_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL,
                        status VARCHAR(100) NOT NULL,
                        details LONGTEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_log_session (session_id)
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS session_jobs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL,
                        job_id VARCHAR(255) NOT NULL,
                        job_title VARCHAR(255),
                        company VARCHAR(255),
                        location VARCHAR(255),
                        details LONGTEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY idx_session_job (session_id, job_id)
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS session_events (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL,
                        event_type VARCHAR(100) NOT NULL,
                        data LONGTEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_event_session (session_id)
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS job_descriptions (
                        job_id VARCHAR(255) PRIMARY KEY,
                        title VARCHAR(255),
                        company_name VARCHAR(255),
                        location VARCHAR(255),
                        posted_time VARCHAR(100),
                        num_applicants VARCHAR(100),
                        seniority_level VARCHAR(100),
                        employment_type VARCHAR(100),
                        job_function VARCHAR(100),
                        job_url VARCHAR(500),
                        minimal_description LONGTEXT,
                        raw_description LONGTEXT,
                        skills_required LONGTEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS user_profiles (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        profile_name VARCHAR(255) NOT NULL,
                        user_data LONGTEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS generated_ats (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id VARCHAR(255) NOT NULL,
                        profile_id INT NOT NULL,
                        job_id VARCHAR(255) NOT NULL,
                        ats_json_data LONGTEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_ats_session (session_id)
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS ats_workflow_sessions (
                        session_id VARCHAR(255) PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        status VARCHAR(100) NOT NULL DEFAULT 'CREATED',
                        profile_id INT,
                        job_id VARCHAR(255),
                        pdf_filename VARCHAR(255),
                        pdf_links LONGTEXT,
                        error_message LONGTEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    );
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        token_count INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS summaries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL UNIQUE,
                        summary TEXT NOT NULL,
                        last_summarized_message_id INTEGER NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS token_usage (
                        session_id TEXT PRIMARY KEY,
                        prompt_tokens INTEGER NOT NULL DEFAULT 0,
                        completion_tokens INTEGER NOT NULL DEFAULT 0,
                        total_tokens INTEGER NOT NULL DEFAULT 0,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS agent_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        status TEXT NOT NULL,
                        details TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS session_jobs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        job_id TEXT NOT NULL,
                        job_title TEXT,
                        company TEXT,
                        location TEXT,
                        details TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(session_id, job_id)
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS session_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        data TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS job_descriptions (
                        job_id TEXT PRIMARY KEY,
                        title TEXT,
                        company_name TEXT,
                        location TEXT,
                        posted_time TEXT,
                        num_applicants TEXT,
                        seniority_level TEXT,
                        employment_type TEXT,
                        job_function TEXT,
                        job_url TEXT,
                        minimal_description TEXT,
                        raw_description TEXT,
                        skills_required TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
            conn.commit()
            logger.info("Database schema initialized successfully.")

    def add_message(self, session_id: str, role: str, content: str, token_count: int) -> int:
        with self.engine.connect() as conn:
            query = text("""
                INSERT INTO messages (session_id, role, content, token_count)
                VALUES (:session_id, :role, :content, :token_count)
            """)
            result = conn.execute(query, {
                "session_id": session_id,
                "role": role,
                "content": content,
                "token_count": token_count
            })
            conn.commit()
            msg_id = result.lastrowid
            logger.debug(f"[DB] Inserted message ID {msg_id} [Role: {role}, Session: {session_id}, Tokens: {token_count}]")
            return msg_id if msg_id is not None else 0

    def get_all_messages(self, session_id: str) -> List[Dict[str, Any]]:
        with self.engine.connect() as conn:
            query = text("""
                SELECT id, session_id, role, content, token_count, created_at
                FROM messages
                WHERE session_id = :session_id
                ORDER BY id ASC
            """)
            result = conn.execute(query, {"session_id": session_id})
            rows = result.mappings().all()
            return [dict(r) for r in rows]

    def get_summary(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self.engine.connect() as conn:
            query = text("""
                SELECT session_id, summary, last_summarized_message_id, updated_at
                FROM summaries
                WHERE session_id = :session_id
            """)
            result = conn.execute(query, {"session_id": session_id})
            row = result.mappings().fetchone()
            return dict(row) if row else None

    def save_or_update_summary(self, session_id: str, summary: str, last_summarized_message_id: int):
        with self.engine.connect() as conn:
            if self.is_mysql:
                query = text("""
                    INSERT INTO summaries (session_id, summary, last_summarized_message_id)
                    VALUES (:session_id, :summary, :last_summarized_message_id)
                    ON DUPLICATE KEY UPDATE
                        summary = VALUES(summary),
                        last_summarized_message_id = VALUES(last_summarized_message_id),
                        updated_at = CURRENT_TIMESTAMP
                """)
            else:
                query = text("""
                    INSERT INTO summaries (session_id, summary, last_summarized_message_id)
                    VALUES (:session_id, :summary, :last_summarized_message_id)
                    ON CONFLICT(session_id) DO UPDATE SET
                        summary = excluded.summary,
                        last_summarized_message_id = excluded.last_summarized_message_id,
                        updated_at = CURRENT_TIMESTAMP
                """)
            conn.execute(query, {
                "session_id": session_id,
                "summary": summary,
                "last_summarized_message_id": last_summarized_message_id
            })
            conn.commit()
            logger.info(f"[DB] Updated summary for session '{session_id}' up to message ID {last_summarized_message_id}.")

    def update_token_usage(self, session_id: str, usage: Dict[str, int], mode: str = "call") -> Dict[str, int]:
        """Updates and accumulates token usage (prompt_tokens, completion_tokens, total_tokens) in DB."""
        if not usage or not isinstance(usage, dict):
            return self.get_token_usage(session_id)

        p_tokens = usage.get("prompt_tokens", 0) if isinstance(usage.get("prompt_tokens"), int) else 0
        c_tokens = usage.get("completion_tokens", 0) if isinstance(usage.get("completion_tokens"), int) else 0
        t_tokens = usage.get("total_tokens", 0) if isinstance(usage.get("total_tokens"), int) else (p_tokens + c_tokens)

        with self.engine.connect() as conn:
            if self.is_mysql:
                query = text("""
                    INSERT INTO token_usage (session_id, prompt_tokens, completion_tokens, total_tokens)
                    VALUES (:session_id, :p_tokens, :c_tokens, :t_tokens)
                    ON DUPLICATE KEY UPDATE
                        prompt_tokens = prompt_tokens + VALUES(prompt_tokens),
                        completion_tokens = completion_tokens + VALUES(completion_tokens),
                        total_tokens = total_tokens + VALUES(total_tokens),
                        updated_at = CURRENT_TIMESTAMP
                """)
            else:
                query = text("""
                    INSERT INTO token_usage (session_id, prompt_tokens, completion_tokens, total_tokens)
                    VALUES (:session_id, :p_tokens, :c_tokens, :t_tokens)
                    ON CONFLICT(session_id) DO UPDATE SET
                        prompt_tokens = prompt_tokens + excluded.prompt_tokens,
                        completion_tokens = completion_tokens + excluded.completion_tokens,
                        total_tokens = total_tokens + excluded.total_tokens,
                        updated_at = CURRENT_TIMESTAMP
                """)
            conn.execute(query, {
                "session_id": session_id,
                "p_tokens": p_tokens,
                "c_tokens": c_tokens,
                "t_tokens": t_tokens
            })
            conn.commit()

        acc = self.get_token_usage(session_id)
        logger.info(f"[DB] Updated token usage for session '{session_id}' (Mode: {mode}) -> Added {t_tokens} tokens | Session Total: {acc['total_tokens']}")
        return acc

    def get_token_usage(self, session_id: str) -> Dict[str, int]:
        with self.engine.connect() as conn:
            query = text("""
                SELECT prompt_tokens, completion_tokens, total_tokens
                FROM token_usage
                WHERE session_id = :session_id
            """)
            result = conn.execute(query, {"session_id": session_id})
            row = result.mappings().fetchone()
            if row:
                return {
                    "prompt_tokens": row["prompt_tokens"],
                    "completion_tokens": row["completion_tokens"],
                    "total_tokens": row["total_tokens"]
                }
            return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    def add_agent_log(self, session_id: str, status: str, details: Optional[Dict[str, Any]] = None):
        """Inserts an execution status record into agent_logs table."""
        import json
        details_str = json.dumps(details) if details else ""
        with self.engine.connect() as conn:
            query = text("""
                INSERT INTO agent_logs (session_id, status, details)
                VALUES (:session_id, :status, :details)
            """)
            conn.execute(query, {
                "session_id": session_id,
                "status": status,
                "details": details_str
            })
            conn.commit()

    def get_agent_logs(self, session_id: str) -> List[Dict[str, Any]]:
        """Fetches all status log entries for a given session."""
        import json
        with self.engine.connect() as conn:
            query = text("""
                SELECT id, session_id, status, details, created_at
                FROM agent_logs
                WHERE session_id = :session_id
                ORDER BY id ASC
            """)
            result = conn.execute(query, {"session_id": session_id})
            logs = []
            for row in result.mappings():
                d = dict(row)
                if d.get("details"):
                    try:
                        d["details"] = json.loads(d["details"])
                    except Exception:
                        pass
                else:
                    d["details"] = {}
                if d.get("created_at"):
                    d["created_at"] = str(d["created_at"])
                logs.append(d)
            return logs

    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """Fetches distinct active session IDs and their latest activity timestamp."""
        with self.engine.connect() as conn:
            query = text("""
                SELECT session_id, MAX(created_at) as last_activity, COUNT(*) as message_count
                FROM messages
                GROUP BY session_id
                ORDER BY last_activity DESC
            """)
            result = conn.execute(query)
            sessions = []
            for row in result.mappings():
                d = dict(row)
                if d.get("last_activity"):
                    d["last_activity"] = str(d["last_activity"])
                sessions.append(d)
            return sessions

    def delete_session(self, session_id: str) -> bool:
        """Deletes all persistent records (messages, summaries, status logs, token usage, session jobs) for a given session_id from DB."""
        if not session_id:
            return False
        with self.engine.begin() as conn:
            for table in ["messages", "summaries", "agent_logs", "token_usage", "session_jobs"]:
                try:
                    conn.execute(text(f"DELETE FROM {table} WHERE session_id = :session_id"), {"session_id": session_id})
                except Exception as e:
                    logger.warning(f"Failed to delete from table '{table}' for session '{session_id}': {e}")
        logger.info(f"[DB DELETE] Deleted all persistent records for session '{session_id}'.")
        return True

    def save_session_job(self, session_id: str, job_id: str, job_title: str = "", company: str = "", location: str = "", details: Optional[Dict[str, Any]] = None):
        """Caches a job ID associated with a session_id in DB."""
        details_json = json.dumps(details) if details else None
        with self.engine.connect() as conn:
            if self.is_mysql:
                query = text("""
                    INSERT INTO session_jobs (session_id, job_id, job_title, company, location, details)
                    VALUES (:session_id, :job_id, :job_title, :company, :location, :details)
                    ON DUPLICATE KEY UPDATE
                        job_title = VALUES(job_title),
                        company = VALUES(company),
                        location = VALUES(location),
                        details = VALUES(details)
                """)
            else:
                query = text("""
                    INSERT INTO session_jobs (session_id, job_id, job_title, company, location, details)
                    VALUES (:session_id, :job_id, :job_title, :company, :location, :details)
                    ON CONFLICT(session_id, job_id) DO UPDATE SET
                        job_title = excluded.job_title,
                        company = excluded.company,
                        location = excluded.location,
                        details = excluded.details
                """)
            conn.execute(query, {
                "session_id": session_id,
                "job_id": str(job_id),
                "job_title": job_title or "",
                "company": company or "",
                "location": location or "",
                "details": details_json
            })
            conn.commit()

    def get_session_jobs(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieves all cached job IDs for a given session_id from DB."""
        with self.engine.connect() as conn:
            query = text("""
                SELECT id, session_id, job_id, job_title, company, location, details, created_at
                FROM session_jobs
                WHERE session_id = :session_id
                ORDER BY id ASC
            """)
            result = conn.execute(query, {"session_id": session_id})
            jobs = []
            for row in result.mappings():
                d = dict(row)
                if d.get("details"):
                    try:
                        d["details"] = json.loads(d["details"])
                    except Exception:
                        pass
                if d.get("created_at"):
                    d["created_at"] = str(d["created_at"])
                jobs.append(d)
            return jobs

    def save_session_event(self, session_id: str, event_type: str, data: Dict[str, Any]) -> None:
        """Saves a real-time delta event into MySQL database."""
        if not session_id or not event_type:
            return
        data_json = json.dumps(data) if isinstance(data, (dict, list)) else str(data)
        with self.engine.connect() as conn:
            query = text("""
                INSERT INTO session_events (session_id, event_type, data)
                VALUES (:session_id, :event_type, :data)
            """)
            conn.execute(query, {
                "session_id": session_id,
                "event_type": event_type,
                "data": data_json
            })
            conn.commit()

    def get_session_events(self, session_id: str) -> List[Dict[str, Any]]:
        """Queries recorded delta events for a given session_id from MySQL database."""
        if not session_id:
            return []
        with self.engine.connect() as conn:
            query = text("""
                SELECT id, session_id, event_type, data, created_at
                FROM session_events
                WHERE session_id = :session_id
                ORDER BY id ASC
            """)
            result = conn.execute(query, {"session_id": session_id})
            events = []
            for row in result.mappings():
                d = dict(row)
                if d.get("data"):
                    try:
                        d["data"] = json.loads(d["data"])
                    except Exception:
                        pass
                if d.get("created_at"):
                    d["created_at"] = str(d["created_at"])
                events.append({
                    "timestamp": d["created_at"],
                    "session_id": d["session_id"],
                    "event_type": d["event_type"],
                    "data": d.get("data", {})
                })
            return events

    def save_job_description(self, job_data: Dict[str, Any]) -> None:
        """Caches a complete job description metadata dictionary into DB by job_id."""
        if not job_data or not job_data.get("job_id"):
            return

        job_id = str(job_data.get("job_id"))
        title = job_data.get("title") or ""
        company_name = job_data.get("company_name") or ""
        location = job_data.get("location") or ""
        posted_time = job_data.get("posted_time") or ""
        num_applicants = job_data.get("num_applicants") or ""
        seniority_level = job_data.get("seniority_level") or ""
        employment_type = job_data.get("employment_type") or ""
        job_function = job_data.get("job_function") or ""
        job_url = job_data.get("job_url") or ""
        minimal_description = job_data.get("minimal_description") or ""
        raw_description = job_data.get("raw_description") or ""

        skills = job_data.get("skills_required") or []
        skills_json = json.dumps(skills) if isinstance(skills, (list, dict)) else str(skills)

        with self.engine.connect() as conn:
            if self.is_mysql:
                query = text("""
                    INSERT INTO job_descriptions (
                        job_id, title, company_name, location, posted_time, num_applicants,
                        seniority_level, employment_type, job_function, job_url,
                        minimal_description, raw_description, skills_required
                    )
                    VALUES (
                        :job_id, :title, :company_name, :location, :posted_time, :num_applicants,
                        :seniority_level, :employment_type, :job_function, :job_url,
                        :minimal_description, :raw_description, :skills_required
                    )
                    ON DUPLICATE KEY UPDATE
                        title = VALUES(title),
                        company_name = VALUES(company_name),
                        location = VALUES(location),
                        posted_time = VALUES(posted_time),
                        num_applicants = VALUES(num_applicants),
                        seniority_level = VALUES(seniority_level),
                        employment_type = VALUES(employment_type),
                        job_function = VALUES(job_function),
                        job_url = VALUES(job_url),
                        minimal_description = VALUES(minimal_description),
                        raw_description = VALUES(raw_description),
                        skills_required = VALUES(skills_required)
                """)
            else:
                query = text("""
                    INSERT INTO job_descriptions (
                        job_id, title, company_name, location, posted_time, num_applicants,
                        seniority_level, employment_type, job_function, job_url,
                        minimal_description, raw_description, skills_required
                    )
                    VALUES (
                        :job_id, :title, :company_name, :location, :posted_time, :num_applicants,
                        :seniority_level, :employment_type, :job_function, :job_url,
                        :minimal_description, :raw_description, :skills_required
                    )
                    ON CONFLICT(job_id) DO UPDATE SET
                        title = excluded.title,
                        company_name = excluded.company_name,
                        location = excluded.location,
                        posted_time = excluded.posted_time,
                        num_applicants = excluded.num_applicants,
                        seniority_level = excluded.seniority_level,
                        employment_type = excluded.employment_type,
                        job_function = excluded.job_function,
                        job_url = excluded.job_url,
                        minimal_description = excluded.minimal_description,
                        raw_description = excluded.raw_description,
                        skills_required = excluded.skills_required
                """)
            conn.execute(query, {
                "job_id": job_id,
                "title": title,
                "company_name": company_name,
                "location": location,
                "posted_time": posted_time,
                "num_applicants": num_applicants,
                "seniority_level": seniority_level,
                "employment_type": employment_type,
                "job_function": job_function,
                "job_url": job_url,
                "minimal_description": minimal_description,
                "raw_description": raw_description,
                "skills_required": skills_json
            })
            conn.commit()
            logger.info(f"[DB CACHE] Cached job description in DB for job_id '{job_id}'.")

    def get_cached_job_description(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Queries cached job description by job_id from DB."""
        if not job_id:
            return None

        with self.engine.connect() as conn:
            query = text("""
                SELECT job_id, title, company_name, location, posted_time, num_applicants,
                       seniority_level, employment_type, job_function, job_url,
                       minimal_description, raw_description, skills_required, created_at
                FROM job_descriptions
                WHERE job_id = :job_id
            """)
            result = conn.execute(query, {"job_id": str(job_id)})
            row = result.mappings().fetchone()
            if not row:
                return None

            d = dict(row)
            if d.get("skills_required"):
                try:
                    d["skills_required"] = json.loads(d["skills_required"])
                except Exception:
                    pass
            if d.get("created_at"):
                d["created_at"] = str(d["created_at"])
            return d


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

        # Resolve DB URL (defaults to os.getenv('DATABASE_URL') or MySQL dev DB)
        final_db_url = db_url or os.getenv("DATABASE_URL") or "mysql+pymysql://admin:admin@127.0.0.1:3306/dev"
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
        self.db.add_message(
            session_id=self.session_id,
            role="assistant",
            content=response_text,
            token_count=a_tokens
        )

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
