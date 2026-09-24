#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TAILSCALE_AUTH_KEY="tskey-client-kY64CTJxq821CNTRL-cZ5E12PT59dHYbQ9kX4U9dKsddXAvTHN"
TAILSCALE_TAGS="tag:admin-test"

show_help() {
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║       Resume Generator — Unified Docker & Tailscale Launcher         ║"
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    echo "║  Usage: ./expose_service.sh [MODE / FLAG]                            ║"
    echo "║                                                                      ║"
    echo "║  Modes / Flags:                                                      ║"
    echo "║    1. -b, --build, build          Only build Docker images           ║"
    echo "║    2. -u, --up, up, start         Run Docker Compose services        ║"
    echo "║    3. -e, --expose, expose        Expose Tailscale Funnel            ║"
    echo "║    4. -o, --funnel-off, unexpose  Stop Tailscale Funnel              ║"
    echo "║    5. -d, --down, down, stop      Stop Docker Compose services       ║"
    echo "║    6. -a, --all, all              Build, Run Compose & Expose Funnel ║"
    echo "║    -h, --help, help               Show this help menu                ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
}

check_prereqs() {
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is not installed. Please install Docker first."
        exit 1
    fi
    if ! docker compose version &> /dev/null 2>&1; then
        echo "❌ Docker Compose (v2) is not available."
        exit 1
    fi
    if [ ! -f ".env" ]; then
        echo "⚠️  No .env file found in scripts directory."
        exit 1
    fi
}

do_build() {
    check_prereqs
    echo "🔨 Building all Docker images..."
    docker compose build
}

do_up() {
    check_prereqs
    echo "🚀 Starting all services..."
    docker compose up -d

    echo ""
    echo "⏳ Waiting for services to be healthy..."
    sleep 5

    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Job Scraper API is healthy"
    else
        echo "⏳ Job Scraper API is starting up..."
    fi

    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  🌐 Application running at:                      ║"
    echo "║     http://localhost:3000                         ║"
    echo "║                                                  ║"
    echo "║  📊 Routes:                                      ║"
    echo "║     /         → UI (React)                       ║"
    echo "║     /api/     → Job Scraper API                  ║"
    echo "║     /ws       → Centrifugo WebSocket             ║"
    echo "║     /output/  → Generated PDF files              ║"
    echo "╚══════════════════════════════════════════════════╝"
}

do_down() {
    check_prereqs
    echo "🛑 Stopping Docker Compose services..."
    docker compose down
}

do_funnel_on() {
    echo "🔗 Exposing service via Tailscale Funnel..."
    sudo tailscale set --operator=$USER
    if command -v tailscale &> /dev/null; then
        tailscale up --auth-key="$TAILSCALE_AUTH_KEY" --advertise-tags="$TAILSCALE_TAGS" --reset 2>/dev/null || \
        tailscale up --auth-key="$TAILSCALE_AUTH_KEY" --advertise-tags="$TAILSCALE_TAGS" || true
        
        echo "🚀 Enabling Tailscale Funnel on port 3000...1"
        sudo tailscale funnel --bg 3000 2>/dev/null || tailscale funnel 3000
    elif command -v sudo &> /dev/null; then
        sudo tailscale up --auth-key="$TAILSCALE_AUTH_KEY" --advertise-tags="$TAILSCALE_TAGS" --reset 2>/dev/null || \
        sudo tailscale up --auth-key="$TAILSCALE_AUTH_KEY" --advertise-tags="$TAILSCALE_TAGS" || true

        echo "🚀 Enabling Tailscale Funnel on port 3000...2"
        sudo tailscale funnel --bg 3000 2>/dev/null || tailscale funnel 3000
    else
        echo "❌ Tailscale CLI not found."
        exit 1
    fi
}

do_funnel_off() {
    echo "🔌 Stopping Tailscale Funnel..."
    if command -v tailscale &> /dev/null; then
        sudo tailscale funnel reset
    elif command -v sudo &> /dev/null; then
        sudo tailscale funnel reset
    fi
    echo "✅ Tailscale Funnel stopped."
}

MODE="${1:-}"

case "$MODE" in
    -b|--build|build)
        do_build
        ;;
    -u|--up|up|start)
        do_up
        ;;
    -d|--down|down|stop)
        do_down
        ;;
    -e|--expose|expose|funnel|funnel-on)
        do_funnel_on
        ;;
    -o|--funnel-off|funnel-off|unexpose)
        do_funnel_off
        ;;
    -a|--all|all)
        do_build
        echo ""
        do_up
        echo ""
        do_funnel_on
        ;;
    -h|--help|help|"")
        show_help
        ;;
    *)
        echo "❌ Unknown flag/mode: $MODE"
        echo ""
        show_help
        exit 1
        ;;
esac
