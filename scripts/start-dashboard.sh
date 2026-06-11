#!/usr/bin/env bash
# start-dashboard.sh — Start the System Dashboard application stack.
#
# Startup order:
#   1. Backend (Rust/Axum on port 3001)
#   2. Frontend (Vite on port 5173) — only after backend health check passes
#
# Process management:
#   - Detects already-running services by port + health check
#   - Reuses healthy running services
#   - Prevents duplicate instances
#   - Handles stale PID files
#   - Uses process groups to manage child trees
#
# Usage:
#   ./scripts/start-dashboard.sh

set -euo pipefail

# ── Resolve project root (works from any working directory) ──────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOGS_DIR="$PROJECT_ROOT/logs"
PIDS_DIR="$PROJECT_ROOT/pids"

BACKEND_PORT=3001
FRONTEND_PORT=5173
BACKEND_HEALTH="http://localhost:${BACKEND_PORT}/api/health"

# ── Ensure directories exist ─────────────────────────────────────────────
mkdir -p "$LOGS_DIR" "$PIDS_DIR"

# ── Helpers ──────────────────────────────────────────────────────────────

log_info()  { echo "[start] $(date '+%Y-%m-%d %H:%M:%S') INFO  $*"; }
log_warn()  { echo "[start] $(date '+%Y-%m-%d %H:%M:%S') WARN  $*" >&2; }
log_error() { echo "[start] $(date '+%Y-%m-%d %H:%M:%S') ERROR $*" >&2; }

# Check if a TCP port is listening.
port_is_listening() {
    ss -tln 2>/dev/null | grep -qE ":${1}\s" || return 1
}

# Check if a process is alive by PID.
is_alive() {
    kill -0 "$1" 2>/dev/null
}

# Read a SID file, return empty if missing/stale.
read_sid_file() {
    local name="$1"
    local sidfile="$PIDS_DIR/${name}.sid"
    if [[ -f "$sidfile" ]]; then
        local sid
        sid="$(cat "$sidfile" 2>/dev/null | tr -d '[:space:]')"
        if [[ -n "$sid" ]]; then
            # Check if any process in the session is alive
            if ps --sid="$sid" >/dev/null 2>&1; then
                echo "$sid"
                return 0
            fi
        fi
        # Stale SID file
        log_warn "Removing stale SID file: $sidfile"
        rm -f "$sidfile"
    fi
    echo ""
    return 1
}

# Write a SID file.
write_sid_file() {
    local name="$1"
    local sid="$2"
    local sidfile="$PIDS_DIR/${name}.sid"
    echo "$sid" > "$sidfile"
}

# Find the PID of a process listening on a given port.
find_pid_on_port() {
    local port="$1"
    local raw
    raw="$(ss -tlnp sport = :"$port" 2>/dev/null || true)"
    # Extract PID from "users:(("system-dashboar",pid=485653,fd=6))"
    local pid
    pid="$(echo "$raw" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
    echo "$pid"
}

# Kill an entire process tree by SID.
kill_session() {
    local name="$1"
    local sid="$2"
    local pids
    pids="$(ps --sid="$sid" -o pid= 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
        log_info "Killing session $name (SID: $sid) — PIDs: $(echo $pids | tr '\n' ' ')"
        for pid in $pids; do
            kill "$pid" 2>/dev/null || true
        done
        # Wait for graceful shutdown
        local waited=0
        while [[ $waited -lt 5 ]]; do
            local still_alive=false
            for pid in $pids; do
                if is_alive "$pid"; then
                    still_alive=true
                    break
                fi
            done
            if [[ "$still_alive" == "false" ]]; then
                return 0
            fi
            sleep 1
            waited=$((waited + 1))
        done
        # Force kill remaining
        for pid in $pids; do
            if is_alive "$pid"; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
        sleep 1
    fi
}

# Poll a URL until it responds (max 30s, 1s interval).
wait_for_health() {
    local url="$1"
    local name="$2"
    local max_attempts=30
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        local code
        code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 2 "$url" 2>/dev/null || echo "000")"
        if [[ "$code" == "200" ]]; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    log_error "$name health check failed after ${max_attempts}s (URL: $url)"
    return 1
}

# ── Backend ──────────────────────────────────────────────────────────────

log_info "=== Backend ==="

# Check for existing running backend by SID
existing_sid="$(read_sid_file backend || true)"
if [[ -n "$existing_sid" ]]; then
    log_info "Backend already running (SID: $existing_sid) — reusing"
    if port_is_listening "$BACKEND_PORT"; then
        log_info "Backend port $BACKEND_PORT is listening"
    else
        log_warn "Backend SID $existing_sid exists but port $BACKEND_PORT is not listening"
        log_info "Attempting to stop stale backend session..."
        kill_session "backend" "$existing_sid"
        rm -f "$PIDS_DIR/backend.sid"
        existing_sid=""
    fi
fi

