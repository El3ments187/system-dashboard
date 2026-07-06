import { useTheme, ACCENT_MODES } from "../hooks/useTheme";

interface ThemePanelProps {
  open: boolean;
  onClose: () => void;
  accent: string;
  onAccentChange: (color: string) => void;
  accentMode: string;
  onAccentModeChange: (mode: string) => void;
  bg: string;
  onBgChange: (color: string) => void;
  current: { color: string; glow: string; hex: string };
  onReset: () => void;
  glow?: boolean;
  onGlowChange?: (v: boolean) => void;
  fxSpeed?: number;
  onFxSpeedChange?: (v: number) => void;
  fxSpread?: number;
  onFxSpreadChange?: (v: number) => void;
  fxDepth?: number;
  onFxDepthChange?: (v: number) => void;
  glowIntensity?: number;
  onGlowIntensityChange?: (v: number) => void;
}

export default function ThemePanel({
  open,
  onClose,
  accent,
  onAccentChange,
  accentMode,
  onAccentModeChange,
  bg,
  onBgChange,
  current,
  onReset,
  glow,
  onGlowChange,
  fxSpeed = 12,
  onFxSpeedChange,
  fxSpread = 34,
  onFxSpreadChange,
  fxDepth = 30,
  onFxDepthChange,
  glowIntensity = 1.4,
  onGlowIntensityChange,
}: ThemePanelProps) {
  const { presets, bgPresets } = useTheme();

  const prefersReducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const showSpeed = ["sheen", "flow", "rainbow-wave"].includes(accentMode);
  const showSpread = ["sheen", "flow", "rainbow-wave", "spectrum"].includes(
    accentMode,
  );
  const showDepth = ["sheen", "flow", "rainbow-wave", "spectrum"].includes(
    accentMode,
  );
  const showSliders = showSpeed || showSpread || showDepth;

  if (!open) return null;

  return (
    <>
      <div
        className={`theme-panel-overlay ${open ? "open" : ""}`}
        onClick={onClose}
      />
      <div className={`theme-panel ${open ? "open" : ""}`}>
        <button className="theme-panel-close" onClick={onClose}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M24 0l-4 4-8 8-4 4-4-4-8-8-4-4z" />
          </svg>
        </button>
        <div className="theme-panel-title">Theme Settings</div>
        <div className="theme-panel-subtitle">
          Choose an accent color for the dashboard
        </div>
        <div className="theme-preview-row">
          <div className="theme-preview-info">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                flexShrink: 0,
                background: `radial-gradient(circle at 30% 30%, ${current.color}, ${current.glow})`,
                border: "2px solid var(--border-color)",
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                {presets.find((p) => p.value === accent)?.name || "Blue"}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  fontFamily: "monospace",
                }}
              >
                {current.hex}
              </div>
            </div>
          </div>
          <div className="theme-preview-swatches">
            <div
              className="theme-preview-swatch"
              style={{ background: current.color }}
            />
            <div
              className="theme-preview-swatch"
              style={{ background: current.glow }}
            />
            <div
              className="theme-preview-swatch"
              style={{
                background: "var(--bg-card)",
                border: `2px solid ${current.color}`,
              }}
            />
            <div className="theme-preview-swatch gradient" />
          </div>
        </div>
        <div className="theme-section-header">Accent Colors</div>
        <div className="accent-grid">
          {presets.map((preset) => (
            <div
              key={preset.value}
              className={`color-option ${accent === preset.value ? "active" : ""}`}
              onClick={() => onAccentChange(preset.value)}
            >
              <div
                className="color-preview"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${preset.color}, ${preset.color}44)`,
                }}
              />
              <span className="color-label">{preset.name}</span>
            </div>
          ))}
        </div>
        <div className="theme-section-header">Accent Mode</div>
        <div className="mode-list">
          {ACCENT_MODES.map((mode) => (
            <div
              key={mode.id}
              className={`mode-row ${accentMode === mode.id ? "active" : ""}`}
              onClick={() => onAccentModeChange(mode.id)}
            >
              <span className="mode-radio" />
              <div className="mode-text">
                <span className="mode-name">{mode.name}</span>
                <span className="mode-desc">{mode.description}</span>
              </div>
            </div>
          ))}
        </div>
        {showSliders && (
          <>
            <div className="theme-section-header">Effect Controls</div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "4px 0 8px",
              }}
            >
              {showSpeed && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <label
                      htmlFor="fx-speed-slider"
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      Speed
                      {prefersReducedMotion && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                          }}
                        >
                          (reduced-motion active)
                        </span>
                      )}
                    </label>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontFamily: "monospace",
                      }}
                    >
                      {fxSpeed}s
                    </span>
                  </div>
                  <input
                    id="fx-speed-slider"
                    type="range"
                    min={4}
                    max={30}
                    step={1}
                    value={fxSpeed}
                    aria-label="Animation speed"
                    aria-valuetext={`${fxSpeed} seconds`}
                    disabled={prefersReducedMotion}
                    style={{
                      width: "100%",
                      accentColor: "var(--accent-primary)",
                      opacity: prefersReducedMotion ? 0.4 : 1,
                    }}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      document.documentElement.style.setProperty(
                        "--fx-speed",
                        `${v}s`,
                      );
                      onFxSpeedChange?.(v);
                    }}
                  />
                </div>
              )}
              {showSpread && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <label
                      htmlFor="fx-spread-slider"
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      Spread
                    </label>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontFamily: "monospace",
                      }}
                    >
                      {fxSpread}
                    </span>
                  </div>
                  <input
                    id="fx-spread-slider"
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={fxSpread}
                    aria-label="Color spread"
                    aria-valuetext={`${fxSpread} degrees`}
                    style={{
                      width: "100%",
                      accentColor: "var(--accent-primary)",
                    }}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      document.documentElement.style.setProperty(
                        "--fx-spread",
                        `${v}`,
                      );
                      onFxSpreadChange?.(v);
                    }}
                  />
                </div>
              )}
              {showDepth && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <label
                      htmlFor="fx-depth-slider"
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      Depth
                    </label>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontFamily: "monospace",
                      }}
                    >
                      {fxDepth}°
                    </span>
                  </div>
                  <input
                    id="fx-depth-slider"
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={fxDepth}
                    aria-label="Color depth (2nd hue offset)"
                    aria-valuetext={`${fxDepth} degrees`}
                    style={{
                      width: "100%",
                      accentColor: "var(--accent-primary)",
                    }}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      document.documentElement.style.setProperty(
                        "--fx-depth",
                        `${v}`,
                      );
                      onFxDepthChange?.(v);
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}
        <div className="theme-section-header">Effects</div>
        {onGlowChange && (
          <div
            className={`mode-row ${glow ? "active" : ""}`}
            onClick={() => onGlowChange(!glow)}
            style={{ cursor: "pointer" }}
          >
            <span className="mode-radio" />
            <div className="mode-text">
              <span className="mode-name">Neon Glow</span>
              <span className="mode-desc">
                Adds a glow halo to accent spine elements.
              </span>
            </div>
            <div
              style={{
                marginLeft: "auto",
                width: 28,
                height: 16,
                borderRadius: 8,
                background: glow
                  ? "var(--accent-primary)"
                  : "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                position: "relative",
                flexShrink: 0,
                transition: "background 200ms",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: glow ? 12 : 2,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "var(--text-primary)",
                  transition: "left 200ms",
                }}
              />
            </div>
          </div>
        )}
        {glow && onGlowIntensityChange && (
          <div style={{ padding: "4px 0 8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <label
                htmlFor="glow-intensity-slider"
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  fontWeight: 500,
                }}
              >
                Glow Intensity
              </label>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontFamily: "monospace",
                }}
              >
                {glowIntensity.toFixed(2)}
              </span>
            </div>
            <input
              id="glow-intensity-slider"
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={glowIntensity}
              aria-label="Glow intensity"
              aria-valuetext={`${glowIntensity.toFixed(2)}`}
              style={{
                width: "100%",
                accentColor: "var(--accent-primary)",
              }}
              onChange={(e) => {
                const v = Number(e.target.value);
                document.documentElement.style.setProperty(
                  "--glow-intensity",
                  String(v),
                );
                onGlowIntensityChange(v);
              }}
            />
          </div>
        )}
        <div className="theme-section-header">Background Colors</div>
        <div className="bg-grid">
          {bgPresets.map((bgPreset) => (
            <div
              key={bgPreset.value}
              className={`color-option ${bg === bgPreset.value ? "active" : ""}`}
              onClick={() => onBgChange(bgPreset.value)}
            >
              <div
                className="color-preview"
                style={{
                  background: `linear-gradient(135deg, ${bgPreset.color}, ${bgPreset.color}88)`,
                  border: ["Light", "Paper", "Nord Light", "Cream"].includes(
                    bgPreset.name,
                  )
                    ? "1px solid #ccc"
                    : "none",
                }}
              />
              <span className="color-label">{bgPreset.name}</span>
            </div>
          ))}
        </div>
        <div className="theme-section-header">Preview</div>
        <div className="theme-live-preview">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="btn-accent"
              style={{ fontSize: 11, padding: "5px 12px" }}
            >
              Button
            </button>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "var(--bg-secondary)",
                overflow: "hidden",
              }}
            >
              <div className="card-progress-bar" style={{ width: "64%" }} />
            </div>
          </div>
          <div className="theme-live-preview-chart">
            {[40, 65, 50, 80, 60, 90, 70, 55, 75, 45].map((h, i) => (
              <div
                key={i}
                className="theme-live-preview-bar"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <button className="theme-reset-btn" onClick={onReset}>
          Reset to Default
        </button>
      </div>
    </>
  );
}
