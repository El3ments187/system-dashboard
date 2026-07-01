import { useState, useRef, useCallback, useEffect } from "react";
import {
  ptySpawnTerminal,
  ptyWriteInput,
  ptyReadOutput,
  ptyKillTerminal,
} from "../services/api";
import { extractLatestPercent } from "../utils/ansiOutput";
import type { GitInfo, RepoInfo } from "../types/metrics";

const DEFAULT_UPDATE_SCRIPT =
  "git pull\ncmake --build build --config Release -j$(nproc)";
const DEFAULT_BUILD_NOTES_URL =
  "https://github.com/ggml-org/llama.cpp/releases";
const DEFAULT_LOCAL_VERSION_CMD =
  "git tag --sort=-version:refname | grep '^b' | head -1";
const DEFAULT_LATEST_VERSION_CMD =
  "git ls-remote --tags --sort=-version:refname origin 'refs/tags/b*' | head -1 | sed 's|.*refs/tags/||'";
const DONE_MARKER = "__LLAMA_UPDATE_DONE__";

export type UpdateState = "idle" | "running" | "done" | "error";

export interface LlamaCppManagement {
  dirPath: string;
  readmeUrl: string;
  buildNotesUrl: string;
  updateScript: string;
  ptsName: string | null;
  updateState: UpdateState;
  updateProgress: number;
  updateOutput: string;
  outputOpen: boolean;
  toast: { msg: string; type: "error" | "info" } | null;
  openTerminal: () => Promise<void>;
  runUpdate: () => Promise<void>;
  setOutputOpen: (open: boolean) => void;
  gitInfo: GitInfo | null;
  repoInfo: RepoInfo | null;
}

export function useLlamaCppManagement(): LlamaCppManagement {
  // Lazy initializers avoid the need for a useEffect to read localStorage on mount.
  const [dirPath] = useState(() => localStorage.getItem("llama_cpp_dir") ?? "");
  const [readmeUrl] = useState(
    () => localStorage.getItem("llama_cpp_readme_url") ?? "",
  );
  const [localVersionCmd] = useState(
    () => localStorage.getItem("llama_cpp_local_version_cmd") ?? DEFAULT_LOCAL_VERSION_CMD,
  );
  const [latestVersionCmd] = useState(
    () => localStorage.getItem("llama_cpp_latest_version_cmd") ?? DEFAULT_LATEST_VERSION_CMD,
  );
  const [buildNotesUrl] = useState(
    () =>
      localStorage.getItem("llama_cpp_build_notes_url") ??
      DEFAULT_BUILD_NOTES_URL,
  );
  const [updateScript] = useState(
    () =>
      localStorage.getItem("llama_cpp_update_script") ?? DEFAULT_UPDATE_SCRIPT,
  );

  const [ptsName, setPtsName] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateOutput, setUpdateOutput] = useState("");
  const [outputOpen, setOutputOpen] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "error" | "info";
  } | null>(null);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatePtsRef = useRef<string | null>(null);
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outputAccRef = useRef("");

  const showToast = useCallback((msg: string, type: "error" | "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (updatePollRef.current) clearInterval(updatePollRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!dirPath) return;
    let cancelled = false;
    fetch(`/api/llama/directory-info?path=${encodeURIComponent(dirPath)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: { git_info?: GitInfo | null } } | null) => {
        if (!cancelled && d?.data?.git_info) setGitInfo(d.data.git_info);
      })
      .catch(() => {});
    const repoParams = new URLSearchParams({ path: dirPath });
    if (localVersionCmd) repoParams.set("local_cmd", localVersionCmd);
    if (latestVersionCmd) repoParams.set("latest_cmd", latestVersionCmd);
    fetch(`/api/llama/repo-info?${repoParams.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: RepoInfo } | null) => {
        if (!cancelled && d?.data) setRepoInfo(d.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dirPath]);

  const stopPolling = useCallback(() => {
    if (updatePollRef.current) {
      clearInterval(updatePollRef.current);
      updatePollRef.current = null;
    }
  }, []);

  const openTerminal = useCallback(async () => {
    if (!dirPath) return;
    if (updatePtsRef.current) {
      setPtsName(updatePtsRef.current);
      window.open(
        `/llama-cpp/terminal?pts=${encodeURIComponent(updatePtsRef.current)}`,
        "_blank",
      );
      return;
    }
    if (ptsName) {
      window.open(
        `/llama-cpp/terminal?pts=${encodeURIComponent(ptsName)}`,
        "_blank",
      );
      return;
    }
    try {
      const resp = await ptySpawnTerminal(dirPath);
      setPtsName(resp.pts_name);
      window.open(
        `/llama-cpp/terminal?pts=${encodeURIComponent(resp.pts_name)}`,
        "_blank",
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to open terminal";
      // eslint-disable-next-line no-console
      console.error("[LlamaCpp] Terminal spawn error:", e);
      showToast(msg, "error");
    }
  }, [dirPath, ptsName, showToast]);

  // Extracted to avoid nesting functions more than 4 levels deep inside runUpdate.
  const handlePollChunk = useCallback(
    (chunk: string, pts: string) => {
      const next = outputAccRef.current + chunk;
      outputAccRef.current = next;
      const pct = extractLatestPercent(next);
      if (pct != null) setUpdateProgress(pct);
      setUpdateOutput(next);
      const donePattern = new RegExp(`(^|\\n)${DONE_MARKER}(\\r|\\n|$)`);
      if (donePattern.test(next)) {
        setUpdateProgress(100);
        setUpdateState("done");
        stopPolling();
        ptyKillTerminal(pts);
        updatePtsRef.current = null;
        setTimeout(() => setUpdateState("idle"), 2000);
      }
    },
    [stopPolling],
  );

  const runUpdate = useCallback(async () => {
    if (!dirPath || updateState === "running") return;
    stopPolling();
    if (updatePtsRef.current) {
      ptyKillTerminal(updatePtsRef.current);
      updatePtsRef.current = null;
    }
    setUpdateState("running");
    setUpdateProgress(0);
    setUpdateOutput("");
    outputAccRef.current = "";
    try {
      const resp = await ptySpawnTerminal(dirPath);
      updatePtsRef.current = resp.pts_name;
      const lines = updateScript
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const composite = `${lines.join(" && ")} ; echo "${DONE_MARKER}"\n`;
      await ptyWriteInput(resp.pts_name, composite);

      updatePollRef.current = setInterval(async () => {
        const pts = updatePtsRef.current;
        if (!pts) return;
        try {
          const chunk = await ptyReadOutput(pts);
          if (chunk) handlePollChunk(chunk, pts);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[LlamaCpp] Update poll error:", err);
          stopPolling();
          if (updatePtsRef.current) {
            ptyKillTerminal(updatePtsRef.current);
            updatePtsRef.current = null;
          }
          setUpdateState("error");
        }
      }, 400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start update";
      // eslint-disable-next-line no-console
      console.error("[LlamaCpp] Update spawn error:", err);
      showToast(msg, "error");
      if (updatePtsRef.current) {
        ptyKillTerminal(updatePtsRef.current);
        updatePtsRef.current = null;
      }
      setUpdateState("error");
    }
  }, [
    dirPath,
    updateScript,
    updateState,
    stopPolling,
    showToast,
    handlePollChunk,
  ]);

  return {
    dirPath,
    readmeUrl,
    buildNotesUrl,
    updateScript,
    ptsName,
    updateState,
    updateProgress,
    updateOutput,
    outputOpen,
    toast,
    openTerminal,
    runUpdate,
    setOutputOpen,
    gitInfo,
    repoInfo,
  };
}
