#!/bin/bash
#
# Start complete SpatialOS system
#
# This script starts:
# 1. Web app (React + 3D scene)
# 2. Voice assistant (voice-harness + MCP server)
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  SpatialOS - Spatial Computing Interface${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

PROJECT_DIR="$HOME/Projects/Active/SpatialOS"
cd "$PROJECT_DIR"

# Check dependencies
echo "Checking dependencies..."

if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} pnpm not found - install it first:"
    echo "  npm install -g pnpm"
    exit 1
fi

if ! command -v voice-harness &> /dev/null; then
    echo -e "${YELLOW}⚠${NC} voice-harness not found - install it first:"
    echo "  cd ~/Projects/Active/voice-harness"
    echo "  pip install -e ."
    exit 1
fi

if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} Ollama not running - start it first:"
    echo "  ollama serve"
    exit 1
fi

echo -e "${GREEN}✓${NC} All dependencies ready"
echo ""

# Start web app in background
echo -e "${BLUE}Starting web app...${NC}"
pnpm dev > /tmp/spatialos-web.log 2>&1 &
WEB_PID=$!

# Wait for web app to start
echo "Waiting for web app..."
sleep 3

if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} Web app failed to start"
    echo "Check logs: tail -f /tmp/spatialos-web.log"
    kill $WEB_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✓${NC} Web app running at http://localhost:5173"
echo ""

# Instructions
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ System Ready${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  1. Open browser: ${BLUE}http://localhost:5173${NC}"
echo "  2. Start voice assistant in another terminal:"
echo ""
echo "     ${YELLOW}cd ~/Projects/Active/SpatialOS${NC}"
echo "     ${YELLOW}./scripts/start-voice.sh${NC}"
echo ""
echo "  3. Hold SPACEBAR and say:"
echo "     • \"Create a note hello world\""
echo "     • \"Set a timer for 5 minutes\""
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Wait for user to stop
trap "kill $WEB_PID 2>/dev/null || true; echo ''; echo 'Stopped.'; exit 0" INT TERM

tail -f /tmp/spatialos-web.log &
TAIL_PID=$!

wait $WEB_PID
kill $TAIL_PID 2>/dev/null || true
