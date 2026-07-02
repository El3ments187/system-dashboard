import { useState, useEffect, useRef, useCallback } from "react";
import {
  ptyReadOutput,
  ptyWriteInput,
  ptyResizeTerminal,
  ptyKillTerminal,
} from "../services/api";
import { Terminal as TermIcon, X } from "lucide-react";
import { formatTerminalOutput } from "../utils/ansiOutput";

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCommand?: string;
  ptsName?: string | null;
}

export default function TerminalModal({
  isOpen,
  onClose,
  initialCommand,
  ptsName: externalPts,
}: TerminalModalProps) {
  const [ptsName] = useState<string | null>(externalPts ?? null);
  const [output, setOutput] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const outputTextRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setConnected(true);
        try {
          const initialOutput = await ptyReadOutput(ptsName!);
          outputTextRef.current = initialOutput;
          setOutput(initialOutput);
        } catch {
          /* ignore */
        }
        if (initialCommand && initialCommand.trim()) {
          try {
            await ptyWriteInput(ptsName!, initialCommand.trim() + "\n");
          } catch {
            /* ignore */
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message || "Failed to connect to terminal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ptsName || !connected || !isOpen) return;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const newOutput = await ptyReadOutput(ptsName);
        if (newOutput.length > outputTextRef.current.length) {
          outputTextRef.current = newOutput;
          setOutput(newOutput);
          setTimeout(() => {
            outputRef.current?.scrollTo({
              top: outputRef.current.scrollHeight,
              behavior: "smooth",
            });
          }, 0);
        }
      } catch {
        /* ignore */
      }
    }, 200);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [ptsName, connected, isOpen]);

  useEffect(() => {
    return () => {
      if (ptsName) ptyKillTerminal(ptsName);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [ptsName]);

  const sendInput = useCallback(async () => {
    if (!inputValue.trim() || !ptsName) return;
    const cmd = inputValue + "\n";
    setInputValue("");
    try {
      await ptyWriteInput(ptsName, cmd);
      setCommandHistory((prev) => [...prev.slice(-50), cmd.trim()]);
      setHistoryIndex(-1);
    } catch (e: any) {
      setError(e.message || "Failed to send input");
    }
  }, [inputValue, ptsName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendInput();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length > 0) {
          const newIndex =
            historyIndex < commandHistory.length - 1
              ? historyIndex + 1
              : historyIndex;
          setHistoryIndex(newIndex);
          setInputValue(
            commandHistory[commandHistory.length - 1 - newIndex] || "",
          );
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInputValue(
            commandHistory[commandHistory.length - 1 - newIndex] || "",
          );
        } else {
          setHistoryIndex(-1);
          setInputValue("");
        }
      } else if (e.key === "c" && e.ctrlKey) {
        e.preventDefault();
        ptyWriteInput(ptsName!, "\x03").catch(() => {});
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [sendInput, commandHistory, historyIndex, ptsName, onClose],
  );

  const handleResize = useCallback(async () => {
    if (!ptsName) return;
    try {
      const rows = Math.floor((outputRef.current?.clientHeight || 400) / 20);
      const cols = Math.floor((outputRef.current?.clientWidth || 600) / 8.5);
      await ptyResizeTerminal(ptsName, Math.max(rows, 10), Math.max(cols, 40));
    } catch {
      /* ignore */
    }
  }, [ptsName]);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  let terminalBody: React.ReactNode;
  if (loading) {
    terminalBody = (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        Connecting to terminal...
      </div>
    );
  } else if (error && !ptsName) {
    terminalBody = (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--danger)",
        }}
      >
        {error}
      </div>
    );
  } else {
    terminalBody = (
      <>
        <div
          ref={outputRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 8,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            lineHeight: 1.4,
            color: "#ccc",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
          onClick={() => inputRef.current?.focus()}
        >
          <div
            dangerouslySetInnerHTML={{
              __html: output
                ? formatTerminalOutput(output)
                : '<span style="color:var(--accent-primary)">Connected. Type a command...</span>',
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: 8,
            borderTop: "1px solid var(--border-color)",
            background: "#16213e",
          }}
        >
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!connected}
            style={{
              flex: 1,
              padding: "4px 8px",
              background: "#0a0a1a",
              border: "1px solid var(--border-color)",
              borderRadius: 4,
              color: "#ccc",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            placeholder="Type a command..."
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 8px",
            background: "#16213e",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: connected ? "var(--success)" : "var(--danger)",
            }}
          >
            {connected ? "\u25cf Connected" : "\u25cb Disconnected"}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
            Ctrl+C interrupt · ↑↓ history · Esc close
          </span>
        </div>
      </>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          margin: 8,
          borderRadius: 6,
          overflow: "hidden",
          background: "#1a1a2e",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            background: "#16213e",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <TermIcon size={13} style={{ color: "var(--accent-primary)" }} />
            <span
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#ccc",
              }}
            >
              bash — {ptsName || "connecting..."}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "2px 6px",
              background: "transparent",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              color: "#ccc",
            }}
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>
        {terminalBody}
      </div>
    </div>
  );
}
