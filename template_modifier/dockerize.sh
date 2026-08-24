#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║  Resume Generator — Docker Compose Launcher      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null 2>&1; then
    echo "❌ Docker Compose (v2) is not available. Please install Docker Compose."
    exit 1
fi

# Check .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Copying .env.example or creating a minimal one..."
    echo "Please create a .env file with your API keys."
    exit 1
fi

echo "🔨 Building all Docker images..."
docker compose build

echo ""
echo "🚀 Starting all services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check health
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Job Scraper API is healthy"
else
    echo "⏳ Job Scraper API is still starting up..."
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
echo "║                                                  ║"
echo "║  📋 Useful Commands:                             ║"
echo "║     docker compose logs -f        (view logs)    ║"
echo "║     docker compose down           (stop all)     ║"
echo "║     docker compose restart nginx  (restart proxy)║"
echo "╚══════════════════════════════════════════════════╝"
