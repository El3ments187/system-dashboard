#!/usr/bin/env bash
# stop-dashboard.sh — Stop the System Dashboard application stack.
#
# Shutdown order:
#   1. Frontend (stop first)
#   2. Backend (stop second)
#
# Usage:
#   ./scripts/stop-dashboard.sh

set -euo pipefail

# ── Resolve project root ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PIDS_DIR="$PROJECT_ROOT/pids"
LOGS_DIR="$PROJECT_ROOT/logs"

BACKEND_PORT=3001
FRONTEND_PORT=5173

# ── Helpers ──────────────────────────────────────────────────────────

log_info()  { echo "[stop] $(date '+%Y-%m-%d %H:%M:%S') INFO  $*"; }
log_warn()  { echo "[stop] $(date '+%Y-%m-%d %H:%M:%S') WARN  $*" >&2; }
log_error() { echo "[stop] $(date '+%Y-%m-%d %H:%M:%S') ERROR $*" >&2; }

# Check if a TCP port is listening.
port_is_listening() {
    ss -tln 2>/dev/null | grep -qE ":${1}\s" || return 1
}

# Check if a process is alive by PID.
is_alive() {
    kill -0 "$1" 2>/dev/null
}

# Kill an entire process session (SID) gracefully, then force kill.
kill_session() {
    local name="$1"
    local sid="$2"

    # Get all PIDs in the session (trim whitespace)
    local pids
    pids="$(ps --sid="$sid" -o pid= 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' || true)"
    if [[ -z "$pids" ]]; then
        log_info "$name (SID: $sid) has no processes — nothing to stop"
        return 0
    fi

    local pid_list
    pid_list="$(echo "$pids" | tr '\n' ' ')"
    log_info "Stopping $name (SID: $sid) — PIDs: $pid_list"

    # Graceful shutdown — send SIGTERM to all PIDs
    for pid in $pids; do
        kill "$pid" 2>/dev/null || true
    done

    # Wait up to 10s for graceful shutdown
    local waited=0
    while [[ $waited -lt 10 ]]; do
        local still_alive=false
        for pid in $pids; do
            if is_alive "$pid"; then
                still_alive=true
                break
            fi
        done
        if [[ "$still_alive" == "false" ]]; then
            log_info "$name (SID: $sid) stopped gracefully"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # Force kill remaining — use SIGKILL
    log_warn "$name did not stop gracefully, sending SIGKILL"
    for pid in $pids; do
        if is_alive "$pid"; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    sleep 2

    # Verify
    for pid in $pids; do
        if is_alive "$pid"; then
            log_error "Failed to stop $name PID $pid"
            return 1
        fi
    done

    log_info "$name (SID: $sid) killed"
    return 0
}

# Find the PID of a process listening on a given port.
find_pid_on_port() {
    local port="$1"
    local raw
    raw="$(ss -tlnp sport = :"$port" 2>/dev/null || true)"
    local pid
    pid="$(echo "$raw" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
    echo "$pid"
}

# Verify a PID belongs to the expected service.
verify_pid() {
    local name="$1"
    local pid="$2"
    local cmdline
    cmdline="$(tr '\0' ' ' < /proc/"$pid"/cmdline 2>/dev/null || echo "")"

    case "$name" in
        "Frontend")
            if [[ "$cmdline" != *"vite"* && "$cmdline" != *"npm"* && "$cmdline" != *"node"* ]]; then
                log_warn "PID $pid does not appear to be the frontend process"
                log_warn "  cmdline: $cmdline"
                return 1
            fi
            ;;
        "Backend")
            if [[ "$cmdline" != *"cargo"* && "$cmdline" != *"system-dashboard"* && "$cmdline" != *"rust"* ]]; then
                log_warn "PID $pid does not appear to be the backend process"
                log_warn "  cmdline: $cmdline"
                return 1
            fi
            ;;
    esac
    return 0
}

# ── Track state ──────────────────────────────────────────────────────

any_failure=false

# ── Frontend (stop first) ────────────────────────────────────────────

log_info "=== Frontend ==="

frontend_sidfile="$PIDS_DIR/frontend.sid"
stopped_frontend=false

if [[ -f "$frontend_sidfile" ]]; then
    frontend_sid="$(cat "$frontend_sidfile" | tr -d '[:space:]')"
    if [[ -n "$frontend_sid" ]]; then
        kill_session "Frontend" "$frontend_sid" || any_failure=true
        stopped_frontend=true
        rm -f "$frontend_sidfile"
    else
        log_warn "Empty SID file: $frontend_sidfile"
        rm -f "$frontend_sidfile"
    fi
