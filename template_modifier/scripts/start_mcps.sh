#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

explorer.exe "$SCRIPT_DIR/mcp_agent_preview.html" 2>/dev/null || true
cd "$PROJECT_ROOT"
uv run mcps/linkedin_platform.py