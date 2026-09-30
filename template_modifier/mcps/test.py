import asyncio
import os
import sys
from mcp import ClientSession
from mcp.client.sse import sse_client

async def main():
    # The SSE URL of the running LinkedIn MCP Server
    # Defaults to http://localhost:8000/sse or LINKEDIN_MCP_PORT env variable
    port = int(os.getenv("LINKEDIN_MCP_PORT", 8000))
    server_url = f"http://127.0.0.1:{port}/sse"
    
    print(f"Connecting to LinkedIn MCP Server at {server_url}...")
    
    try:
        async with sse_client(server_url) as (read, write):
            async with ClientSession(read, write) as session:
                # Initialize the connection with the server
                print("Initializing session...")
                await session.initialize()
                
                # List available tools to verify connection
                print("Listing available tools...")
                tools_response = await session.list_tools()
                tool_names = [tool.name for tool in tools_response.tools]
                print(f"Successfully connected! Available tools: {tool_names}\n")
                
                # Verify that search_linkedin_jobs is in the tool list
                tool_to_test = "search_linkedin_jobs"
                if tool_to_test not in tool_names:
                    print(f"Error: '{tool_to_test}' tool is not available on the server.")
                    return
                
                # Call search_linkedin_jobs tool
                keywords = "Python, AI Engineer"
                locations = "Remote"
                print(f"Calling '{tool_to_test}' with keywords='{keywords}', locations='{locations}'...")
                
                result = await session.call_tool(
                    name=tool_to_test,
                    arguments={
                        "keywords": keywords,
                        "locations": locations
                    }
                )
                
                print("\n--- Response from tool ---")
                print(result)
                print("--------------------------")
                
    except Exception as e:
        print(f"\nFailed to connect/execute: {e}")
        print("\nMake sure the LinkedIn MCP Server is running. You can start it by running:")
        print("  ./start_mcps.sh")
        sys.exit(1)

if __name__ == "__main__":
    # Ensure event loop runs properly
    asyncio.run(main())
