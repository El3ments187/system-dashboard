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
  if (!targetUrl)
    return { ready: false, url: "", reason: "No url configured", models: [] };
  try {
    return await getJson<BenchReadiness>(
      `/api/bench/ready?url=${encodeURIComponent(targetUrl)}`,
      6000,
    );
  } catch (e) {
    return {
      ready: false,
      url: targetUrl,
      reason: e instanceof Error ? e.message : "Probe failed",
      models: [],
    };
  }
}

interface LaunchProfileLike {
  name?: string;
  parsed_args?: { alias?: string; model_path?: string } | null;
}

/**
 * The name RUN MODELS displays for a profile: its alias if the launch script
 * sets one, else the model file's basename, else the profile name.
 */
function modelNamesFromProfiles(
  profiles: LaunchProfileLike[],
): string[] {
  const names = profiles.map((p) => {
    const alias = p.parsed_args?.alias?.trim();
    if (alias) return alias;
    const path = p.parsed_args?.model_path?.trim();
    if (path) return path.split("/").pop() ?? path;
    return p.name?.trim() ?? "";
  });
  return [...new Set(names.filter(Boolean))];
}

/**
 * tools/mockserver.py's DEFAULT port. Its own docstring records a real bug
 * where the port argument was silently ignored, so `mockserver.py tasks 8081`
 * bound 8123 anyway and produced an unexplained connection error — being
 * exact here is what stops that repeating.
 */
export const MOCK_URL = "http://127.0.0.1:8123";

/** How often the process-state probe runs. Cheap: no file parsing. */
export const CURRENT_POLL_MS = 3000;
/** How often the target server is re-probed, so a model started elsewhere
 *  flips the Start gate without a reload. */
export const READY_POLL_MS = 5000;
/**
 * How often the runs LIST is re-read.
 *
 * Slower than RUN_POLL_MS on purpose: the backend opens and parses every
 * runs/*_/results.json to build this list, so the cost grows with history,
 * while the thing it is watching for — a spawned run's file appearing — is
 * minutes away (bench.py writes results.json when the first sample
 * completes, not at spawn). Five seconds is far inside that window.
 */
export const RUNS_LIST_POLL_MS = 5000;

