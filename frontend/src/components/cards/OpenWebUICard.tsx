import { useState, useEffect } from 'react';
import { useMetricsContext } from '../../context/MetricsContext';
import { testConnection, getAiSettings } from '../../services/api';
import { MessageSquare, ExternalLink } from 'lucide-react';
import MetricTile from '../shared/MetricTile';
import TerminalModal from '../TerminalModal';
import { CardShell, CardHeader, Section, ScrollContent } from '../shared/CardComponents';
import { TestConnectionResult } from '../../types/metrics';

export default function OpenWebUICard() {
  const { aiCurrentMetrics } = useMetricsContext();
  const [url, setUrl] = useState('http://localhost:3000');
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [command, setCommand] = useState('');
  const [runCommand, setRunCommand] = useState<string | null>(null);

  useEffect(() => {
    getAiSettings().then(s => setUrl(s.openwebui_url)).catch(() => {});
  }, []);

  const service = aiCurrentMetrics?.openwebui;
  const proc = aiCurrentMetrics?.openwebui_process;
  const online = service?.available ?? false;
  const models = aiCurrentMetrics?.models;
  const chatCount = aiCurrentMetrics?.chat_history_count;

  useEffect(() => {
    if (online) setTestResult(null);
  }, [online]);

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await testConnection(url);
      setTestResult(result);
    } catch {
      setTestResult({ url, available: false, error_message: 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const uptimeHuman = proc ? (() => {
    const totalSec = Math.floor(proc.uptime_seconds);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  })() : null;

  return (
    <>
    <CardShell>
      <CardHeader icon={<MessageSquare size={14} style={{ color: 'var(--accent-primary)' }} />} title="OPENWEBUI" online={online} />

      <ScrollContent>
        <Section title="Status">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            <MetricTile label="Status" value={online ? 'Active' : 'Inactive'} color={online ? 'var(--success)' : 'var(--danger)'} />
            <MetricTile label="Models" value={(models?.length ?? 0).toString()} />
            <MetricTile label="Chats" value={chatCount != null ? chatCount.toString() : null} />
          </div>
        </Section>

        <Section title="Process">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            <MetricTile label="CPU" value={proc ? `${proc.cpu_percent.toFixed(1)}%` : null} />
            <MetricTile label="RAM" value={proc ? `${Math.round(proc.memory_kb / 1024).toLocaleString()} MB` : null} />
            <MetricTile label="Uptime" value={uptimeHuman} />
          </div>
        </Section>

        <Section title="Endpoint">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ flex: 1, fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 8px', fontSize: 10, fontWeight: 700, background: 'var(--accent-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', textDecoration: 'none' }}>
              <ExternalLink size={11} />Open WebUI
            </a>
            <button onClick={runTest} disabled={testing} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 8px', fontSize: 10, fontWeight: 700, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)', opacity: testing ? 0.6 : 1 }}>
              {testing ? 'Testing...' : 'Test Endpoint'}
            </button>
          </div>
          {testResult && (
            <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: testResult.available ? 'var(--success)' : 'var(--danger)' }}>
              {testResult.available ? `Connected: ${testResult.url}` : (testResult.error_message || 'Failed')}
            </div>
          )}
        </Section>

        <Section title="Command">
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={command} onChange={e => setCommand(e.target.value)} onKeyDown={e => e.key === 'Enter' && command.trim() && setRunCommand(command)} placeholder="Enter command..." style={{ flex: 1, padding: '6px 8px', fontSize: 10, fontFamily: 'monospace', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
            <button onClick={() => command.trim() && setRunCommand(command)} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, background: 'var(--accent-primary)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: '#fff' }}>Run</button>
          </div>
        </Section>
      </ScrollContent>
    </CardShell>

    <TerminalModal isOpen={runCommand != null} onClose={() => setRunCommand(null)} initialCommand={runCommand ?? undefined} />
    </>
  );
}
