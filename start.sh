#!/usr/bin/env bash
# Railway start command for the "api" service (BUILD_PLAN T2.8).
# All four MCP servers run INSIDE this container on 127.0.0.1 (never
# exposed publicly); only the FastAPI backend binds the public $PORT.
set -e

cd "$(dirname "$0")"

python mcp/profile_server.py &
python mcp/memory_server.py &
python mcp/actions_server.py &
python mcp/emh_server.py &

# Give the servers a moment, then serve the API on Railway's port.
sleep 3
cd api
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
