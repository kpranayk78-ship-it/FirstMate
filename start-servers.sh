#!/usr/bin/env bash

# FirstMate Multi-Server Launcher
# Starts both frontend (port 3000) and backend (port 3001) servers simultaneously,
# prefixes their logs with beautiful colors, and handles graceful cleanup on Ctrl+C.

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ASCII Art Header
clear
echo -e "${CYAN}${BOLD}"
echo "=========================================================="
echo "      ______ _               __  __       _               "
echo "     |  ____(_)             |  \/  |     | |              "
echo "     | |__   _ _ __ ___  ___| \  / | __ _| |_ ___         "
echo "     |  __| | | '__/ __|/ __| |\/| |/ _\` | __/ _ \\        "
echo "     | |    | | |  \__ \\ (__| |  | | (_| | ||  __/        "
echo "     |_|    |_|_|  |___/\___|_|  |_|\__,_|\__\___|        "
echo "                                                          "
echo "            ★  Multi-Server Control Panel  ★            "
echo "=========================================================="
echo -e "${NC}"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# PIDs of launched servers
BACKEND_PID=0
FRONTEND_PID=0

# Clean shutdown function
cleanup() {
    echo -e "\n\n${YELLOW}[!] Stopping servers and cleaning up...${NC}"
    
    if [ $BACKEND_PID -ne 0 ]; then
        if kill -0 $BACKEND_PID 2>/dev/null; then
            echo -e "${RED}[-] Stopping Backend Server (PID $BACKEND_PID)...${NC}"
            kill -TERM -$BACKEND_PID 2>/dev/null || kill -TERM $BACKEND_PID 2>/dev/null
        fi
    fi

    if [ $FRONTEND_PID -ne 0 ]; then
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            echo -e "${RED}[-] Stopping Frontend Server (PID $FRONTEND_PID)...${NC}"
            kill -TERM -$FRONTEND_PID 2>/dev/null || kill -TERM $FRONTEND_PID 2>/dev/null
        fi
    fi

    # Give a moment to stop gracefully, then force kill if any remain
    sleep 0.5
    
    # Final check and force clean port-using processes just in case
    for port in 3000 3001; do
        PID_ON_PORT=$(lsof -t -i:$port 2>/dev/null)
        if [ ! -z "$PID_ON_PORT" ]; then
            kill -9 $PID_ON_PORT 2>/dev/null
        fi
    done

    echo -e "${GREEN}[✓] All servers stopped. Thank you for using FirstMate!${NC}\n"
    exit 0
}

# Trap signals for cleanup
trap cleanup SIGINT SIGTERM EXIT

# Port check helper
check_port() {
    local port=$1
    local name=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}[!] Warning: Port $port ($name) is already in use.${NC}"
        echo -n -e "    Would you like to stop the existing process running on port $port? (y/N): "
        read -r answer
        if [[ "$answer" =~ ^[Yy]$ ]]; then
            PID_TO_KILL=$(lsof -t -i:$port)
            if [ ! -z "$PID_TO_KILL" ]; then
                echo -e "    ${RED}[-] Killing process $PID_TO_KILL...${NC}"
                kill -9 $PID_TO_KILL 2>/dev/null
                sleep 0.5
            fi
        else
            echo -e "    ${RED}[Error] Port $port is busy. Cannot start $name.${NC}"
            exit 1
        fi
    fi
}

echo -e "${CYAN}[*] Step 1: Checking system ports...${NC}"
check_port 3001 "Express Backend"
check_port 3000 "Vite Frontend"

echo -e "\n${CYAN}[*] Step 2: Booting Servers...${NC}"

# Check backend configuration
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}[!] Warning: backend/.env file not found. AI features might not work properly without a GEMINI_API_KEY!${NC}"
fi

# Launch Express Backend in its own process group
echo -e "${GREEN}[+] Starting Express Backend on port 3001...${NC}"
# Use set -m to enable job control in subshell, allowing process groups to be terminated properly
(
    set -m
    cd backend || exit 1
    # Run server and format standard output
    npm run dev 2>&1 | sed --unbuffered -e "s/^/\x1b[32m[Backend]\x1b[0m /"
) &
BACKEND_PID=$!

# Launch Vite Frontend in its own process group
echo -e "${BLUE}[+] Starting Vite Frontend on port 3000...${NC}"
(
    set -m
    # Run dev server and format standard output
    npm run dev 2>&1 | sed --unbuffered -e "s/^/\x1b[34m[Frontend]\x1b[0m /"
) &
FRONTEND_PID=$!

# Wait for a couple of seconds to check if they crashed immediately
sleep 2

# Check if servers are still running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}[Error] Backend server failed to start. Please check the logs above.${NC}"
    exit 1
fi

if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}[Error] Frontend server failed to start. Please check the logs above.${NC}"
    exit 1
fi

echo -e "\n${GREEN}${BOLD}[✓] Both servers launched successfully!${NC}"
echo -e "    - ${GREEN}Backend API:${NC}   http://localhost:3001"
echo -e "    - ${BLUE}Frontend Web:${NC}  http://localhost:3000"
echo -e "    - Press ${YELLOW}${BOLD}Ctrl+C${NC} at any time to stop both servers."
echo -e "==========================================================\n"

# Keep the script running to stream logs and manage child lifetimes
wait