if [[ -z "$existing_sid" ]]; then
    # Check if port is already in use by an unknown process
    if port_is_listening "$BACKEND_PORT"; then
        existing_pid="$(find_pid_on_port "$BACKEND_PORT")"
        if [[ -n "$existing_pid" ]]; then
            log_warn "Port $BACKEND_PORT is in use by unknown process (PID: $existing_pid)"
            log_warn "Attempting to kill it..."
            kill "$existing_pid" 2>/dev/null || true
            sleep 2
            if ! port_is_listening "$BACKEND_PORT"; then
                log_info "Port $BACKEND_PORT freed"
            else
                log_error "Could not free port $BACKEND_PORT"
                exit 1
            fi
        fi
    fi

    # Ensure cargo is available
    if ! command -v cargo >/dev/null 2>&1; then
        log_info "Cargo not in PATH, sourcing ~/.cargo/env"
        source ~/.cargo/env 2>/dev/null || true
    fi

    if ! command -v cargo >/dev/null 2>&1; then
        CARGO_BIN="/home/gamer/.cargo/bin/cargo"
        if [[ -x "$CARGO_BIN" ]]; then
            log_info "Using cargo from $CARGO_BIN"
        else
            log_error "Cargo not found. Install Rust first."
            exit 1
        fi
    else
        CARGO_BIN="$(command -v cargo)"
    fi

    log_info "Starting backend ($CARGO_BIN run)..."
    # Use setsid to create a new session for process group management
    setsid nohup sh -c "cd '$BACKEND_DIR' && exec '$CARGO_BIN' run" > "$LOGS_DIR/backend.log" 2>&1 &
    backend_sid=$!
    write_sid_file "backend" "$backend_sid"
    log_info "Backend started with SID $backend_sid"

    # Wait for backend health check
    log_info "Waiting for backend to be ready..."
    if ! wait_for_health "$BACKEND_HEALTH" "Backend"; then
        log_error "Backend failed to start. Check $LOGS_DIR/backend.log"
        kill_session "backend" "$backend_sid"
        rm -f "$PIDS_DIR/backend.sid"
        exit 1
    fi

    log_info "Backend is healthy (URL: $BACKEND_HEALTH)"
else
    log_info "Backend is healthy (SID: $existing_sid)"
fi

# ── Frontend ─────────────────────────────────────────────────────────────

log_info "=== Frontend ==="

# Check for existing running frontend by SID
existing_sid="$(read_sid_file frontend || true)"
if [[ -n "$existing_sid" ]]; then
    log_info "Frontend already running (SID: $existing_sid) — reusing"
    if port_is_listening "$FRONTEND_PORT"; then
        log_info "Frontend port $FRONTEND_PORT is listening"
    else
        log_warn "Frontend SID $existing_sid exists but port $FRONTEND_PORT is not listening"
        log_info "Attempting to stop stale frontend session..."
        kill_session "frontend" "$existing_sid"
        rm -f "$PIDS_DIR/frontend.sid"
        existing_sid=""
    fi
fi

if [[ -z "$existing_sid" ]]; then
    # Check if port is already in use by an unknown process
    if port_is_listening "$FRONTEND_PORT"; then
        existing_pid="$(find_pid_on_port "$FRONTEND_PORT")"
        if [[ -n "$existing_pid" ]]; then
            log_warn "Port $FRONTEND_PORT is in use by unknown process (PID: $existing_pid)"
            log_warn "Attempting to kill it..."
            kill "$existing_pid" 2>/dev/null || true
            sleep 2
            if ! port_is_listening "$FRONTEND_PORT"; then
                log_info "Port $FRONTEND_PORT freed"
            else
                log_error "Could not free port $FRONTEND_PORT"
                exit 1
            fi
        fi
    fi

    log_info "Starting frontend (npm run dev)..."
    setsid nohup sh -c "cd '$FRONTEND_DIR' && npm run dev" > "$LOGS_DIR/frontend.log" 2>&1 &
    frontend_sid=$!
    write_sid_file "frontend" "$frontend_sid"
    log_info "Frontend started with SID $frontend_sid"

    # Wait for frontend to be ready
    log_info "Waiting for frontend to be ready..."
    if ! wait_for_health "http://localhost:${FRONTEND_PORT}" "Frontend"; then
        log_error "Frontend failed to start. Check $LOGS_DIR/frontend.log"
        kill_session "frontend" "$frontend_sid"
        rm -f "$PIDS_DIR/frontend.sid"
        exit 1
    fi

    log_info "Frontend is healthy (URL: http://localhost:$FRONTEND_PORT)"
else
    log_info "Frontend is healthy (SID: $existing_sid)"
fi

# ── Final verification ───────────────────────────────────────────────────

log_info "=== Final Verification ==="

# Check ports are listening
if port_is_listening "$BACKEND_PORT"; then
    log_info "Port $BACKEND_PORT (backend) is listening"
else
    log_error "Port $BACKEND_PORT is NOT listening — backend may have crashed"
fi

if port_is_listening "$FRONTEND_PORT"; then
    log_info "Port $FRONTEND_PORT (frontend) is listening"
else
    log_error "Port $FRONTEND_PORT is NOT listening — frontend may have crashed"
fi

# Check processes are alive via SID
backend_sid="$(cat "$PIDS_DIR/backend.sid" 2>/dev/null | tr -d '[:space:]' || true)"
frontend_sid="$(cat "$PIDS_DIR/frontend.sid" 2>/dev/null | tr -d '[:space:]' || true)"

if [[ -n "$backend_sid" ]] && ps --sid="$backend_sid" >/dev/null 2>&1; then
    log_info "Backend session $backend_sid is alive"
else
    log_warn "Backend session $backend_sid is NOT alive"
fi

if [[ -n "$frontend_sid" ]] && ps --sid="$frontend_sid" >/dev/null 2>&1; then
    log_info "Frontend session $frontend_sid is alive"
else
    log_warn "Frontend session $frontend_sid is NOT alive"
fi

# ── Summary ──────────────────────────────────────────────────────────────

echo ""
log_info "========================================"
log_info "  Dashboard started successfully"
log_info "========================================"
log_info "  Backend:  http://localhost:${BACKEND_PORT}"
log_info "  Frontend: http://localhost:${FRONTEND_PORT}"
log_info "  Backend SID:  $PIDS_DIR/backend.sid  ($backend_sid)"
log_info "  Frontend SID: $PIDS_DIR/frontend.sid ($frontend_sid)"
log_info "  Backend log:  $LOGS_DIR/backend.log"
log_info "  Frontend log: $LOGS_DIR/frontend.log"
log_info "========================================"
echo ""
