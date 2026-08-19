import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { ptyKillTerminal } from "../services/api";

const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

function getWsUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const ptsName = params.get("pts");
  if (!ptsName) {
    window.location.href = "/llama-cpp?error=no_pts";
    return "";
  }
  return `${WS_BASE}/api/llama/terminal/ws/${encodeURIComponent(ptsName)}`;
}

export default function LlamaCppTerminalViewer() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const ptsName = new URLSearchParams(window.location.search).get("pts");

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const closeTerminal = useCallback(() => {
    if (ptsName) {
      ptyKillTerminal(ptsName);
    }
    cleanup();
    window.close();
  }, [ptsName, cleanup]);

  const connect = useCallback(() => {
    cleanup();
    setError(null);
    setConnecting(true);

    const url = getWsUrl();
    if (!url) return;

    let ws: WebSocket | null = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
    };

    ws.onmessage = (event) => {
      const term = xtermRef.current;
      if (term && typeof event.data === "string") {
        term.write(event.data);
      }
    };

    ws.onerror = () => {
      setError("WebSocket error");
      setConnecting(false);
    };

    let closeCount = 0;
    ws.onclose = (event) => {
      setConnected(false);
      setConnecting(false);

      // If connection closed immediately with code 1001 (abort) or 1006, it's likely no active session
      if (event.code === 1001 || event.code === 1006 || closeCount >= 3) {
        setError(
          "Terminal session not found. Go back and open a terminal first.",
        );
        cleanup();
        return;
      }

      closeCount++;
      // Auto-reconnect after 2 seconds
      reconnectTimerRef.current = setTimeout(() => {
        connectRef.current();
      }, 2000);
    };
  }, [cleanup]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      theme: {
        background: "#0a0a0a",
        foreground: "#d4d4d4",
        cursor: "#ffffff",
        selectionBackground: "#264f78",
        black: "#1e1e1e",
        red: "#f44747",
        green: "#49D0F5",
        yellow: "#CAAF51",
        blue: "#3A8CFD",
        magenta: "#DE73BF",
        cyan: "#69DFDF",
        white: "#d4d4d4",
        brightBlack: "#666666",
        brightRed: "#f44747",
        brightGreen: "#49D0F5",
        brightYellow: "#CAAF51",
        brightBlue: "#3A8CFD",
        brightMagenta: "#DE73BF",
        brightCyan: "#69DFDF",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current!);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send input to WebSocket
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
      const params = new URLSearchParams(window.location.search);
      const ptsName = params.get("pts");
      if (ptsName && wsRef.current?.readyState === WebSocket.OPEN) {
        const resizeMsg = JSON.stringify({ type: "resize", rows, cols });
        wsRef.current.send(resizeMsg);
      }
    });

    return () => {
      cleanup();
      term.dispose();
    };
  }, [cleanup]);

  // Reconnect when component mounts
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();
  }, [connect]);

  // Handle window resize for fit addon
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[TerminalViewer] fitAddon.fit() failed on resize:", e);
        }
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle back button
  useEffect(() => {
    const handlePopState = () => {
      cleanup();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [cleanup]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 36,
          background: "#1a1a1a",
          borderBottom: "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => {
            cleanup();
            window.history.back();
          }}
          className="terminal-nav-btn"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={closeTerminal}
          title="Close terminal and tab"
          className="terminal-nav-btn terminal-close-btn"
          style={{ fontSize: 11 }}
        >
          <X size={14} /> Close
        </button>
        {connecting && !connected && (
          <Loader2 size={14} className="spin" style={{ color: "#666" }} />
        )}
        {connected && (
          <span style={{ fontSize: 11, color: "#49D0F5", fontWeight: 600 }}>
            Connected
          </span>
        )}
        {!connected && !connecting && error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#f44747" }}>{error}</span>
            <button
              onClick={() => {
                cleanup();
                window.location.href = "/llama-cpp";
              }}
              className="btn-glow"
              style={{
                background: "#2a2a2a",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 4,
                fontWeight: 500,
              }}
            >
              Go Back
            </button>
          </div>
        )}
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        style={{ flex: 1, overflow: "hidden", padding: 0 }}
      />
    </div>
  );
}
