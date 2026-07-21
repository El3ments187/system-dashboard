import { useCallback, useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { SettingsCard } from "../shared/CardComponents";

type BackendState = "loading" | "ok" | "degraded" | "error";

interface StatusPayload {
  gpu_backend?: string;
  nvml_available?: boolean;
}

/**
 * GPU backend health indicator for the Settings page.
 *
 * The backend reads GPU metrics via NVML when it can, and silently degrades to
 * spawning `nvidia-smi` subprocesses when NVML init fails (e.g. a broken
 * driver). That fallback is dramatically less efficient — and until now the
 * only way to know which path was active was reading backend stderr. This
 * surfaces /api/status's gpu_backend + nvml_available so the user can see at a
 * glance whether NVML is actually working.
 *
 * One-shot fetch on mount plus a manual refresh — a settings page should not
 * add another poll loop.
 */
interface BackendDescription {
  label: string;
  detail: string;
  dotColor: string;
}

function describeBackend(
  state: BackendState,
  backend: string,
): BackendDescription {
  if (state === "loading") {
    return { label: "Checking…", detail: "", dotColor: "var(--text-muted)" };
  }
  if (state === "ok") {
    return {
      label: "NVML active",
      detail:
        "GPU metrics are read directly through the NVIDIA driver library — the efficient path.",
      dotColor: "var(--success)",
    };
  }
  if (state === "degraded") {
    return {
      label: "nvidia-smi fallback",
      detail:
        "NVML is unavailable, so GPU metrics come from spawning nvidia-smi. This is slower and usually means a driver problem — check the NVIDIA driver install.",
      dotColor: "var(--warning)",
    };
  }
  if (backend === "none") {
    return {
      label: "No GPU backend",
      detail:
        "Neither NVML nor nvidia-smi is available. GPU metrics are placeholders.",
      dotColor: "var(--danger)",
    };
  }
  return {
    label: "Could not reach backend",
    detail: "The status endpoint did not respond.",
    dotColor: "var(--danger)",
  };
}

async function fetchBackendStatus(): Promise<{
  state: BackendState;
  backend: string;
}> {
  try {
    const res = await fetch("/api/status");
    const data: StatusPayload = await res.json();
    const backend = data.gpu_backend ?? "none";
    if (backend === "nvml" && data.nvml_available) {
      return { state: "ok", backend };
    }
    if (backend === "nvidia-smi") {
      return { state: "degraded", backend };
    }
    return { state: "error", backend };
  } catch {
    return { state: "error", backend: "" };
  }
}

export function GpuBackendStatus() {
  const [state, setState] = useState<BackendState>("loading");
  const [backend, setBackend] = useState<string>("");

  // House pattern (see SettingsPage): resolve the async status, set state in
  // the promise callback — never synchronously inside the effect body.
  useEffect(() => {
    fetchBackendStatus().then((r) => {
      setBackend(r.backend);
      setState(r.state);
    });
  }, []);

  const recheck = useCallback(() => {
    setState("loading");
    fetchBackendStatus().then((r) => {
      setBackend(r.backend);
      setState(r.state);
    });
  }, []);

  const { label, detail, dotColor } = describeBackend(state, backend);

  return (
    <SettingsCard>
      <div className="settings-card-header">
        <div data-accent-el="" className="settings-icon-badge">
          <Cpu size={16} style={{ color: "var(--accent-primary)" }} />
        </div>
        <div>
          <div className="settings-card-title">GPU Metrics Backend</div>
          <div className="settings-card-subtitle">
            How the dashboard reads GPU data
          </div>
        </div>
      </div>
      <div className="settings-card-body">
        <div
          data-testid="gpu-backend-status"
          data-state={state}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: dotColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600 }}>{label}</span>
          <button
            type="button"
            className="settings-btn"
            style={{ marginLeft: "auto" }}
            onClick={recheck}
          >
            Re-check
          </button>
        </div>
        {detail && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
