# SiliconFlow ReAct Agent Documentation (`agent.py`)

A production-ready Python ReAct (Reasoning and Acting) Agent powered by `SiliconFlow` LLMs and `LlamaIndex`. Features automatic SQLite and MySQL database conversation history persistence, token budget enforcement, progressive context condensation with cutoff message tracking, real-time response token usage capturing, and database token usage accumulation.

---

## 🌟 Key Features

1. **Dual Database Engine Support (SQLite & MySQL)**:
   - Supports both local SQLite (`sqlite:///agent.db`) and MySQL (`mysql://user:password@host:port/dbname` or `mysql+pymysql://...`).
   - Handles schema initialization, index creation, and dialect-specific UPSERT operations automatically.
2. **Persistent Conversation History**: Stores user, assistant, and system messages in the database (`messages` table).
3. **Real-time Token Usage & Database Accumulation**:
   - Captures `prompt_tokens`, `completion_tokens`, and `total_tokens` directly from raw LLM responses/stream chunks (`raw['usage']`).
   - Automatically adds incoming token counts to existing totals in the database (`token_usage` table).
4. **Token Limit Enforcement**: Dynamically tracks context token count to prevent API token limit overflow.
5. **Progressive Message Condensation**:
   - Automatically summarizes older messages outside the token budget.
   - Incrementally updates the summary: `Existing Summary + New Overflow Messages = Updated Summary`.
   - Tracks the exact cutoff message ID (`last_summarized_message_id`) in the database.
6. **Automatic Tool Calling**: Accepts any python function (callables). Automatically extracts function names and docstrings to register tool descriptions.
7. **ReAct Reasoning Loop**: Built-in ReAct system prompt and step-by-step reasoning support via `predict_and_call`.
8. **Sync, Async & Streaming API**: Provides `chat()`, `achat()`, `chat_stream()`, and `achat_stream()` methods.
9. **Comprehensive Logging**: Detailed `logging` output for debugging database queries, token allocations, condensation triggers, and tool execution.

---

## 🚀 Quick Start

### Prerequisites & Setup

Set your SiliconFlow API credentials in your environment:

```bash
export SILICONFLOW_API_KEY="your_siliconflow_api_key"
# Optional overrides:
export SILICONFLOW_MODEL_ID="Qwen/Qwen2.5-72B-Instruct"
export SILICONFLOW_BASE_URL="https://api.siliconflow.cn/v1"
```

### Database Connection Examples

```python
from llm.agent import Agent

# 1. Using SQLite Database (Default)
agent_sqlite = Agent(
    session_id="user_session_001",
    db_url="sqlite:///agent.db"  # Or simply "agent.db"
)

# 2. Using MySQL Database
agent_mysql = Agent(
    session_id="user_session_001",
    db_url="mysql://admin:admin@localhost:3306/dev"  # Or mysql+pymysql://...
)

# Send a chat prompt
response = agent_mysql.chat("Hello! I am a Python developer working on AI projects.")
print("Agent:", response)
print("Current DB Accumulated Token Usage:", agent_mysql.usage)
```

---

## 🛠️ Tool Calling Usage

You can pass standard Python functions to `tools`. The agent inspects `fn.__doc__` to extract descriptions for the LLM.

```python
from llm.agent import Agent

# Define tools with informative docstrings
def calculate_salary_tax(annual_salary: float, tax_rate: float = 0.20) -> float:
    """Calculates income tax amount based on annual salary and tax rate."""
    return annual_salary * tax_rate

def generate_user_report(name: str, salary: float) -> str:
    """Generates a summary report string for a candidate."""
    tax = calculate_salary_tax(salary)
    net = salary - tax
    return f"Candidate {name}: Gross ${salary:,.2f}, Tax ${tax:,.2f}, Net ${net:,.2f}"

# Initialize Agent with tools
agent = Agent(
    session_id="finance_session",
    tools=[calculate_salary_tax, generate_user_report]
)

# Query requiring tool execution
reply = agent.chat("Calculate net income for Bilal who makes $120,000 annually.")
print("Result:", reply)
print("Session Token Usage:", agent.usage)
```

---

## ⚡ Streaming & Asynchronous API

### 1. Synchronous Streaming (`chat_stream`)
```python
from llm.agent import Agent

agent = Agent(session_id="stream_session")

print("Real-time Stream: ", end="", flush=True)
for delta in agent.chat_stream("Write a short poem about open-source software."):
    print(delta, end="", flush=True)

print("\n\nAccumulated Token Usage:", agent.usage)
```

### 2. Asynchronous Real-Time Streaming (`achat_stream`)
Ideal for FastAPI `StreamingResponse`, SSE, WebSockets, or async event loops:

```python
import asyncio
from llm.agent import Agent

async def main():
    agent = Agent(session_id="async_stream_session")

    print("Real-time Async Stream: ", end="", flush=True)
    async for delta in agent.achat_stream("Explain async programming in Python in 2 sentences."):
        print(delta, end="", flush=True)
        
    print("\n\nAccumulated Token Usage:", agent.usage)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 🧠 Database Schema & Token Usage Tracking

The agent manages three SQLite tables:

1. **`messages`**:
   - `id`: Primary Key.
   - `session_id`: Unique identifier for session.
   - `role`: Role (`user`, `assistant`, `system`).
   - `content`: Message text.
   - `token_count`: Estimated tokens.
   - `created_at`: Timestamp.

2. **`summaries`**:
   - `session_id`: Session ID.
   - `summary`: Condensed summary text.
   - `last_summarized_message_id`: Cutoff message ID.
   - `updated_at`: Timestamp.

3. **`token_usage`**:
   - `session_id`: Session ID (Primary Key).
   - `prompt_tokens`: Cumulative prompt tokens.
   - `completion_tokens`: Cumulative completion tokens.
   - `total_tokens`: Cumulative total tokens (`prompt_tokens + completion_tokens`).
   - `updated_at`: Timestamp.

---

## ⚙️ Configuration Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `session_id` | `str` | `None` (UUID generated) | Unique ID tracking session history & token usage in DB |
| `SYSTEM_PROMPT` | `str` | ReAct Prompt | System instructions guiding model behavior |
| `token_limit` | `int` | `3000` | Max token budget for API context window |
| `db_url` | `str` | `'sqlite:///agent.db'` | Database connection URL/path |
| `tools` | `list` | `None` | List of Python functions or `FunctionTool` objects |
| `model` | `str` | `Qwen/Qwen2.5-72B-Instruct` | SiliconFlow model identifier |
| `api_key` | `str` | Env `SILICONFLOW_API_KEY` | SiliconFlow API Key |
| `base_url` | `str` | Env `SILICONFLOW_BASE_URL` | Optional custom API base URL |
