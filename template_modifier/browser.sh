#!/bin/bash
# Start the FastAPI server and open the browser to the LLM page
cd "$(dirname "$0")"

echo "Starting server on http://localhost:8080 ..."
uv run python -m automation.server &
SERVER_PID=$!

# Wait for server to be ready
sleep 2

# Open browser (WSL → Windows browser)
if command -v explorer.exe &>/dev/null; then
    explorer.exe "http://localhost:8080"
elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:8080"
else
    echo "Open http://localhost:8080 in your browser"
fi

echo "Server running (PID $SERVER_PID). Press Ctrl+C to stop."
wait $SERVER_PID