export interface BenchData {
  /** The configured llama-server, used as the default and as the
   *  "is this a real target" comparison. Runs target this URL. */
  defaultUrl: string;
  /** Configured localbench checkout, for the runs-path chip. */
  benchDir: string | null;
  readiness: BenchReadiness;
  /** Readiness of the mockserver address, so Dry run uses the same gate. */
  mockReadiness: BenchReadiness;
  /** Model names RUN MODELS currently knows about. */
  knownModels: string[];
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
  const [defaultUrl, setDefaultUrl] = useState("");
  const [benchDir, setBenchDir] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<BenchReadiness>({
    ready: false,
    url: "",
    reason: "Checking…",
    models: [],
  });
  const [mockReadiness, setMockReadiness] = useState<BenchReadiness>({
    ready: false,
    url: MOCK_URL,
    reason: "Checking…",
    models: [],
  });
  const [knownModels, setKnownModels] = useState<string[]>([]);
  const [check, setCheck] = useState<BenchCheck | null>(null);
  const [taskList, setTaskList] = useState<BenchTaskList | null>(null);
  const [runs, setRuns] = useState<BenchRunRow[]>([]);
  const [detail, setDetail] = useState<BenchRunDetail | null>(null);
  const [storedDetails, setStoredDetails] = useState<BenchRunDetail[]>([]);
  // The stored-detail loader's own cache. Written only by that effect, which
  // is also the only writer of `storedDetails`, so it never needs to be
  // touched during render.
  const storedDetailsRef = useRef<BenchRunDetail[]>([]);
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
  // "is this a real server". Re-fetched on every nonce bump so Re-check
  // picks up a URL change made in Settings without a full reload.
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
      } catch {
        // No settings: readiness will report accordingly.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Re-probe the target so starting a model elsewhere flips the gate without
  // a reload — the same self-syncing principle as the update button.
  useEffect(() => {
    if (!defaultUrl) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const next = await probeReadiness(defaultUrl);
      if (cancelled) return;
      setReadiness(next);
      timer = setTimeout(() => void tick(), READY_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [defaultUrl, nonce]);

  // The same data RUN MODELS shows on the llama.cpp page — reused, not a
  // second endpoint. `--list` returns TASKS, so it cannot serve this.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/launch/profiles");
        if (!res.ok) return;
        const body = (await res.json()) as {
          data?: { profiles?: LaunchProfileLike[] };
        };
        if (cancelled) return;
        setKnownModels(modelNamesFromProfiles(body.data?.profiles ?? []));
      } catch {
        // No profiles: the field stays free-text, which is the fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Dry run targets the mockserver, and must face the same readiness gate a
  // normal start does — bypassing it would make Dry run a special case.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const next = await probeReadiness(MOCK_URL);
      if (cancelled) return;
      setMockReadiness(next);
      timer = setTimeout(() => void tick(), READY_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce]);

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
  //
  // POLLED, not fetched once. Fetching once per mount meant a run started
  // after mount never entered this list — and the auto-select below reads
  // `runsRef.current` to find the spawned run, so it searched a list that
  // could never grow. The whole live view stayed empty for an entire
  // 33-minute run until someone pressed Refresh.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const list = await getJson<BenchRunRow[]>("/api/bench/runs");
        if (cancelled) return;
        setRuns(list);
        // Updated on EVERY poll: this ref is what auto-select searches.
        runsRef.current = list;
        // Still `??`: a run the user explicitly selected must not be
        // clobbered by a later poll. A newly spawned run is picked up by the
        // auto-select effect instead, which is what makes Start work without
        // stealing an existing selection.
        setSelectedRunId((prev) => prev ?? list[0]?.run_id ?? null);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "bench runs failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(() => void tick(), RUNS_LIST_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce]);

  // Full detail for stored runs: History medians, Leads and Compare all need
  // records, which the cheap list deliberately omits.
  //
  // A FINISHED run's results.json does not change, so its detail is fetched
  // once and reused. The runs poll returns a fresh array every 5s, which used
  // to refetch every stored run's detail on every poll — with 32 runs that is
  // ~8 requests/second, forever, and it got worse with each run ever
  // recorded. That load is what made the page slow enough to time e2e out.
  useEffect(() => {
    let cancelled = false;
    if (runs.length === 0) return;
    void (async () => {
      const cached = new Map(
        storedDetailsRef.current.map((d) => [d.run_id, d]),
      );
      for (const row of runs) {
        const hit = row.finished ? cached.get(row.run_id) : undefined;
        if (hit) continue;
        try {
          const d = await getJson<BenchRunDetail>(
            `/api/bench/runs/${encodeURIComponent(row.run_id)}`,
          );
          if (cancelled) return;
          cached.set(row.run_id, d);
          // T132: write immediately so a mid-pass cancellation (from the 5 s
          // runs-list poll producing a new array) doesn't discard already-
          // fetched data — the next pass finds it in the cached map and skips.
          const snap = runs.flatMap((r) => {
            const x = cached.get(r.run_id);
            return x ? [x] : [];
          });
          const prev = storedDetailsRef.current;
          if (
            !(
              prev.length === snap.length && prev.every((x, i) => x === snap[i])
            )
          ) {
            storedDetailsRef.current = snap;
            setStoredDetails(snap);
          }
        } catch {
          if (cancelled) return;
        }
      }
      if (cancelled) return;
      // Final flush: keeps the list in sync when all runs were cache-hits
      // (no per-run write happened above) and trims runs removed from the list.
      const snap = runs.flatMap((r) => {
        const x = cached.get(r.run_id);
        return x ? [x] : [];
      });
      const prev = storedDetailsRef.current;
      if (
        !(prev.length === snap.length && prev.every((d, i) => d === snap[i]))
      ) {
        storedDetailsRef.current = snap;
        setStoredDetails(snap);
      }
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

    // Assumed live until a payload says otherwise, so the very first fetch
    // failing still retries rather than freezing the page before it starts.
    let lastKnownLive = true;

    const tick = async () => {
      try {
        const d = await getJson<BenchRunDetail>(
          `/api/bench/runs/${encodeURIComponent(selectedRunId)}`,
        );
        if (cancelled) return;
        setDetail(d);
        lastKnownLive = Object.keys(d.live ?? {}).length > 0;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "bench run fetch failed");
        // Deliberately fall through to the reschedule below. Returning here
        // is what froze the page mid-run: results.json grows as a run
        // proceeds, one slow read trips getJson's 8s abort, and the old
        // catch ended the recursion — so SAMPLES/ON TASK stayed pinned at
        // whatever the last good fetch saw while the run carried on. A
        // transient read failure must not permanently stop the poll.
      }
      // `live == {}` means FINISHED — stop, so a stored run left open in a
      // tab is not re-read every 2s forever.
      if (!cancelled && lastKnownLive) {
        timerRef.current = setTimeout(() => void tick(), RUN_POLL_MS);
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
    defaultUrl,
    benchDir,
    readiness,
    mockReadiness,
    knownModels,
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
