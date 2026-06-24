import { useEffect, useRef } from 'react';
import { Terminal as TermIcon, X } from 'lucide-react';
import { formatTerminalOutput } from '../utils/ansiOutput';

interface UpdateOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  output: string;
  running: boolean;
}

export default function UpdateOutputModal({ isOpen, onClose, output, running }: UpdateOutputModalProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
  }, [isOpen, output]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 8, borderRadius: 6, overflow: 'hidden', background: '#1a1a2e', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#16213e', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TermIcon size={13} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#ccc' }}>Update Output {running ? '— running…' : '— finished'}</span>
          </div>
          <button onClick={onClose} style={{ padding: '2px 6px', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#ccc' }} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>
        <div ref={outputRef} style={{ flex: 1, overflowY: 'auto', padding: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.4, color: '#ccc', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <div dangerouslySetInnerHTML={{ __html: output ? formatTerminalOutput(output) : '<span style="color:var(--text-muted)">No output yet…</span>' }} />
        </div>
      </div>
    </div>
  );
}
