import { useState } from "react";
import { Settings, X } from "lucide-react";

interface EditUpdateScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (script: string) => void;
  script: string;
  defaultScript: string;
  title?: string;
  description?: string;
}

export default function EditUpdateScriptModal({
  isOpen,
  onClose,
  onSave,
  script,
  defaultScript,
  title = "Edit Update Commands",
  description = "One command per line. Executed in order in the working directory.",
}: EditUpdateScriptModalProps) {
  const [value, setValue] = useState(script);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevScript, setPrevScript] = useState(script);

  if (prevIsOpen !== isOpen || prevScript !== script) {
    setPrevIsOpen(isOpen);
    setPrevScript(script);
    if (isOpen) setValue(script);
  }

  if (!isOpen) return null;

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
            <Settings size={14} style={{ color: "var(--accent-primary)" }} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {title}
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

        <div style={{ padding: 14 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {description}
          </div>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={8}
            style={{
              width: "100%",
              resize: "vertical",
              padding: 10,
              fontSize: 12,
              fontFamily: "monospace",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
            }}
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
            onClick={() => setValue(defaultScript)}
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            Reset to Defaults
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
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
            onClick={() => {
              onSave(value);
              onClose();
            }}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              background: "var(--accent-primary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "#fff",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
