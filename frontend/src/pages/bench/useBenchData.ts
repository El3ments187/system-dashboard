/**
 * Data access for the Bench page.
 *
 * The backend passes localbench's own JSON through, so everything here is a
 * fetch plus the one rule that matters for liveness: `live == {}` means the
 * run FINISHED. Nothing infers "running" from a file existing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BenchCheck,
  BenchCurrent,
  BenchReadiness,
  BenchRunDetail,
  BenchRunRow,
  BenchTaskList,
} from "./types";

/** While a run is live the file is rewritten after every sample. */
export const RUN_POLL_MS = 2000;

interface Envelope<T> {
  data?: T;
  error?: string;
  success?: boolean;
}

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const body = (await res.json()) as Envelope<T>;
    if (body.success === false)
      throw new Error(body.error ?? "bench request failed");
    if (body.data === undefined) throw new Error("bench response had no data");
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

/** One probe of the target server, shaped so the poll stays trivial. */
async function probeReadiness(targetUrl: string): Promise<BenchReadiness> {
  if (!targetUrl) return { ready: false, url: "", reason: "no url configured" };
  try {
    return await getJson<BenchReadiness>(
      `/api/bench/ready?url=${encodeURIComponent(targetUrl)}`,
      6000,
    );
  } catch (e) {
    return {
      ready: false,
      url: targetUrl,
      reason: e instanceof Error ? e.message : "probe failed",
    };
  }
}

export function isRunning(detail: BenchRunDetail | null): boolean {
  if (!detail) return false;
  return Object.keys(detail.live ?? {}).length > 0;
}

/** How often the process-state probe runs. Cheap: no file parsing. */
export const CURRENT_POLL_MS = 3000;
/** How often the target server is re-probed, so a model started elsewhere
 *  flips the Start gate without a reload. */
export const READY_POLL_MS = 5000;

export interface BenchData {
  /**
   * The server a run will target. ONE field with three consumers — the
   * readiness gate, the mock-target badge, and the flags passed to
   * bench.py — so they cannot drift apart.
   */
  targetUrl: string;
  setTargetUrl: (url: string) => void;
  /** The configured llama-server, used as the default and as the
   *  "is this a real target" comparison. */
  defaultUrl: string;
  /** Configured localbench checkout, for the runs-path chip. */
  benchDir: string | null;
  readiness: BenchReadiness;
  /**
   * Process state from the backend. True the instant bench.py is spawned,
   * where results.json does not exist yet.
   */
  current: BenchCurrent;
  check: BenchCheck | null;
  taskList: BenchTaskList | null;
  runs: BenchRunRow[];
  detail: BenchRunDetail | null;
  /** Full detail for stored runs, for history medians / leads / compare. */
  storedDetails: BenchRunDetail[];
  selectedRunId: string | null;
  selectRun: (runId: string) => void;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBenchData(): BenchData {
  const [current, setCurrent] = useState<BenchCurrent>({
    running: false,
    run: null,
  });
  // Session-only on purpose: a mock/test url must never survive a reload as
  // a saved default. A fresh load shows the real server unless the user has
  // changed it in THIS session.
  const [targetUrl, setTargetUrl] = useState("");
  const [defaultUrl, setDefaultUrl] = useState("");
  const [benchDir, setBenchDir] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<BenchReadiness>({
    ready: false,
    url: "",
    reason: "checking…",
  });
  const [check, setCheck] = useState<BenchCheck | null>(null);
  const [taskList, setTaskList] = useState<BenchTaskList | null>(null);
  const [runs, setRuns] = useState<BenchRunRow[]>([]);
  const [detail, setDetail] = useState<BenchRunDetail | null>(null);
  const [storedDetails, setStoredDetails] = useState<BenchRunDetail[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Read by the current-run poll without making it a dependency.
  const runsRef = useRef<BenchRunRow[]>([]);
  const autoSelectedRef = useRef<string | null>(null);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const selectRun = useCallback((runId: string) => setSelectedRunId(runId), []);

  // The configured llama-server is the default target and the yardstick for
  // "is this a real server". Fetched once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ai/settings");
        if (!res.ok) return;
        const body = (await res.json()) as {
          llama_server_url?: string;
          bench_dir?: string | null;
        };
        if (cancelled) return;
        setBenchDir(body.bench_dir?.trim() ? body.bench_dir : null);
        const url = body.llama_server_url ?? "";
        if (!url) return;
        setDefaultUrl(url);
        setTargetUrl((cur) => cur || url);
      } catch {
        // No settings: the field stays editable and readiness will say so.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-probe the target so starting a model elsewhere flips the gate without
  // a reload — the same self-syncing principle as the update button.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const next = await probeReadiness(targetUrl);
      if (cancelled) return;
      setReadiness(next);
      timer = setTimeout(() => void tick(), READY_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [targetUrl, nonce]);

  // Process state, polled independently of results.json. This is what makes
  // the hero populate the moment a run starts: bench.py writes `live` only
  // when it SAVES the file, and the first save is a whole sample away.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const c = await getJson<BenchCurrent>("/api/bench/current", 4000);
        if (cancelled) return;
        setCurrent(c);
        // Once the spawned run's results.json shows up in the list, follow
        // it so the tables describe the run the hero already shows. Done
        // once per spawned folder, so a later manual selection is not
        // fought. This lives after the await deliberately: setting state
        // synchronously in an effect body cascades renders.
        const folder = c.running ? c.run?.folder : null;
        if (folder && autoSelectedRef.current !== folder) {
          const row = runsRef.current.find((r) => r.folder === folder);
          if (row) {
            autoSelectedRef.current = folder;
            setSelectedRunId(row.run_id);
          }
        }
      } catch {
        // A missing probe must not blank the page; the file path still works.
      }
      if (!cancelled) timer = setTimeout(() => void tick(), CURRENT_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce]);

