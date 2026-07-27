import { useState, useEffect, useRef } from "react";
import {
  getAiSettings,
  updateAiSettings,
  testConnection,
  getRepoInfo,
  getSettingsLocation,
} from "../services/api";
import { AiSettings, TestConnectionResult, RepoInfo } from "../types/metrics";
import {
  Settings as SettingsIcon,
  Save,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  FolderOpen,
  BookOpen,
  Folder,
  GitBranch,
  Link2,
  FileText,
  ExternalLink,
  Terminal,
  Copy,
  HardDrive,
} from "lucide-react";
import DirectoryBrowserModal from "../components/DirectoryBrowserModal";
import EditUpdateScriptModal from "../components/EditUpdateScriptModal";
import { SettingsCard } from "../components/shared/CardComponents";
import { GpuBackendStatus } from "../components/settings/GpuBackendStatus";

function SettingsFileLocationCard({
  location,
}: {
  location: { path: string; exists: boolean } | null;
}) {
  return (
    <SettingsCard>
      <div className="settings-card-header">
        <div data-accent-el="" className="settings-icon-badge">
          <HardDrive size={16} style={{ color: "var(--accent-primary)" }} />
        </div>
        <div>
          <div className="settings-card-title">Settings File Location</div>
          <div className="settings-card-subtitle">
            Where AI service settings are persisted on disk
          </div>
        </div>
      </div>

      <div className="settings-card-body">
        {location == null ? (
          <div
            style={{ padding: 12, fontSize: 12, color: "var(--text-muted)" }}
          >
            Loading location…
          </div>
        ) : (
          <div className="settings-field">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: location.exists
                    ? "color-mix(in srgb, var(--success) 15%, transparent)"
                    : "color-mix(in srgb, var(--warning) 15%, transparent)",
                  color: location.exists ? "var(--success)" : "var(--warning)",
                  border: `1px solid ${location.exists ? "color-mix(in srgb, var(--success) 30%, transparent)" : "color-mix(in srgb, var(--warning) 30%, transparent)"}`,
                }}
              >
                {location.exists ? "EXISTS" : "NOT YET CREATED"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                className="settings-input"
                value={location.path}
                readOnly
                title={location.path}
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 11,
                }}
              />
              <button
                className="settings-btn"
                title="Copy path"
                onClick={() => navigator.clipboard.writeText(location.path)}
              >
                <Copy size={13} />
              </button>
            </div>
            {!location.exists && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                File will be created when you save settings.
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

const DEFAULT_UPDATE_SCRIPT =
  "git pull\ncmake --build build --config Release -j$(nproc)";
const DEFAULT_BUILD_NOTES_URL =
  "https://github.com/ggml-org/llama.cpp/releases";
const DEFAULT_LOCAL_VERSION_CMD =
  "git tag --sort=-version:refname | grep '^b' | head -1";
const DEFAULT_LATEST_VERSION_CMD =
  "git ls-remote --tags --sort=-version:refname origin 'refs/tags/b*' | head -1 | sed 's|.*refs/tags/||'";

interface SettingsPageProps {
  accent: { color: string; glow: string };
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

export default function SettingsPage({}: SettingsPageProps) {
  const [settings, setSettings] = useState<AiSettings>({
    llama_server_url: "",
    openwebui_url: "",
    opencode_url: "",
    comfyui_url: "",
    launcher_scan_dir: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, ConnectionStatus>
  >({});
  const [testDetails, setTestDetails] = useState<
    Record<string, TestConnectionResult | null>
  >({});

  const [llamaDir, setLlamaDir] = useState(
    () => localStorage.getItem("llama_cpp_dir") ?? "",
  );
  const [scanDir, setScanDir] = useState(
    () => localStorage.getItem("llama_scan_dir") ?? "",
  );
  const [updateScript, setUpdateScript] = useState(
    () =>
      localStorage.getItem("llama_cpp_update_script") ?? DEFAULT_UPDATE_SCRIPT,
  );
  const [settingsLocation, setSettingsLocation] = useState<{
    path: string;
    exists: boolean;
  } | null>(null);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [scanBrowserOpen, setScanBrowserOpen] = useState(false);
  const [editScriptOpen, setEditScriptOpen] = useState(false);
  const [editLocalCmdOpen, setEditLocalCmdOpen] = useState(false);
  const [editLatestCmdOpen, setEditLatestCmdOpen] = useState(false);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);

  const [docSettings, setDocSettings] = useState(() => ({
    readmeUrl: localStorage.getItem("llama_cpp_readme_url") ?? "",
    buildNotesUrl:
      localStorage.getItem("llama_cpp_build_notes_url") ??
      DEFAULT_BUILD_NOTES_URL,
    localVersionCmd:
      localStorage.getItem("llama_cpp_local_version_cmd") ??
      DEFAULT_LOCAL_VERSION_CMD,
    latestVersionCmd:
      localStorage.getItem("llama_cpp_latest_version_cmd") ??
      DEFAULT_LATEST_VERSION_CMD,
  }));
  const [docErrors, setDocErrors] = useState<{
    readmeUrl?: string;
    buildNotesUrl?: string;
  }>({});
  const [docSaveState, setDocSaveState] = useState<"idle" | "success">("idle");

  useEffect(() => {
    if (!localStorage.getItem("llama_cpp_build_notes_url"))
      localStorage.setItem(
        "llama_cpp_build_notes_url",
        DEFAULT_BUILD_NOTES_URL,
      );
    if (!localStorage.getItem("llama_cpp_local_version_cmd"))
      localStorage.setItem(
        "llama_cpp_local_version_cmd",
        DEFAULT_LOCAL_VERSION_CMD,
      );
    if (!localStorage.getItem("llama_cpp_latest_version_cmd"))
      localStorage.setItem(
        "llama_cpp_latest_version_cmd",
        DEFAULT_LATEST_VERSION_CMD,
      );
  }, []);

  useEffect(() => {
    if (!llamaDir) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRepoInfo(null);
      return;
    }
    getRepoInfo(
      llamaDir,
      docSettings.localVersionCmd,
      docSettings.latestVersionCmd,
    )
      .then(setRepoInfo)
      .catch(() => setRepoInfo(null));
  }, [llamaDir, docSettings.localVersionCmd, docSettings.latestVersionCmd]);

  // Auto-fill README URL from the detected git remote if the user hasn't set one yet.
  useEffect(() => {
    if (!docSettings.readmeUrl && repoInfo?.readme_url) {
      const next = repoInfo.readme_url;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocSettings((prev) => ({ ...prev, readmeUrl: next }));
      localStorage.setItem("llama_cpp_readme_url", next);
    }
  }, [repoInfo, docSettings.readmeUrl]);

  const isValidUrl = (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveDocSettings = () => {
    const errors: typeof docErrors = {};
    if (!docSettings.readmeUrl.trim())
      errors.readmeUrl = "README URL is required";
    else if (!isValidUrl(docSettings.readmeUrl.trim()))
      errors.readmeUrl = "Enter a valid URL";
    if (!docSettings.buildNotesUrl.trim())
      errors.buildNotesUrl = "Build Notes URL is required";
    else if (!isValidUrl(docSettings.buildNotesUrl.trim()))
      errors.buildNotesUrl = "Enter a valid URL";
    setDocErrors(errors);
    if (Object.keys(errors).length > 0) {
      setDocSaveState("idle");
      return;
    }

    localStorage.setItem("llama_cpp_readme_url", docSettings.readmeUrl.trim());
    localStorage.setItem(
      "llama_cpp_build_notes_url",
      docSettings.buildNotesUrl.trim(),
    );
    setDocSaveState("success");
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setDocSaveState("idle"), 2000);
  };

  const handleSelectWorkingDir = (path: string) => {
    setLlamaDir(path);
    localStorage.setItem("llama_cpp_dir", path);
  };

  const handleSelectScanDir = (path: string) => {
    setScanDir(path);
    localStorage.setItem("llama_scan_dir", path);
  };

  const handleSaveScript = (script: string) => {
    setUpdateScript(script);
    localStorage.setItem("llama_cpp_update_script", script);
  };

  const handleSaveLocalCmd = (cmd: string) => {
    localStorage.setItem("llama_cpp_local_version_cmd", cmd);
    setDocSettings((prev) => ({ ...prev, localVersionCmd: cmd }));
  };

  const handleSaveLatestCmd = (cmd: string) => {
    localStorage.setItem("llama_cpp_latest_version_cmd", cmd);
    setDocSettings((prev) => ({ ...prev, latestVersionCmd: cmd }));
  };

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    },
    [],
  );

  const initialLlamaDirRef = useRef(llamaDir);
  const initialScanDirRef = useRef(scanDir);

  useEffect(() => {
    getAiSettings()
      .then((s) => {
        setSettings(s);
        if (s.llama_working_dir && !initialLlamaDirRef.current) {
          setLlamaDir(s.llama_working_dir);
          localStorage.setItem("llama_cpp_dir", s.llama_working_dir);
        }
        if (s.launcher_scan_dir && !initialScanDirRef.current) {
          setScanDir(s.launcher_scan_dir);
          localStorage.setItem("llama_scan_dir", s.launcher_scan_dir);
        }
        setLoading(false);
      })
      .catch(() => {
        setSettings({
          llama_server_url: "http://localhost:8081",
          openwebui_url: "http://localhost:3000",
          opencode_url: "http://localhost:4000",
          comfyui_url: "http://localhost:8188",
        });
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    getSettingsLocation()
      .then(setSettingsLocation)
      .catch(() => setSettingsLocation(null));
  }, []);

  const handleTest = async (field: string, url: string) => {
    if (!url.trim()) return;
    setTestResults((prev) => ({ ...prev, [field]: "testing" }));
    try {
      const result = await testConnection(url);
      setTestDetails((prev) => ({ ...prev, [field]: result }));
      setTestResults((prev) => ({
        ...prev,
        [field]: result.available ? "success" : "error",
      }));
    } catch {
      setTestResults((prev) => ({ ...prev, [field]: "error" }));
      setTestDetails((prev) => ({
        ...prev,
        [field]: { url, available: false, error_message: "Connection failed" },
      }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAiSettings({
        ...settings,
        launcher_scan_dir: scanDir || undefined,
        llama_working_dir: llamaDir || undefined,
      });
    } catch {
      // silently ignore save errors — toast will show if needed
    } finally {
      setSaving(false);
    }
  };

  const renderStatusIcon = (status: ConnectionStatus, field: string) => {
    if (status === "testing") {
      return (
        <Loader2
          size={13}
          className="animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      );
    }
    if (status === "success") {
      return <CheckCircle size={13} style={{ color: "var(--success)" }} />;
    }
    if (status === "error") {
      const detail = testDetails[field];
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <XCircle size={13} style={{ color: "var(--danger)" }} />
          {detail?.error_message && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--danger)",
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {detail.error_message}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  const renderUrlField = (
    key: Exclude<keyof AiSettings, "launcher_scan_dir" | "llama_working_dir">,
    label: string,
    placeholder: string,
    icon: React.ReactNode,
  ) => (
    <div key={key} className="settings-field">
      <label htmlFor={key} className="settings-field-label">
        {icon}
        {label}
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="url"
          id={key}
          name={key}
          className="settings-input"
          value={settings[key]}
          title={settings[key] || undefined}
          onChange={(e) =>
            setSettings((prev) => ({ ...prev, [key]: e.target.value }))
          }
          placeholder={placeholder}
        />
        <button
          className="settings-btn"
          onClick={() => handleTest(key, settings[key])}
          disabled={testResults[key] === "testing" || !settings[key].trim()}
        >
          <RefreshCw
            size={13}
            className={testResults[key] === "testing" ? "spin" : undefined}
          />
          Test
        </button>
      </div>
      {testResults[key] && testResults[key] !== "idle" && (
        <div style={{ marginTop: 8 }}>
          {renderStatusIcon(testResults[key], key)}
        </div>
      )}
    </div>
  );

  const fields: Array<{
    key: Exclude<keyof AiSettings, "launcher_scan_dir" | "llama_working_dir">;
    label: string;
    placeholder: string;
  }> = [
    {
      key: "openwebui_url",
      label: "OpenWebUI URL",
      placeholder: "http://localhost:3000",
    },
    {
      key: "opencode_url",
      label: "OpenCode URL",
      placeholder: "http://localhost:4000",
    },
    {
      key: "comfyui_url",
      label: "ComfyUI URL",
      placeholder: "http://localhost:8188",
    },
  ];

  return (
    <main className="settings-grid">
      <SettingsCard>
        <div className="settings-card-header">
          <div data-accent-el="" className="settings-icon-badge">
            <SettingsIcon
              size={16}
              style={{ color: "var(--accent-primary)" }}
            />
          </div>
          <div>
            <div className="settings-card-title">AI Service Configuration</div>
            <div className="settings-card-subtitle">
              Connections to AI services on the network
            </div>
          </div>
        </div>

        <div className="settings-card-body">
          {loading ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Loading settings...
            </div>
          ) : (
            <>
              {fields.map(({ key, label, placeholder }) =>
                renderUrlField(key, label, placeholder, <Link2 size={12} />),
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 16,
                }}
              >
                <button
                  data-accent-el=""
                  className="settings-btn settings-btn-accent"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: "10px 24px" }}
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </>
          )}
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="settings-card-header">
          <div data-accent-el="" className="settings-icon-badge">
            <GitBranch size={16} style={{ color: "var(--accent-primary)" }} />
          </div>
          <div>
            <div className="settings-card-title">LLAMA.CPP Configuration</div>
            <div className="settings-card-subtitle">
              Repository, build, and connection settings
            </div>
          </div>
        </div>

        <div className="settings-card-body">
          {!loading &&
            renderUrlField(
              "llama_server_url",
              "Llama Server URL",
              "http://localhost:8081",
              <Link2 size={12} />,
            )}

          <div className="settings-field">
            <label htmlFor="llama-working-dir" className="settings-field-label">
              <Folder size={12} />
              Working Directory
            </label>
            <div className="settings-path-row">
              <input
                type="text"
                id="llama-working-dir"
                name="llama-working-dir"
                className="settings-input"
                value={llamaDir}
                readOnly
                title={llamaDir || undefined}
                placeholder="No directory selected"
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
              />
              {llamaDir && (
                <button
                  className="settings-btn"
                  title="Copy path"
                  onClick={() => navigator.clipboard.writeText(llamaDir)}
                >
                  <Copy size={13} />
                </button>
              )}
              <button
                className="settings-btn"
                onClick={() => setBrowserOpen(true)}
              >
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label htmlFor="launcher-scan-dir" className="settings-field-label">
              <Folder size={12} />
              Run Models Scan Directory
            </label>
            <div className="settings-path-row">
              <input
                type="text"
                id="launcher-scan-dir"
                name="launcher-scan-dir"
                className="settings-input"
                value={scanDir}
                readOnly
                title={scanDir || undefined}
                placeholder="No directory selected"
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
              />
              {scanDir && (
                <button
                  className="settings-btn"
                  title="Copy path"
                  onClick={() => navigator.clipboard.writeText(scanDir)}
                >
                  <Copy size={13} />
                </button>
              )}
              <button
                className="settings-btn"
                onClick={() => setScanBrowserOpen(true)}
              >
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          <div className="settings-field">
            <div className="settings-field-label">
              <SettingsIcon size={12} />
              Update Script
            </div>
            <button
              data-accent-el=""
              className="settings-btn settings-btn-accent"
              onClick={() => setEditScriptOpen(true)}
            >
              <SettingsIcon size={13} />
              Edit Update Script
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 16,
            }}
          >
            <button
              data-accent-el=""
              className="settings-btn settings-btn-accent"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "10px 24px" }}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="settings-card-header">
          <div data-accent-el="" className="settings-icon-badge">
            <BookOpen size={16} style={{ color: "var(--accent-primary)" }} />
          </div>
          <div>
            <div className="settings-card-title">LLAMA.CPP Documentation</div>
            <div className="settings-card-subtitle">
              Documentation links shown on the AI page
            </div>
          </div>
        </div>

        <div className="settings-card-body">
          {(repoInfo?.local_build_tag || repoInfo?.latest_build_tag) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginBottom: 12,
              }}
            >
              {repoInfo?.local_build_tag && (
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Installed tag:{" "}
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {repoInfo.local_build_tag}
                  </span>
                </div>
              )}
              {repoInfo?.latest_build_tag && (
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Latest available:{" "}
                  <span
                    style={{
                      fontFamily: "monospace",
                      color:
                        repoInfo.local_build_tag &&
                        repoInfo.local_build_tag !== repoInfo.latest_build_tag
                          ? "var(--warning)"
                          : "var(--text-primary)",
                    }}
                  >
                    {repoInfo.latest_build_tag}
                  </span>
                  {repoInfo.local_build_tag &&
                    repoInfo.local_build_tag !== repoInfo.latest_build_tag && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: "var(--warning)",
                          fontWeight: 700,
                        }}
                      >
                        Update available
                      </span>
                    )}
                </div>
              )}
            </div>
          )}

          <div className="settings-field">
            <div className="settings-field-label">
              <Terminal size={12} />
              Installed Version Command
            </div>
            <button
              data-accent-el=""
              className="settings-btn settings-btn-accent"
              onClick={() => setEditLocalCmdOpen(true)}
            >
              <Terminal size={13} />
              Edit Installed Version Command
            </button>
          </div>

          <div className="settings-field">
            <div className="settings-field-label">
              <Terminal size={12} />
              Latest Version Command
            </div>
            <button
              data-accent-el=""
              className="settings-btn settings-btn-accent"
              onClick={() => setEditLatestCmdOpen(true)}
            >
              <Terminal size={13} />
              Edit Latest Version Command
            </button>
          </div>

          <div className="settings-field">
            <label htmlFor="readme-url" className="settings-field-label">
              <BookOpen size={12} />
              README URL
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="url"
                id="readme-url"
                name="readme-url"
                className="settings-input"
                value={docSettings.readmeUrl}
                title={docSettings.readmeUrl || undefined}
                onChange={(e) =>
                  setDocSettings((prev) => ({
                    ...prev,
                    readmeUrl: e.target.value,
                  }))
                }
                placeholder="https://github.com/ggml-org/llama.cpp/blob/master/README.md"
              />
              <button
                className="settings-btn"
                onClick={() =>
                  docSettings.readmeUrl &&
                  window.open(
                    docSettings.readmeUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                disabled={!docSettings.readmeUrl}
              >
                <ExternalLink size={13} />
              </button>
            </div>
            {docErrors.readmeUrl && (
              <div
                style={{ marginTop: 6, fontSize: 11, color: "var(--danger)" }}
              >
                {docErrors.readmeUrl}
              </div>
            )}
          </div>

          <div className="settings-field">
            <label htmlFor="build-notes-url" className="settings-field-label">
              <FileText size={12} />
              Build Notes URL
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="url"
                id="build-notes-url"
                name="build-notes-url"
                className="settings-input"
                value={docSettings.buildNotesUrl}
                title={docSettings.buildNotesUrl || undefined}
                onChange={(e) =>
                  setDocSettings((prev) => ({
                    ...prev,
                    buildNotesUrl: e.target.value,
                  }))
                }
                placeholder="https://github.com/ggml-org/llama.cpp/releases"
              />
              <button
                className="settings-btn"
                onClick={() =>
                  docSettings.buildNotesUrl &&
                  window.open(
                    docSettings.buildNotesUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                disabled={!docSettings.buildNotesUrl}
              >
                <ExternalLink size={13} />
              </button>
            </div>
            {docErrors.buildNotesUrl && (
              <div
                style={{ marginTop: 6, fontSize: 11, color: "var(--danger)" }}
              >
                {docErrors.buildNotesUrl}
              </div>
            )}
          </div>

          <div
            style={{ display: "flex", justifyContent: "center", marginTop: 16 }}
          >
            <button
              data-accent-el=""
              className="settings-btn settings-btn-accent"
              onClick={handleSaveDocSettings}
              style={{ padding: "10px 24px" }}
            >
              {docSaveState === "success" ? (
                <CheckCircle size={14} />
              ) : (
                <Save size={14} />
              )}
              {docSaveState === "success"
                ? "Saved"
                : "Save Documentation Settings"}
            </button>
          </div>
        </div>
      </SettingsCard>

      <DirectoryBrowserModal
        isOpen={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={handleSelectWorkingDir}
        initialPath={llamaDir || undefined}
      />
      <DirectoryBrowserModal
        isOpen={scanBrowserOpen}
        onClose={() => setScanBrowserOpen(false)}
        onSelect={handleSelectScanDir}
        initialPath={scanDir || undefined}
      />
      <EditUpdateScriptModal
        isOpen={editScriptOpen}
        onClose={() => setEditScriptOpen(false)}
        onSave={handleSaveScript}
        script={updateScript}
        defaultScript={DEFAULT_UPDATE_SCRIPT}
      />
      <EditUpdateScriptModal
        isOpen={editLocalCmdOpen}
        onClose={() => setEditLocalCmdOpen(false)}
        onSave={handleSaveLocalCmd}
        script={docSettings.localVersionCmd}
        defaultScript={DEFAULT_LOCAL_VERSION_CMD}
        title="Edit Installed Version Command"
        description="Shell command run in the working directory. Output is used as the installed version tag."
      />
      <EditUpdateScriptModal
        isOpen={editLatestCmdOpen}
        onClose={() => setEditLatestCmdOpen(false)}
        onSave={handleSaveLatestCmd}
        script={docSettings.latestVersionCmd}
        defaultScript={DEFAULT_LATEST_VERSION_CMD}
        title="Edit Latest Version Command"
        description="Shell command run in the working directory. Output is used as the latest available version tag."
      />
      <SettingsFileLocationCard location={settingsLocation} />

      <GpuBackendStatus />
    </main>
  );
}
