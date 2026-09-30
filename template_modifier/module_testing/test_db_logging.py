import asyncio
import os
import uuid
import sqlite3
import json
from llm_enhancement.config import AgentConfig
from llm_enhancement.mcp_agent import MCPAgent

async def test_logging():
    print("Initializing AgentConfig...")
    agnt_cnf = AgentConfig()
    agnt_cnf.set_db_uri("sqlite:///agent_conv.db")
    agnt_cnf.set_prompt("You are a testing agent.")
    agnt_cnf.set_provider_type("SILICONFLOW")
    agnt_cnf.set_token_limit(100000)

    session_id = str(uuid.uuid4())
    print(f"Creating MCPAgent with session_id: {session_id}")
    agent = MCPAgent(
        agent_config=agnt_cnf,
        run_id=session_id,
        mcp_urls=["http://127.0.0.1:8000/sse"]
    )

    try:
        # Establish connection to MCP server
        print("Connecting to MCP Server...")
        await agent.connect_mcp()

        # Let's list the tools to confirm we are connected
        print(f"Connected tools: {[t.metadata.name for t in agent.tools]}")

        # Manually call a tool (e.g. search_linkedin_jobs) with dummy args
        # This will trigger our db logging code in call_tool_manually
        tool_name = "search_linkedin_jobs"
        arguments = {"keywords": "Python", "locations": "San Francisco"}
        print(f"\nManually calling '{tool_name}' with arguments: {arguments}")
        
        try:
            res = await agent.call_tool_manually(tool_name, arguments)
            print(f"Tool call finished. Result preview: {str(res)[:200]}...")
        except Exception as e:
            print(f"Tool execution failed (this is expected if server/playwright is not fully initialized): {e}")

        # Connect to SQLite database and verify the logged events
        db_path = "agent_conv.db"
        print(f"\nChecking SQLite database at '{db_path}' for logged events...")
        if not os.path.exists(db_path):
            print(f"Error: Database file '{db_path}' does not exist.")
            return

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_events'")
        table_exists = cursor.fetchone()
        if not table_exists:
            print("Error: 'tool_events' table was not created in the database.")
            return
            
        print("Success: 'tool_events' table exists.")

        # Query all logged events for our session
        cursor.execute(
            "SELECT session_id, event_type, tool_name, content, timestamp FROM tool_events WHERE session_id = ?",
            (session_id,)
        )
        rows = cursor.fetchall()
        print(f"\nFound {len(rows)} logged events for session_id '{session_id}':")
        for row in rows:
            print(f" - Timestamp: {row[4]}")
            print(f"   Event Type: {row[1]}")
            print(f"   Tool Name: {row[2]}")
            print(f"   Content: {row[3][:150]}...")
            print()
            
        conn.close()

    finally:
        print("Disconnecting MCP sessions...")
        await agent.disconnect_mcp()

if __name__ == "__main__":
    asyncio.run(test_logging())
