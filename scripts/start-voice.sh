#!/bin/bash
#
# Start voice-harness with SpatialOS MCP server
#
# This script runs voice-harness with the spatial assistant persona
# The MCP server will be spawned automatically by voice-harness
#

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  SpatialOS Voice Assistant${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check voice-harness is installed
if ! command -v voice-harness &> /dev/null; then
    echo "Error: voice-harness not found in PATH"
    echo ""
    echo "Install voice-harness:"
    echo "  cd ~/Projects/Active/voice-harness"
    echo "  pip install -e ."
    exit 1
fi

# Check Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "⚠️  Warning: Ollama not responding at http://localhost:11434"
    echo ""
    echo "Start Ollama:"
    echo "  ollama serve"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check MCP server is built
MCP_SERVER="$PWD/mcp-server/dist/index.js"
if [ ! -f "$MCP_SERVER" ]; then
    echo "Error: MCP server not found at $MCP_SERVER"
    echo ""
    echo "Build MCP server:"
    echo "  cd ~/Projects/Active/SpatialOS/mcp-server"
    echo "  pnpm build"
    exit 1
fi

echo -e "${GREEN}✓${NC} voice-harness found"
echo -e "${GREEN}✓${NC} Ollama running"
echo -e "${GREEN}✓${NC} MCP server built"
echo ""

# Configuration
export LLM_ENGINE=ollama
export OLLAMA_HOST=http://localhost:11434
export OLLAMA_MODEL=llama3.1:8b
export INPUT_MODE=ptt
export MCP_CONFIG="$PWD/voice-config/mcp.json"

# Load spatial persona
PERSONA_FILE="$PWD/voice-config/spatial-persona.txt"
if [ -f "$PERSONA_FILE" ]; then
    export OLLAMA_SYSTEM_PROMPT=$(cat "$PERSONA_FILE")
    echo -e "${GREEN}✓${NC} Spatial persona loaded"
else
    echo "⚠️  Warning: Spatial persona not found at $PERSONA_FILE"
fi

echo ""
echo -e "${BLUE}Starting voice assistant...${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Hold SPACEBAR to talk"
echo "  ESC to quit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run voice-harness
voice-harness