  // Toolchains and the task list change only when the checkout does.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [c, t] = await Promise.all([
          getJson<BenchCheck>("/api/bench/check", 30000),
          getJson<BenchTaskList>("/api/bench/tasks", 30000),
        ]);
        if (cancelled) return;
        setCheck(c);
        setTaskList(t);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "bench check failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // The run list is cheap (summaries only) and drives History.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getJson<BenchRunRow[]>("/api/bench/runs");
        if (cancelled) return;
        setRuns(list);
        runsRef.current = list;
        setSelectedRunId((current) => current ?? list[0]?.run_id ?? null);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "bench runs failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Full detail for stored runs: History medians, Leads and Compare all need
  // records, which the cheap list deliberately omits.
  useEffect(() => {
    let cancelled = false;
    if (runs.length === 0) return;
    void (async () => {
      const loaded: BenchRunDetail[] = [];
      for (const row of runs) {
        try {
          const d = await getJson<BenchRunDetail>(
            `/api/bench/runs/${encodeURIComponent(row.run_id)}`,
          );
          loaded.push(d);
        } catch {
          // A single unreadable run must not blank the whole view.
        }
        if (cancelled) return;
      }
      if (!cancelled) setStoredDetails(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [runs]);

  // Selected-run detail. Polls only while the run is live; a finished
  // payload stops the timer rather than polling a file that will not change.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!selectedRunId) return;

    const tick = async () => {
      try {
        const d = await getJson<BenchRunDetail>(
          `/api/bench/runs/${encodeURIComponent(selectedRunId)}`,
        );
        if (cancelled) return;
        setDetail(d);
        // `live == {}` means FINISHED — stop here, do not reschedule.
        if (Object.keys(d.live ?? {}).length > 0) {
          timerRef.current = setTimeout(() => void tick(), RUN_POLL_MS);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "bench run fetch failed");
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [selectedRunId, nonce]);

  return {
    targetUrl,
    setTargetUrl,
    defaultUrl,
    benchDir,
    readiness,
    current,
    check,
    taskList,
    runs,
    detail,
    storedDetails,
    selectedRunId,
    selectRun,
    loading,
    error,
    refresh,
  };
}
