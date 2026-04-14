import asyncio
import uvicorn
from llama_agents.server import WorkflowServer

from workflow import MyWorkflow

# ── Instantiate ────────────────────────────────────────────────────────────
server = WorkflowServer()
server.add_workflow("my-workflow", MyWorkflow(timeout=None, verbose=True))

# ── Run ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("WorkflowServer running → http://localhost:8080")
    asyncio.run(server.serve(host='localhost', port=8080))