import { useState, useEffect } from 'react';
import { getAiSettings, updateAiSettings, testConnection, getRepoInfo } from '../services/api';
import { AiSettings, TestConnectionResult, RepoInfo } from '../types/metrics';
import { Settings as SettingsIcon, Save, RefreshCw, CheckCircle, XCircle, Loader2, FolderOpen, BookOpen, Folder, GitBranch, Link2, Tag, FileText, ExternalLink } from 'lucide-react';
import DirectoryBrowserModal from '../components/DirectoryBrowserModal';
import EditUpdateScriptModal from '../components/EditUpdateScriptModal';

const DEFAULT_UPDATE_SCRIPT = 'git pull\ncmake --build build --config Release -j$(nproc)';
const DEFAULT_BUILD_NOTES_URL = 'https://github.com/ggml-org/llama.cpp/releases';
const DEFAULT_GITHUB_REPO = 'ggml-org/llama.cpp';
const DEFAULT_TAG_PREFIX = 'b';

interface SettingsPageProps {
  accent: { color: string; glow: string };
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export default function SettingsPage({ accent }: SettingsPageProps) {
  const [settings, setSettings] = useState<AiSettings>({
    llama_server_url: '',
    openwebui_url: '',
    opencode_url: '',
    comfyui_url: '',
    launcher_scan_dir: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, ConnectionStatus>>({});
  const [testDetails, setTestDetails] = useState<Record<string, TestConnectionResult | null>>({});

  const [llamaDir, setLlamaDir] = useState('');
  const [updateScript, setUpdateScript] = useState(DEFAULT_UPDATE_SCRIPT);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [editScriptOpen, setEditScriptOpen] = useState(false);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);

  const [docSettings, setDocSettings] = useState({
    llamaCppVersion: '',
    readmeUrl: '',
    buildNotesUrl: DEFAULT_BUILD_NOTES_URL,
    githubRepo: DEFAULT_GITHUB_REPO,
    tagPrefix: DEFAULT_TAG_PREFIX,
  });
  const [docErrors, setDocErrors] = useState<{ readmeUrl?: string; buildNotesUrl?: string; githubRepo?: string; tagPrefix?: string }>({});
  const [docSaveState, setDocSaveState] = useState<'idle' | 'success'>('idle');

  useEffect(() => {
    const dir = localStorage.getItem('llama_cpp_dir');
    if (dir) setLlamaDir(dir);
    const script = localStorage.getItem('llama_cpp_update_script');
    if (script) setUpdateScript(script);

    const storedVersion = localStorage.getItem('llama_cpp_version') || '';
    const storedReadme = localStorage.getItem('llama_cpp_readme_url');
    const storedBuildNotes = localStorage.getItem('llama_cpp_build_notes_url');
    const storedGithubRepo = localStorage.getItem('llama_cpp_github_repo');
    const storedTagPrefix = localStorage.getItem('llama_cpp_tag_prefix');
    setDocSettings({
      llamaCppVersion: storedVersion,
      readmeUrl: storedReadme || '',
      buildNotesUrl: storedBuildNotes || DEFAULT_BUILD_NOTES_URL,
      githubRepo: storedGithubRepo || DEFAULT_GITHUB_REPO,
      tagPrefix: storedTagPrefix || DEFAULT_TAG_PREFIX,
    });
    if (!storedBuildNotes) localStorage.setItem('llama_cpp_build_notes_url', DEFAULT_BUILD_NOTES_URL);
    if (!storedGithubRepo) localStorage.setItem('llama_cpp_github_repo', DEFAULT_GITHUB_REPO);
    if (!storedTagPrefix) localStorage.setItem('llama_cpp_tag_prefix', DEFAULT_TAG_PREFIX);
  }, []);

  useEffect(() => {
    if (!llamaDir) { setRepoInfo(null); return; }
    getRepoInfo(llamaDir, docSettings.githubRepo, docSettings.tagPrefix).then(setRepoInfo).catch(() => setRepoInfo(null));
  }, [llamaDir, docSettings.githubRepo, docSettings.tagPrefix]);

  // Auto-fill README URL from the detected git remote if the user hasn't set one yet.
  useEffect(() => {
    if (!docSettings.readmeUrl && repoInfo?.readme_url) {
      const next = repoInfo.readme_url;
      setDocSettings((prev) => ({ ...prev, readmeUrl: next }));
      localStorage.setItem('llama_cpp_readme_url', next);
    }
  }, [repoInfo, docSettings.readmeUrl]);

  const isValidUrl = (value: string) => {
    try { new URL(value); return true; } catch { return false; }
  };

  const handleSaveDocSettings = () => {
    const errors: typeof docErrors = {};
    if (!docSettings.readmeUrl.trim()) errors.readmeUrl = 'README URL is required';
    else if (!isValidUrl(docSettings.readmeUrl.trim())) errors.readmeUrl = 'Enter a valid URL';
    if (!docSettings.buildNotesUrl.trim()) errors.buildNotesUrl = 'Build Notes URL is required';
    else if (!isValidUrl(docSettings.buildNotesUrl.trim())) errors.buildNotesUrl = 'Enter a valid URL';
    if (!docSettings.githubRepo.trim()) errors.githubRepo = 'GitHub repository is required';
    else if (!/^[^/\s]+\/[^/\s]+$/.test(docSettings.githubRepo.trim())) errors.githubRepo = 'Use the format owner/repo';
    if (!docSettings.tagPrefix.trim()) errors.tagPrefix = 'Tag prefix is required';
    setDocErrors(errors);
    if (Object.keys(errors).length > 0) { setDocSaveState('idle'); return; }

    localStorage.setItem('llama_cpp_version', docSettings.llamaCppVersion.trim());
    localStorage.setItem('llama_cpp_readme_url', docSettings.readmeUrl.trim());
    localStorage.setItem('llama_cpp_build_notes_url', docSettings.buildNotesUrl.trim());
    localStorage.setItem('llama_cpp_github_repo', docSettings.githubRepo.trim());
    localStorage.setItem('llama_cpp_tag_prefix', docSettings.tagPrefix.trim());
    setDocSaveState('success');
    setTimeout(() => setDocSaveState('idle'), 2000);
  };

  const handleSelectDirectory = (path: string) => {
    setLlamaDir(path);
    localStorage.setItem('llama_cpp_dir', path);
  };

  const handleSaveScript = (script: string) => {
    setUpdateScript(script);
    localStorage.setItem('llama_cpp_update_script', script);
  };

  useEffect(() => {
    getAiSettings()
      .then((s) => {
        setSettings(s);
        if (s.launcher_scan_dir && !llamaDir) {
          setLlamaDir(s.launcher_scan_dir);
          localStorage.setItem('llama_cpp_dir', s.launcher_scan_dir);
        }
        setLoading(false);
      })
      .catch(() => {
        setSettings({
          llama_server_url: 'http://localhost:8081',
          openwebui_url: 'http://localhost:3000',
          opencode_url: 'http://localhost:4000',
          comfyui_url: 'http://localhost:8188',
        });
        setLoading(false);
      });
  }, []);

  const handleTest = async (field: string, url: string) => {
    if (!url.trim()) return;
    setTestResults((prev) => ({ ...prev, [field]: 'testing' }));
    try {
      const result = await testConnection(url);
      setTestDetails((prev) => ({ ...prev, [field]: result }));
      setTestResults((prev) => ({
        ...prev,
        [field]: result.available ? 'success' : 'error',
      }));
    } catch {
      setTestResults((prev) => ({ ...prev, [field]: 'error' }));
      setTestDetails((prev) => ({
        ...prev,
        [field]: { url, available: false, error_message: 'Connection failed' },
      }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAiSettings({ ...settings, launcher_scan_dir: llamaDir || undefined });
    } catch {
      // silently ignore save errors — toast will show if needed
    } finally {
      setSaving(false);
    }
  };

  const renderStatusIcon = (status: ConnectionStatus, field: string) => {
    if (status === 'testing') {
      return <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-muted)' }} />;
    }
    if (status === 'success') {
      return <CheckCircle size={13} style={{ color: 'var(--success)' }} />;
    }
    if (status === 'error') {
      const detail = testDetails[field];
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <XCircle size={13} style={{ color: 'var(--danger)' }} />
          {detail?.error_message && (
            <span style={{ fontSize: '10px', color: 'var(--danger)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {detail.error_message}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  const renderUrlField = (key: Exclude<keyof AiSettings, 'launcher_scan_dir'>, label: string, placeholder: string, icon: React.ReactNode) => (
    <div key={key} className="settings-field">
      <div className="settings-field-label">{icon}{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="url"
          className="settings-input"
          value={settings[key]}
          onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
        />
        <button
          className="settings-btn"
          onClick={() => handleTest(key, settings[key])}
          disabled={testResults[key] === 'testing' || !settings[key].trim()}
        >
          <RefreshCw size={13} className={testResults[key] === 'testing' ? 'spin' : undefined} />
          Test
        </button>
      </div>
      {testResults[key] && testResults[key] !== 'idle' && (
        <div style={{ marginTop: 8 }}>{renderStatusIcon(testResults[key], key)}</div>
      )}
    </div>
  );

  const fields: Array<{ key: Exclude<keyof AiSettings, 'launcher_scan_dir'>; label: string; placeholder: string }> = [
    { key: 'openwebui_url', label: 'OpenWebUI URL', placeholder: 'http://localhost:3000' },
    { key: 'opencode_url', label: 'OpenCode URL', placeholder: 'http://localhost:4000' },
    { key: 'comfyui_url', label: 'ComfyUI URL', placeholder: 'http://localhost:8188' },
  ];

  return (
    <main className="settings-grid">
      <div className="settings-card">
        <div className="settings-card-header">
          <div className="settings-icon-badge">
            <SettingsIcon size={16} style={{ color: accent.color }} />
          </div>
          <div>
            <div className="settings-card-title">AI Service Configuration</div>
            <div className="settings-card-subtitle">Connections to AI services on the network</div>
          </div>
        </div>

        <div className="settings-card-body">
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading settings...
            </div>
          ) : (
            <>
              {fields.map(({ key, label, placeholder }) => renderUrlField(key, label, placeholder, <Link2 size={12} />))}

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <button className="settings-btn settings-btn-accent" onClick={handleSave} disabled={saving} style={{ padding: '10px 24px' }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <div className="settings-icon-badge">
            <GitBranch size={16} style={{ color: accent.color }} />
          </div>
          <div>
            <div className="settings-card-title">LLAMA.CPP Configuration</div>
            <div className="settings-card-subtitle">Repository, build, and connection settings</div>
          </div>
        </div>

        <div className="settings-card-body">
          {!loading && renderUrlField('llama_server_url', 'Llama Server URL', 'http://localhost:8081', <Link2 size={12} />)}

          <div className="settings-field">
            <div className="settings-field-label"><Folder size={12} />Repository Directory</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="settings-input"
                value={llamaDir}
                readOnly
                placeholder="No directory selected"
                style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
              />
              <button className="settings-btn" onClick={() => setBrowserOpen(true)}>
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          <div className="settings-field">
            <div className="settings-field-label"><Folder size={12} />Startup Script Directory</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="settings-input"
                value={llamaDir || ''}
                readOnly
                placeholder="/home/gamer/Documents/AI/Start_Scripts"
                style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
              />
              <button className="settings-btn" onClick={() => setBrowserOpen(true)}>
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          <div className="settings-field">
            <div className="settings-field-label"><SettingsIcon size={12} />Update Script</div>
            <button className="settings-btn settings-btn-accent" onClick={() => setEditScriptOpen(true)}>
              <SettingsIcon size={13} />
              Edit Update Script
            </button>
          </div>

        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <div className="settings-icon-badge">
            <BookOpen size={16} style={{ color: accent.color }} />
          </div>
          <div>
            <div className="settings-card-title">LLAMA.CPP Documentation</div>
            <div className="settings-card-subtitle">Version label and documentation links shown on the AI page</div>
          </div>
        </div>

        <div className="settings-card-body">
          <div className="settings-field">
            <div className="settings-field-label"><Tag size={12} />llama.cpp Version</div>
            <input
              type="text"
              className="settings-input"
              style={{ width: '100%' }}
              value={docSettings.llamaCppVersion}
              onChange={(e) => setDocSettings((prev) => ({ ...prev, llamaCppVersion: e.target.value }))}
              placeholder="b4774 (2025-06-20)"
            />
            {repoInfo?.local_build_tag && (
              <button
                onClick={() => setDocSettings((prev) => ({ ...prev, llamaCppVersion: repoInfo.local_build_tag! }))}
                style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
              >
                Installed tag: <span style={{ fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{repoInfo.local_build_tag}</span> — click to use
              </button>
            )}
            {repoInfo?.latest_build_tag && (
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                Latest available: <span style={{ fontFamily: 'monospace', color: repoInfo.local_build_tag && repoInfo.local_build_tag !== repoInfo.latest_build_tag ? 'var(--warning)' : 'var(--text-primary)' }}>{repoInfo.latest_build_tag}</span>
                {repoInfo.local_build_tag && repoInfo.local_build_tag !== repoInfo.latest_build_tag && (
                  <span style={{ marginLeft: 6, color: 'var(--warning)', fontWeight: 700 }}>Update available</span>
                )}
              </div>
            )}
          </div>

          <div className="settings-field">
            <div className="settings-field-label"><GitBranch size={12} />GitHub Repository</div>
            <input
              type="text"
              className="settings-input"
              style={{ width: '100%', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
              value={docSettings.githubRepo}
              onChange={(e) => setDocSettings((prev) => ({ ...prev, githubRepo: e.target.value }))}
              placeholder="ggml-org/llama.cpp"
            />
            {docErrors.githubRepo && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>{docErrors.githubRepo}</div>}
          </div>

          <div className="settings-field">
            <div className="settings-field-label"><Tag size={12} />Build Tag Prefix</div>
            <input
              type="text"
              className="settings-input"
              style={{ width: '100%', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
              value={docSettings.tagPrefix}
              onChange={(e) => setDocSettings((prev) => ({ ...prev, tagPrefix: e.target.value }))}
              placeholder="b"
            />
            {docErrors.tagPrefix && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>{docErrors.tagPrefix}</div>}
          </div>

          <div className="settings-field">
            <div className="settings-field-label"><BookOpen size={12} />README URL</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                className="settings-input"
                value={docSettings.readmeUrl}
                onChange={(e) => setDocSettings((prev) => ({ ...prev, readmeUrl: e.target.value }))}
                placeholder="https://github.com/ggml-org/llama.cpp/blob/master/README.md"
              />
              <button className="settings-btn" onClick={() => docSettings.readmeUrl && window.open(docSettings.readmeUrl, '_blank', 'noopener,noreferrer')} disabled={!docSettings.readmeUrl}>
                <ExternalLink size={13} />
              </button>
            </div>
            {docErrors.readmeUrl && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>{docErrors.readmeUrl}</div>}
          </div>

          <div className="settings-field">
            <div className="settings-field-label"><FileText size={12} />Build Notes URL</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                className="settings-input"
                value={docSettings.buildNotesUrl}
                onChange={(e) => setDocSettings((prev) => ({ ...prev, buildNotesUrl: e.target.value }))}
                placeholder="https://github.com/ggml-org/llama.cpp/releases"
              />
              <button className="settings-btn" onClick={() => docSettings.buildNotesUrl && window.open(docSettings.buildNotesUrl, '_blank', 'noopener,noreferrer')} disabled={!docSettings.buildNotesUrl}>
                <ExternalLink size={13} />
              </button>
            </div>
            {docErrors.buildNotesUrl && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>{docErrors.buildNotesUrl}</div>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button className="settings-btn settings-btn-accent" onClick={handleSaveDocSettings} style={{ padding: '10px 24px' }}>
              {docSaveState === 'success' ? <CheckCircle size={14} /> : <Save size={14} />}
              {docSaveState === 'success' ? 'Saved' : 'Save Documentation Settings'}
            </button>
          </div>
        </div>
      </div>

      <DirectoryBrowserModal isOpen={browserOpen} onClose={() => setBrowserOpen(false)} onSelect={handleSelectDirectory} initialPath={llamaDir || undefined} />
      <EditUpdateScriptModal isOpen={editScriptOpen} onClose={() => setEditScriptOpen(false)} onSave={handleSaveScript} script={updateScript} defaultScript={DEFAULT_UPDATE_SCRIPT} />
    </main>
  );
}
