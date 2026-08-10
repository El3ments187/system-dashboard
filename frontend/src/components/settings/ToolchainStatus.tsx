import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Wrench, XCircle } from "lucide-react";
import { SettingsCard } from "../shared/CardComponents";

interface Track {
  lang: string;
  available: boolean;
  tasks: number;
  reason: string;
}

type LoadState = "loading" | "ok" | "error";

/**
 * Which benchmark languages can actually run on this machine.
 *
 * This lives on Settings rather than the Bench page because it is the same
 * concept the connection fields above already cover — a live reachability
 * check with inline detail — just for local binaries instead of network
 * services. The Bench page keeps the part that affects a run: each language
 * toggle disables itself from this same data. What is here is the tool-level
 * diagnostic (which binary, and why it failed), which belongs with the other
 * environment checks.
 *
 * One-shot fetch plus a manual Re-check, matching GpuBackendStatus — a
 * settings page should not add another poll loop.
 */
async function fetchTracks(): Promise<{ state: LoadState; tracks: Track[] }> {
  try {
    const res = await fetch("/api/bench/check");
    if (!res.ok) return { state: "error", tracks: [] };
    const body = (await res.json()) as {
      data?: { tracks?: Track[] };
      success?: boolean;
    };
    const tracks = body.data?.tracks;
    if (!tracks) return { state: "error", tracks: [] };
    return { state: "ok", tracks };
  } catch {
    return { state: "error", tracks: [] };
  }
}

export function ToolchainStatus() {
  const [state, setState] = useState<LoadState>("loading");
  const [tracks, setTracks] = useState<Track[]>([]);

  // House pattern: resolve the async status and set state in the promise
  // callback, never synchronously in the effect body.
  useEffect(() => {
    fetchTracks().then((r) => {
      setTracks(r.tracks);
      setState(r.state);
    });
  }, []);

  const recheck = useCallback(() => {
    setState("loading");
    fetchTracks().then((r) => {
      setTracks(r.tracks);
      setState(r.state);
    });
  }, []);

  const missing = tracks.filter((t) => !t.available);

  return (
    <SettingsCard>
      <div className="settings-card-header">
        <div data-accent-el="" className="settings-icon-badge">
          <Wrench size={16} style={{ color: "var(--accent-primary)" }} />
        </div>
        <div>
          <div className="settings-card-title">Benchmark Toolchains</div>
          <div className="settings-card-subtitle">
            Which languages the Bench page can actually run
          </div>
        </div>
      </div>
      <div className="settings-card-body">
        <div
          data-testid="toolchain-status"
          data-state={state}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <span style={{ fontWeight: 600, fontSize: 12 }}>
            {state === "loading" && "Checking…"}
            {state === "error" &&
              "Could not reach bench.py — is bench_dir set above?"}
            {state === "ok" &&
              (missing.length === 0
                ? `All ${tracks.length} languages runnable`
                : `${missing.length} of ${tracks.length} unavailable`)}
          </span>
          <button
            type="button"
            className="settings-btn"
            style={{ marginLeft: "auto" }}
            onClick={recheck}
          >
            Re-check
          </button>
        </div>

        {tracks.map((t) => (
          <div
            key={t.lang}
            data-testid={`toolchain-${t.lang}`}
            className="settings-field"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            {t.available ? (
              <CheckCircle size={13} style={{ color: "var(--success)" }} />
            ) : (
              <XCircle size={13} style={{ color: "var(--danger)" }} />
            )}
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 12,
                minWidth: 70,
              }}
            >
              {t.lang}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {t.tasks} {t.tasks === 1 ? "task" : "tasks"}
              {t.available ? "" : " — skipped"}
            </span>
            {!t.available && t.reason && (
              <span
                title={t.reason}
                style={{
                  fontSize: 10,
                  color: "var(--danger)",
                  marginLeft: "auto",
                  maxWidth: 260,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.reason}
              </span>
            )}
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
