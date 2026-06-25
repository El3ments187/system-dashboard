import { useState, useEffect, useRef, useCallback } from 'react';
import { useMetricsContext } from '../../context/MetricsContext';
import UpdateOutputModal from '../UpdateOutputModal';
import MetricTile from '../shared/MetricTile';
import { CardShell, CardHeader, Section, ScrollContent } from '../shared/CardComponents';
import { ptySpawnTerminal, ptyWriteInput, ptyReadOutput, ptyKillTerminal } from '../../services/api';
import { extractLatestPercent } from '../../utils/ansiOutput';
import { BrainCircuit, Folder, Terminal as TermIcon, RefreshCw, ExternalLink, Loader2, Activity, Globe, Eye, AudioLines, Video as VideoIcon, BookOpen, FileText } from 'lucide-react';

const DEFAULT_UPDATE_SCRIPT = 'git pull\ncmake --build build --config Release -j$(nproc)';
const DEFAULT_BUILD_NOTES_URL = 'https://github.com/ggml-org/llama.cpp/releases';
const DONE_MARKER = '__LLAMA_UPDATE_DONE__';

function CapPill({ icon, label, enabled }: { icon: React.ReactNode; label: string; enabled?: boolean | null }) {
  const on = !!enabled;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
      background: on ? 'rgba(var(--success-rgb, 34,197,94),0.1)' : 'var(--bg-secondary)',
      border: `1px solid ${on ? 'rgba(var(--success-rgb, 34,197,94),0.3)' : 'var(--border-color)'}`,
      color: on ? 'var(--success)' : 'var(--text-muted)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4,
        background: on ? 'rgba(var(--success-rgb, 34,197,94),0.18)' : 'transparent',
      }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 600, textShadow: 'var(--text-shadow-sm)' }}>{label}</span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0, minWidth: 108, textShadow: 'var(--text-shadow-sm)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: 'var(--text-shadow-sm)' }}>{value}</span>
    </div>
  );
}