fi

if [[ "$stopped_frontend" != "true" ]]; then
    if ! port_is_listening "$FRONTEND_PORT"; then
        log_info "Frontend: port $FRONTEND_PORT not listening — not running"
    else
        log_warn "No SID file found but port $FRONTEND_PORT is listening"
        log_info "Attempting to find and stop frontend process..."
        local_pid="$(find_pid_on_port "$FRONTEND_PORT")"
        if [[ -n "$local_pid" ]]; then
            if verify_pid "Frontend" "$local_pid"; then
                log_info "Found frontend process on port $FRONTEND_PORT (PID: $local_pid)"
                # Kill the entire session of this PID
                local_sid="$(ps -o sid= -p "$local_pid" 2>/dev/null | tr -d '[:space:]' || true)"
                if [[ -n "$local_sid" && "$local_sid" != "0" ]]; then
                    kill_session "Frontend" "$local_sid" || any_failure=true
                else
                    kill "$local_pid" 2>/dev/null || true
                    sleep 2
                    if ! is_alive "$local_pid"; then
                        log_info "Frontend (PID: $local_pid) stopped"
                    else
                        kill -9 "$local_pid" 2>/dev/null || true
                        log_warn "Frontend (PID: $local_pid) force killed"
                    fi
                fi
            else
                log_warn "Skipping — PID $local_pid does not match expected frontend process"
            fi
        else
            log_warn "Could not identify process on port $FRONTEND_PORT"
        fi
    fi
fi

# ── Backend (stop second) ────────────────────────────────────────────

log_info "=== Backend ==="

backend_sidfile="$PIDS_DIR/backend.sid"
stopped_backend=false

if [[ -f "$backend_sidfile" ]]; then
    backend_sid="$(cat "$backend_sidfile" | tr -d '[:space:]')"
    if [[ -n "$backend_sid" ]]; then
        kill_session "Backend" "$backend_sid" || any_failure=true
        stopped_backend=true
        rm -f "$backend_sidfile"
    else
        log_warn "Empty SID file: $backend_sidfile"
        rm -f "$backend_sidfile"
    fi
fi

if [[ "$stopped_backend" != "true" ]]; then
    if ! port_is_listening "$BACKEND_PORT"; then
        log_info "Backend: port $BACKEND_PORT not listening — not running"
    else
        log_warn "No SID file found but port $BACKEND_PORT is listening"
        log_info "Attempting to find and stop backend process..."
        local_pid="$(find_pid_on_port "$BACKEND_PORT")"
        if [[ -n "$local_pid" ]]; then
            if verify_pid "Backend" "$local_pid"; then
                log_info "Found backend process on port $BACKEND_PORT (PID: $local_pid)"
                local_sid="$(ps -o sid= -p "$local_pid" 2>/dev/null | tr -d '[:space:]' || true)"
                if [[ -n "$local_sid" && "$local_sid" != "0" ]]; then
                    kill_session "Backend" "$local_sid" || any_failure=true
                else
                    kill "$local_pid" 2>/dev/null || true
                    sleep 2
                    if ! is_alive "$local_pid"; then
                        log_info "Backend (PID: $local_pid) stopped"
                    else
                        kill -9 "$local_pid" 2>/dev/null || true
                        log_warn "Backend (PID: $local_pid) force killed"
                    fi
                fi
            else
                log_warn "Skipping — PID $local_pid does not match expected backend process"
            fi
        else
            log_warn "Could not identify process on port $BACKEND_PORT"
        fi
    fi
fi

# ── Verify ports are released ────────────────────────────────────────

echo ""
log_info "=== Verification ==="

# Give ports a moment to release after process termination
sleep 5

for port in "$FRONTEND_PORT" "$BACKEND_PORT"; do
    local_name=""
    [[ "$port" == "$FRONTEND_PORT" ]] && local_name="Frontend" || local_name="Backend"
    if port_is_listening "$port"; then
        log_error "Port $port is STILL listening"
        any_failure=true
    else
        log_info "Port $port ($local_name) is released"
    fi
done

# ── Summary ──────────────────────────────────────────────────────────

echo ""
log_info "========================================"
if [[ "$any_failure" == "true" ]]; then
    log_error "  Some services may not have stopped correctly"
    log_info "  Check logs: $LOGS_DIR/"
else
    log_info "  Dashboard stopped successfully"
fi
log_info "========================================"
echo ""

if [[ "$any_failure" == "true" ]]; then
    exit 1
fi
