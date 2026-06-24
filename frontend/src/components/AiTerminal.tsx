import { useState, useEffect, useRef, useCallback } from 'react';
import { ptySpawnTerminal, ptyReadOutput, ptyWriteInput, ptyResizeTerminal, ptyKillTerminal } from '../services/api';
import { Terminal as TermIcon, Maximize2, Minimize2 } from 'lucide-react';

interface AiTerminalProps {
  accent: { color: string };
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

// Simple ANSI-to-CSS color mapping for inline rendering
function ansiToHtml(text: string): string {
  return text.replace(/\x1b\[([0-9;]*)m/g, (_, codes) => {
    if (!codes || codes === '0') return '</span>';
    const parts = codes.split(';');
    let style = '';
    for (const code of parts) {
      switch (code) {
        case '1': style += 'font-weight:bold;'; break;
        case '2': style += 'opacity:0.6;'; break;
        case '31': style += 'color:#ff5555;'; break;
        case '32': style += 'color:#50fa7b;'; break;
        case '33': style += 'color:#f1fa8c;'; break;
        case '34': style += 'color:#627fffd;'; break;
        case '35': style += 'color:#bd93f9;'; break;
        case '36': style += 'color:#4ecfcf;'; break;
        case '37': style += 'color:#f8f8f2;'; break;
        case '90': style += 'color:#626262;'; break;
        case '91': style += 'color:#ff5555;'; break;
        case '92': style += 'color:#50fa7b;'; break;
        case '93': style += 'color:#f1fa8c;'; break;
        case '94': style += 'color:#627fffd;'; break;
        case '95': style += 'color:#bd93f9;'; break;
        case '96': style += 'color:#4ecfcf;'; break;
        case '97': style += 'color:#f8f8f2;'; break;
        default: break;
      }
    }
    return `<span style="${style}">`;
  });
}

function formatTerminalOutput(raw: string): string {
  const lines = raw.split('\n');
  let html = '';
  for (const line of lines) {
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html += ansiToHtml(escaped).replace(/\n/g, '<br>') + '<br>';
  }
  return html;
}

export default function AiTerminal({ accent, collapsed, onToggleCollapsed }: AiTerminalProps) {
  const [ptsName, setPtsName] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Spawn terminal on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const dir = '/home/gamer/Projects/system-dashboard';
        const resp = await ptySpawnTerminal(dir);
        if (cancelled) return;
        setPtsName(resp.pts_name);
        setConnected(true);

        // Initial output read
        try {
          const initialOutput = await ptyReadOutput(resp.pts_name);
          setOutput(initialOutput);
        } catch { /* ignore initial read errors */ }
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message || 'Failed to spawn terminal');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Poll for output
  useEffect(() => {
    if (!ptsName || !connected) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const newOutput = await ptyReadOutput(ptsName);
        setOutput(prev => {
          if (newOutput.length > prev.length) {
            // New data available - auto-scroll
            setTimeout(() => {
              outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
            }, 0);
            return newOutput;
          }
          return prev;
        });
      } catch { /* ignore poll errors */ }
    }, 200);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [ptsName, connected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ptsName) ptyKillTerminal(ptsName).catch(() => {});
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [ptsName]);

  const sendInput = useCallback(async () => {
    if (!inputValue.trim() || !ptsName) return;
    const cmd = inputValue + '\n';
    setInputValue('');
    try {
      await ptyWriteInput(ptsName, cmd);
      setCommandHistory(prev => [...prev.slice(-50), cmd.trim()]);
      setHistoryIndex(-1);
    } catch (e: any) {
      setError(e.message || 'Failed to send input');
    }
  }, [inputValue, ptsName]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendInput();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
      } else {
        setHistoryIndex(-1);
        setInputValue('');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      ptyWriteInput(ptsName!, '\x03').catch(() => {});
    }
  }, [sendInput, commandHistory, historyIndex, ptsName]);

  const handleResize = useCallback(async () => {
    if (!ptsName) return;
    try {
      const rows = Math.floor((outputRef.current?.clientHeight || 400) / 20);
      const cols = Math.floor((outputRef.current?.clientWidth || 600) / 8.5);
      await ptyResizeTerminal(ptsName, Math.max(rows, 10), Math.max(cols, 40));
    } catch { /* ignore resize errors */ }
  }, [ptsName]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Connecting to terminal...</div>;
  }

  if (error && !ptsName) {
    return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;
  }

  const termStyle: React.CSSProperties = fullscreen ? {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' as const, background: '#1a1a2e', padding: 8
  } : {
    flex: 1, display: 'flex', flexDirection: 'column' as const, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden', minHeight: collapsed ? 0 : 350
  };

  return (
    <div style={termStyle}>
      {/* Terminal Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: collapsed ? '4px 8px' : '6px 8px', background: '#16213e', borderBottom: '1px solid var(--border-color)', cursor: onToggleCollapsed ? 'pointer' : 'default' }}
        onClick={() => onToggleCollapsed?.()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TermIcon size={collapsed ? 11 : 14} style={{ color: accent.color }} />
          <span style={{ fontSize: collapsed ? 9 : 11, fontFamily: "'JetBrains Mono', monospace", color: '#ccc' }}>
            {collapsed ? 'Terminal (collapsed)' : `bash — ${ptsName || ''}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {onToggleCollapsed && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {collapsed ? '▼' : '▲'}
            </span>
          )}
          <button onClick={e => { e.stopPropagation(); setFullscreen(!fullscreen); }} style={{ padding: '2px 6px', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#ccc' }} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Terminal Output */}
          <div
            ref={outputRef}
            style={{
              flex: 1, overflowY: 'auto', padding: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.4, color: '#ccc', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}
            onClick={() => inputRef.current?.focus()}
          >
            <div dangerouslySetInnerHTML={{ __html: output ? formatTerminalOutput(output) : '<span style="color:#627fffd">Connected. Type a command...</span>' }} />
          </div>

          {/* Terminal Input */}
          <div style={{ display: 'flex', gap: 4, padding: 8, borderTop: '1px solid var(--border-color)', background: '#16213e' }}>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!connected}
              style={{
                flex: 1, padding: '4px 8px', background: '#0a0a1a', border: '1px solid var(--border-color)', borderRadius: 4, color: '#ccc', fontSize: 12, fontFamily: "'JetBrains Mono', monospace"
              }}
              placeholder="Type a command..."
            />
          </div>

          {/* Status Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#16213e', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: 9, color: connected ? 'var(--success)' : 'var(--danger)' }}>
              {connected ? '● Connected' : '○ Disconnected'}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              Ctrl+C to interrupt · ↑↓ for history
            </span>
          </div>
        </>
      )}
    </div>
  );
}
