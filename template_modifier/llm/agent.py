import os
import uuid
import inspect
import sqlite3
import logging
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
        url_val = url or os.getenv("DATABASE_URL") or "sqlite:///agent.db"
        url_str = url_val.strip()
        if url_str.startswith("mysql://"):
            return url_str.replace("mysql://", "mysql+pymysql://", 1)
        elif url_str.startswith("mysql+pymysql://") or url_str.startswith("sqlite:///"):
            return url_str
        elif "://" not in url_str:
            return f"sqlite:///{url_str}"
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

        # Resolve DB URL (defaults to os.getenv('DATABASE_URL') or 'sqlite:///agent.db')
        final_db_url = db_url or os.getenv("DATABASE_URL") or "sqlite:///agent.db"
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

        kwargs = {"model": sf_model, "timeout": 120.0}
        if sf_api_key:
            kwargs["api_key"] = sf_api_key
        if sf_base_url:
            kwargs["base_url"] = sf_base_url

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
        """Processes user chat request asynchronously with DB recording, condensation, token usage accumulation, and tool execution."""
        logger.info(f"=== Starting async chat execution [Session: {self.session_id}] ===")
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

        # 3. Call LLM asynchronously
        logger.info(f"Invoking SiliconFlow LLM async with {len(context_messages)} context message(s)...")
        if self.tools:
            logger.info(f"Executing apredict_and_call with {len(self.tools)} tool(s)...")
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

            except Exception as e:
                logger.error(f"apredict_and_call failed: {e}. Falling back to achat method.", exc_info=True)
                full_msgs = context_messages + [ChatMessage(role=MessageRole.USER, content=user_input)]
                res = await self.llm.achat(full_msgs)
                response_text = res.message.content
                usage = extract_usage_from_response(res)
                if usage:
                    self.update_token_usage(usage, mode='call')
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