export default function LlamaCppCard() {
  const { aiCurrentMetrics } = useMetricsContext();
  const [dirPath, setDirPath] = useState('');
  const [ptsName, setPtsName] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [updateScript, setUpdateScript] = useState(DEFAULT_UPDATE_SCRIPT);
  const [updateState, setUpdateState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateOutput, setUpdateOutput] = useState('');
  const updatePtsRef = useRef<string | null>(null);
  const updatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const largestContextRef = useRef<number>(0);
  const [llamaVersion, setLlamaVersion] = useState('');
  const [readmeUrl, setReadmeUrl] = useState('');
  const [buildNotesUrl, setBuildNotesUrl] = useState(DEFAULT_BUILD_NOTES_URL);

  const showToast = useCallback((msg: string, type: 'error' | 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const s = localStorage.getItem('llama_cpp_dir');
    if (s) setDirPath(s);
    const script = localStorage.getItem('llama_cpp_update_script');
    if (script) setUpdateScript(script);
    const v = localStorage.getItem('llama_cpp_version');
    if (v) setLlamaVersion(v);
    const r = localStorage.getItem('llama_cpp_readme_url');
    if (r) setReadmeUrl(r);
    const b = localStorage.getItem('llama_cpp_build_notes_url');
    if (b) setBuildNotesUrl(b);
  }, []);

  useEffect(() => {
    return () => {
      // Clean up timers and pollers, but DO NOT kill terminals on unmount.
      // Terminals may have active viewer tabs — let the viewer or explicit
      // close button handle termination. Only clear local state refs.
      if (updatePollRef.current) clearInterval(updatePollRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const llamaOnline = aiCurrentMetrics?.llama_server?.available ?? false;
  const m = aiCurrentMetrics;
  const tokenUsage = aiCurrentMetrics?.token_usage;

  const fullModelPath: string = m?.model_path || m?.model_alias || '';
  const modelFile = fullModelPath.includes('/') ? fullModelPath.split('/').pop() : fullModelPath;
  const modelAlias = m?.model_alias || '';
  const buildInfo = m?.build_info || '';

  const contextTokens = m?.context_tokens ?? null;
  const maxContext = m?.max_context ?? null;
  const contextPct = contextTokens != null && maxContext != null && maxContext > 0 ? Math.round((contextTokens / maxContext) * 1000) / 10 : null;

  if (contextTokens != null && contextTokens > largestContextRef.current) {
    largestContextRef.current = contextTokens;
  }
  const largestContext = largestContextRef.current > 0 ? largestContextRef.current : null;

  const fmtNum = (v: unknown): string => {
    if (v == null || v === '') return '';
    const n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString();
  };

  const ctxColor = contextPct != null && contextPct > 90 ? 'var(--danger)' : contextPct != null && contextPct > 70 ? 'var(--warning)' : 'var(--accent-primary)';

  const openTerminal = useCallback(async () => {
    if (!dirPath) return;

    // If an update PTY is running, open a viewer for it instead of spawning a new shell
    if (updatePtsRef.current) {
      setPtsName(updatePtsRef.current);
      window.open(`/ai/terminal?pts=${encodeURIComponent(updatePtsRef.current)}`, '_blank');
      return;
    }

    // If a terminal PTY already exists, reuse it
    if (ptsName) {
      window.open(`/ai/terminal?pts=${encodeURIComponent(ptsName)}`, '_blank');
      return;
    }

    // No existing terminal — spawn one
    try {
      const resp = await ptySpawnTerminal(dirPath);
      setPtsName(resp.pts_name);
      window.open(`/ai/terminal?pts=${encodeURIComponent(resp.pts_name)}`, '_blank');
    } catch (e: any) {
      console.error('[LlamaCpp] Terminal spawn error:', e);
      showToast(e?.message || 'Failed to open terminal', 'error');
    }
  }, [dirPath, ptsName, showToast]);

  const stopPolling = useCallback(() => {
    if (updatePollRef.current) { clearInterval(updatePollRef.current); updatePollRef.current = null; }
  }, []);

  const runUpdate = useCallback(async () => {
    if (!dirPath || updateState === 'running') return;
    
    // Clean up any lingering PTY from a previous failed/cancelled update
    stopPolling();
    if (updatePtsRef.current) {
      ptyKillTerminal(updatePtsRef.current);
      updatePtsRef.current = null;
    }
    
    setUpdateState('running');
    setUpdateProgress(0);
    setUpdateOutput('');
    try {
      const resp = await ptySpawnTerminal(dirPath);
      updatePtsRef.current = resp.pts_name;
      const lines = updateScript.split('\n').map(l => l.trim()).filter(Boolean);
      const composite = `${lines.join(' && ')} ; echo "${DONE_MARKER}"\n`;
      await ptyWriteInput(resp.pts_name, composite);

      updatePollRef.current = setInterval(async () => {
        const pts = updatePtsRef.current;
        if (!pts) return;
        try {
          const chunk = await ptyReadOutput(pts);
          if (chunk) {
            setUpdateOutput(prev => {
              const next = prev + chunk;
              const pct = extractLatestPercent(next);
              if (pct != null) setUpdateProgress(pct);
              const donePattern = new RegExp(`(^|\\n)${DONE_MARKER}(\\r|\\n|$)`);
              if (donePattern.test(next)) {
                setUpdateProgress(100);
                setUpdateState('done');
                stopPolling();
                ptyKillTerminal(pts);
                updatePtsRef.current = null;
                setTimeout(() => setUpdateState('idle'), 2000);
              }
              return next;
            });
          }
        } catch (err) {
          console.error('[LlamaCpp] Update poll error:', err);
          stopPolling();
          if (updatePtsRef.current) {
            ptyKillTerminal(updatePtsRef.current);
            updatePtsRef.current = null;
          }
          setUpdateState('error');
        }
      }, 400);
    } catch (err: any) {
      console.error('[LlamaCpp] Update spawn error:', err);
      showToast(err?.message || 'Failed to start update', 'error');
      if (updatePtsRef.current) {
        ptyKillTerminal(updatePtsRef.current);
        updatePtsRef.current = null;
      }
      setUpdateState('error');
    }
  }, [dirPath, updateScript, updateState, stopPolling, showToast]);

  const mgmtBtnStyle: React.CSSProperties = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '7px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
    cursor: 'pointer', color: 'var(--text-primary)', fontSize: 11, fontWeight: 600, textShadow: 'var(--text-shadow-sm)',
  };

  const disabledBtnStyle: React.CSSProperties = { ...mgmtBtnStyle, opacity: 0.4, cursor: 'not-allowed' };

  const accentBtnStyle: React.CSSProperties = {
    ...mgmtBtnStyle, background: 'var(--accent-primary)', border: 'none', color: '#fff', fontWeight: 700, textShadow: 'var(--text-shadow-md)',
  };

  const hasDir = !!dirPath;

  return (
    <>
    {toast && (
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 99999, padding: '8px 14px', borderRadius: 6, background: toast.type === 'error' ? 'var(--danger)' : 'var(--accent-primary)', color: '#fff', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 12px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
        {toast.msg}
      </div>
    )}
    <CardShell>
      <CardHeader icon={<BrainCircuit size={16} style={{ color: 'var(--accent-primary)' }} />} title="LLAMA.CPP" online={llamaOnline} />

      <ScrollContent>

        {/* ── MODEL IDENTITY ── */}
        <Section title="">
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, wordBreak: 'break-all', textShadow: 'var(--text-shadow-md)' }}>{modelFile || '\u2014'}</div>
        </Section>

        {/* ── METADATA ── */}
        <Section title="">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <MetaRow label="Alias" value={modelAlias || '\u2014'} />
            <MetaRow label="llama.cpp Version" value={llamaVersion || '\u2014'} />
            <MetaRow label="Build" value={buildInfo || '\u2014'} />
          </div>
        </Section>

        {/* ── CAPABILITIES ── */}
        <Section title="Capabilities">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <CapPill icon={<Activity size={11} />} label="Metrics" enabled={m?.endpoint_metrics} />
            <CapPill icon={<Globe size={11} />} label="WebUI" enabled={m?.webui} />
            <CapPill icon={<Eye size={11} />} label="Vision" enabled={m?.vision} />
            <CapPill icon={<AudioLines size={11} />} label="Audio" enabled={m?.audio} />
            <CapPill icon={<VideoIcon size={11} />} label="Video" enabled={m?.video} />
          </div>
        </Section>

        {/* ── CONTEXT UTILIZATION (primary metric) ── */}
        <Section title="Context">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 6 }}>
            <MetricTile label="Current" value={fmtNum(contextTokens)} unit=" tok" color={ctxColor} />
            <MetricTile label="Max" value={fmtNum(maxContext)} unit=" tok" />
            <MetricTile label="Largest Seen" value={fmtNum(largestContext)} unit=" tok" />
          </div>
          {contextPct != null && (
            <div>
              <div style={{ height: 9, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ width: `${contextPct}%`, height: '100%', borderRadius: 4, background: ctxColor, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
                <span>0%</span><span style={{ fontWeight: 700, color: ctxColor }}>{contextPct.toFixed(1)}%</span><span>100%</span>
              </div>
            </div>
          )}
        </Section>

        {/* ── PERFORMANCE | TOKENS (side by side) ── */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1 }}>
            <Section title="Performance">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MetricTile label="Gen TPS" value={fmtNum(m?.gen_tps)} unit=" tok/s" />
                <MetricTile label="Prompt TPS" value={fmtNum(m?.prompt_tps)} unit=" tok/s" />
              </div>
            </Section>
          </div>
          <div style={{ flex: 1 }}>
            <Section title="Tokens">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MetricTile label="Prompt" value={fmtNum(tokenUsage?.prompt_tokens)} unit=" tok" />
                <MetricTile label="Generated" value={fmtNum(tokenUsage?.completion_tokens)} unit=" tok" />
              </div>
            </Section>
          </div>
        </div>

        {/* ── MODEL CONFIGURATION ── */}
        <Section title="Configuration">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <MetricTile label="Temperature" value={m?.temperature != null ? m.temperature.toFixed(2) : null} />
            <MetricTile label="Top-K" value={fmtNum(m?.top_k)} />
            <MetricTile label="Top-P" value={m?.top_p != null ? m.top_p.toFixed(2) : null} />
            <MetricTile label="Repeat Penalty" value={m?.repeat_penalty != null ? m.repeat_penalty.toFixed(2) : null} />
          </div>
        </Section>

        {/* ── WORKING DIRECTORY ── */}
        <Section title="Working Directory">
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
            padding: '4px 8px', marginBottom: 5,
          }}>
            <span style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, textShadow: 'var(--text-shadow-sm)' }}>Current Directory</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <Folder size={13} style={{ color: hasDir ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: hasDir ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: 'var(--text-shadow-sm)' }} title={dirPath}>
                {hasDir ? dirPath : 'No directory selected.'}
              </span>
            </div>
          </div>

          {/* ── ACTIONS ── */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={runUpdate} disabled={!hasDir || updateState === 'running'} style={!hasDir ? disabledBtnStyle : accentBtnStyle}>
              <RefreshCw size={13} className={updateState === 'running' ? 'spin' : undefined} />Update
            </button>
            <button onClick={() => openTerminal()} disabled={!hasDir} style={!hasDir ? disabledBtnStyle : mgmtBtnStyle}>
              <TermIcon size={13} />Terminal
            </button>
            {ptsName && (
              <a href={`/ai/terminal?pts=${encodeURIComponent(ptsName)}`} target="_blank" rel="noopener noreferrer" style={{ ...mgmtBtnStyle, textDecoration: 'none' }} title="Open in new tab">
                <ExternalLink size={13} />Tab ↗
              </a>
            )}
          </div>

          {updateState !== 'idle' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              {updateState === 'running' ? <Loader2 size={13} className="spin" style={{ color: 'var(--accent-primary)' }} /> : null}
              <span style={{ fontSize: 9.5, fontWeight: 600, color: updateState === 'error' ? 'var(--danger)' : updateState === 'done' ? 'var(--success)' : 'var(--accent-primary)', flexShrink: 0, textShadow: 'var(--text-shadow-sm)' }}>
                {updateState === 'running' ? 'Updating…' : updateState === 'done' ? 'Update complete' : 'Update failed'}
              </span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ width: `${updateProgress}%`, height: '100%', borderRadius: 4, background: updateState === 'error' ? 'var(--danger)' : 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0, width: 32, textAlign: 'right', textShadow: 'var(--text-shadow-sm)' }}>{updateProgress}%</span>
              <button onClick={() => setOutputOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', fontSize: 9.5, fontWeight: 600, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)', flexShrink: 0, textShadow: 'var(--text-shadow-sm)' }}>
                <ExternalLink size={11} />View Output
              </button>
            </div>
          )}

          {/* ── UTILITY ROW ── */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, padding: '5px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', minWidth: 0 }}>
              <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, textShadow: 'var(--text-shadow-sm)' }}>llama.cpp Version</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: 'var(--text-shadow-sm)' }}>{llamaVersion || '—'}</span>
            </div>
            <button onClick={() => readmeUrl && window.open(readmeUrl, '_blank', 'noopener,noreferrer')} disabled={!readmeUrl} style={!readmeUrl ? disabledBtnStyle : mgmtBtnStyle}>
              <BookOpen size={13} />Readme
            </button>
            <button onClick={() => buildNotesUrl && window.open(buildNotesUrl, '_blank', 'noopener,noreferrer')} disabled={!buildNotesUrl} style={!buildNotesUrl ? disabledBtnStyle : mgmtBtnStyle}>
              <FileText size={13} />Build Notes
            </button>
          </div>
        </Section>

        <div style={{ flex: 1, minHeight: 0 }} />

      </ScrollContent>
    </CardShell>

    <UpdateOutputModal isOpen={outputOpen} onClose={() => setOutputOpen(false)} output={updateOutput} running={updateState === 'running'} />
    </>
  );
}
