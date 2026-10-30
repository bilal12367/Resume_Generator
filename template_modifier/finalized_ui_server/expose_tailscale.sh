#!/usr/bin/env bash
set -e

TS_AUTHKEY="${TS_AUTHKEY:-tskey-auth-kzCxGzhg3521CNTRL-Mzf8bpXJDcJ4FgUdmyAjcJJcdTQvh3B1}"
TS_HOSTNAME="bilal1-job-scraper-2"
PORT="8000"

echo "============================================"
echo " Tailscale Funnel Setup for Port $PORT"
echo " Hostname: $TS_HOSTNAME"
echo "============================================"

echo "[1/4] Ensuring tailscaled daemon is running..."
if  ! pgrep -x "tailscaled" > /dev/null; then
    sudo service tailscaled start 2>/dev/null || sudo systemctl start tailscaled 2>/dev/null || true
fi

echo "[2/4] Connecting Tailscale with auth key..."
sudo tailscale up \
    --authkey="$TS_AUTHKEY" \
    --hostname="$TS_HOSTNAME" \
    --operator="$USER" \
    --reset

echo "[3/4] Enabling Tailscale Funnel on port $PORT..."
tailscale funnel --bg --yes "$PORT"

echo "[4/4] Tailscale Funnel Status:"
echo "----------------------------------------------"
tailscale funnel status
echo "----------------------------------------------"

PUBLIC_URL=$(tailscale funnel status 2>/dev/null | grep -o 'https://[^ ]*' | head -n 1)

if [ -n "$PUBLIC_URL" ]; then
    echo ""
    echo "SUCCESS! Server is publicly live at:"
    echo "  $PUBLIC_URL"
    echo ""
    echo "Set this in your mobile_app/.env:"
    echo "  API_BASE_URL=$PUBLIC_URL"
fi
