#!/bin/bash

# ==============================================================================
# Resume Generator & Job Scraper — Full Development Environment Launcher
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║      🚀 Launching Full Development Environment (4 Terminals)         ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  1. Centrifugo WebSocket Server  → http://localhost:8002             ║"
echo "║  2. LinkedIn MCP Server (SSE)    → http://localhost:8000/sse         ║"
echo "║  3. Job Scraper API (FastAPI)    → http://localhost:8080             ║"
echo "║  4. React UI (Vite Dev Server)   → http://localhost:5173             ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
# Check if gnome-terminal is available to open separate terminal windows
if command -v gnome-terminal &> /dev/null && [ -n "$DISPLAY" -o -n "$WAYLAND_DISPLAY" ]; then
    echo "🖥️  Opening services in separate GNOME Terminal windows..."
    docker rm -f centrifugo 2>/dev/null || true
    gnome-terminal --title="Centrifugo WS (8002)" -- bash -c "cd '$ROOT_DIR' && echo 'Starting Centrifugo...' && docker compose -f dev_containers/centrifugo-compose.yaml up; exec bash"
    gnome-terminal --title="LinkedIn MCP (8000)" -- bash -c "cd '$ROOT_DIR' && echo 'Starting LinkedIn MCP Server...' && uv run mcps/linkedin_platform.py; exec bash"
    gnome-terminal --title="Job Scraper API (8080)" -- bash -c "cd '$ROOT_DIR' && echo 'Starting Job Scraper API...' && uv run -m module_testing.job_scraper_2; exec bash"
    gnome-terminal --title="React UI (5173)" -- bash -c "cd '$ROOT_DIR/job_scraper_ui' && echo 'Starting Vite UI...' && npm run dev; exec bash"

    echo "✅ All 4 services opened in separate GNOME Terminal windows."
    exit 0
fi

# Fallback: Launch all 4 services in background with trap cleanup for headless / non-GUI environments
echo "⚠️  GNOME Terminal not detected. Starting all services concurrently in background..."

cleanup() {
    echo ""
    echo "🛑 Stopping all background services..."
    kill 0
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo "🔹 Starting Centrifugo..."
docker compose -f dev_containers/centrifugo-compose.yaml up &

echo "🔹 Starting LinkedIn MCP Server..."
uv run mcps/linkedin_platform.py &

sleep 2

echo "🔹 Starting Job Scraper API..."
uv run -m module_testing.job_scraper &

echo "🔹 Starting React UI Dev Server..."
(cd job_scraper_ui && npm run dev) &

echo ""
echo "✨ All services running. Press CTRL+C to stop all."
wait
