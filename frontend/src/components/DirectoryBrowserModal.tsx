import { useState, useEffect, useCallback } from "react";
import { browseDirectory } from "../services/api";
import { DirectoryEntry } from "../types/metrics";
import { Folder, FolderOpen, X, ChevronUp } from "lucide-react";

const centeredPaneStyle: React.CSSProperties = {
  padding: 20,
  textAlign: "center",
  fontSize: 12,
};

function DirectoryContent({
  loading,
  error,
  entries,
  currentPath,
  onNavigate,
}: {
  loading: boolean;
  error: string | null;
  entries: DirectoryEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  if (loading) {
    return (
      <div style={{ ...centeredPaneStyle, color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ ...centeredPaneStyle, color: "var(--danger)" }}>
        {error}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div style={{ ...centeredPaneStyle, color: "var(--text-muted)" }}>
        No subdirectories
      </div>
    );
  }
  return (
    <>
      {entries.map((entry) => (
        <div
          key={entry.name}
          onClick={() =>
            onNavigate(`${currentPath.replace(/\/$/, "")}/${entry.name}`)
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            color: "var(--text-primary)",
            fontSize: 12,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-secondary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <Folder size={14} style={{ color: "var(--accent-primary)" }} />
          {entry.name}
        </div>
      ))}
    </>
  );
}

interface DirectoryBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

export default function DirectoryBrowserModal({
  isOpen,
  onClose,
  onSelect,
  initialPath,
}: DirectoryBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "/");
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await browseDirectory(path);
      setEntries(
        data
          .filter((e) => e.is_dir)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCurrentPath(path);
    } catch (e: any) {
      setError(e.message || "Failed to read directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) load(initialPath || currentPath);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const goUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    load("/" + parts.join("/"));
  };

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
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <FolderOpen size={14} style={{ color: "var(--accent-primary)" }} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Select Directory
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
              color: "var(--text-muted)",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <button
            onClick={goUp}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-primary)",
              flexShrink: 0,
            }}
            title="Up one level"
          >
            <ChevronUp size={14} />
          </button>
          <input
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(currentPath)}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 12,
              fontFamily: "monospace",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 6, minHeight: 200 }}>
          <DirectoryContent
            loading={loading}
            error={error}
            entries={entries}
            currentPath={currentPath}
            onNavigate={load}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 14px",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            data-accent-el=""
            onClick={() => {
              onSelect(currentPath);
              onClose();
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 700,
              background: "var(--accent-primary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "#fff",
            }}
          >
            Select This Directory
          </button>
        </div>
      </div>
    </div>
  );
}
