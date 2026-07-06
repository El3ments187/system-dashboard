import { ACCENT_MODES, PRESETS, BG_PRESETS } from "../hooks/useTheme";

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 28,
        height: 16,
        borderRadius: 8,
        background: on ? "var(--accent-primary)" : "var(--bg-secondary)",
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
          left: on ? 12 : 2,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "var(--text-primary)",
          transition: "left 200ms",
        }}
      />
    </div>
  );
}

function SliderRow({
  id,
  label,
  min,
  max,
  step,
  value,
  display,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <label
          htmlFor={id}
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            fontWeight: 500,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {label}
        </label>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "monospace",
          }}
        >
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{
          width: "100%",
          accentColor: "var(--accent-primary)",
          opacity: disabled ? 0.4 : 1,
        }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

const SPINE_STYLE = {
  width: 3,
  flexShrink: 0,
  borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
  alignSelf: "stretch",
} as const;

const CHART_VALS = [40, 65, 50, 80, 60, 90, 70, 55, 75, 45, 85, 60];

const PREVIEW_CARDS = [
  { title: "GPU", value: 65, sub: "41°C · 47 W" },
  { title: "CPU", value: 32, sub: "64°C · 16/32" },
  { title: "MEM", value: 57, sub: "17.5 / 30.5 GB" },
];

const PREVIEW_METERS = [
  { label: "GPU", value: 65 },
  { label: "CPU", value: 32 },
  { label: "MEM", value: 57 },
  { label: "DSK", value: 36 },
];

function ThemePreview() {
  return (
    <div className="theme-preview-panel">
      {/* Metric cards with accent spines */}
      <div className="preview-cards-row">
        {PREVIEW_CARDS.map((card) => (
          <div
            key={card.title}
            data-accent-el=""
            className="preview-card"
            style={{
              boxShadow:
                "var(--shadow-card), var(--card-glow), var(--card-halo)",
            }}
          >
            <div className="accent-spine accent-fill" style={SPINE_STYLE} />
            <div className="preview-card-body">
              <span className="preview-card-title">{card.title}</span>
              <span className="accent-text preview-card-value">
                {card.value}%
              </span>
              <span className="preview-card-sub">{card.sub}</span>
              <div className="preview-bar-track">
                <div
                  className="accent-fill accent-glow-target preview-bar-fill"
                  style={{ width: `${card.value}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* History chart */}
      <div data-accent-el="" className="preview-chart">
        <div className="preview-chart-inner">
          {CHART_VALS.map((h, i) => (
            <div
              key={i}
              className="theme-live-preview-bar"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* Horizontal meter bars */}
      <div className="preview-meters">
        {PREVIEW_METERS.map((m) => (
          <div key={m.label} data-accent-el="" className="preview-meter-row">
            <span className="preview-meter-label">{m.label}</span>
            <div className="preview-meter-track">
              <div
                className="accent-fill accent-glow-target preview-meter-fill"
                style={{ width: `${m.value}%` }}
              />
            </div>
            <span className="preview-meter-value">{m.value}%</span>
          </div>
        ))}
      </div>

      {/* Buttons and chips */}
      <div className="preview-actions">
        <button
          className="btn-accent"
          style={{ fontSize: 11, padding: "5px 12px" }}
        >
          Monitor
        </button>
        <button
          className="btn-accent"
          style={{ fontSize: 11, padding: "5px 12px" }}
        >
          Export
        </button>
        <span
          className="status-chip accent"
          style={{
            color: "var(--accent-primary)",
            background: "var(--accent-tint-15)",
          }}
        >
          <span
            className="chip-dot live"
            style={{ background: "var(--accent-primary)" }}
          />
          Live
        </span>
        <span
          className="status-chip"
          style={{
            color: "var(--accent-primary)",
            background: "var(--accent-tint-15)",
          }}
        >
          Normal
        </span>
      </div>
    </div>
  );
}

export interface ThemePageProps {
  accent: string;
  onAccentChange: (color: string) => void;
  accentMode: string;
  onAccentModeChange: (mode: string) => void;
  bg: string;
  onBgChange: (color: string) => void;
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
  pulse?: boolean;
  onPulseChange?: (v: boolean) => void;
  pulseSpeed?: number;
  onPulseSpeedChange?: (v: number) => void;
  innerGlow?: boolean;
  onInnerGlowChange?: (v: boolean) => void;
  gradientBorder?: boolean;
  onGradientBorderChange?: (v: boolean) => void;
  cardGlow?: boolean;
  onCardGlowChange?: (v: boolean) => void;
}

export default function ThemePage({
  accent,
  onAccentChange,
  accentMode,
  onAccentModeChange,
  bg,
  onBgChange,
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
  pulse,
  onPulseChange,
  pulseSpeed = 4,
  onPulseSpeedChange,
  innerGlow,
  onInnerGlowChange,
  gradientBorder,
  onGradientBorderChange,
  cardGlow,
  onCardGlowChange,
}: ThemePageProps) {
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

  return (
    <main className="theme-page">
      <div className="theme-page-header">
        <div>
          <div className="theme-page-title">Theme Settings</div>
          <div className="theme-page-subtitle">
            Customize dashboard appearance
          </div>
        </div>
        <button className="theme-reset-btn" onClick={onReset}>
          Reset to Default
        </button>
      </div>

      <div className="theme-page-body">
        {/* Controls: two sub-columns */}
        <div className="theme-page-controls">
          {/* Left: Accent colors + Background colors */}
          <div className="theme-ctrl-col">
            <div className="theme-section-header">Accent Colors</div>
            <div className="accent-grid">
              {PRESETS.map((preset) => (
                <div
                  key={preset.value}
                  className={`color-option${accent === preset.value ? " active" : ""}`}
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

            <div className="theme-section-header">Background</div>
            <div className="bg-grid">
              {BG_PRESETS.map((bgPreset) => (
                <div
                  key={bgPreset.value}
                  className={`color-option${bg === bgPreset.value ? " active" : ""}`}
                  onClick={() => onBgChange(bgPreset.value)}
                >
                  <div
                    className="color-preview"
                    style={{
                      background: `linear-gradient(135deg, ${bgPreset.color}, ${bgPreset.color}88)`,
                      border: [
                        "Light",
                        "Paper",
                        "Nord Light",
                        "Cream",
                      ].includes(bgPreset.name)
                        ? "1px solid #ccc"
                        : "none",
                    }}
                  />
                  <span className="color-label">{bgPreset.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Accent Mode + Effect sliders + Effects */}
          <div className="theme-ctrl-col">
            <div className="theme-section-header">Accent Mode</div>
            <div className="mode-list">
              {ACCENT_MODES.map((mode) => (
                <div
                  key={mode.id}
                  className={`mode-row${accentMode === mode.id ? " active" : ""}`}
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
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {showSpeed && (
                    <SliderRow
                      id="tp-speed"
                      label={
                        prefersReducedMotion
                          ? "Speed (reduced-motion active)"
                          : "Speed"
                      }
                      min={4}
                      max={30}
                      step={1}
                      value={fxSpeed}
                      display={`${fxSpeed}s`}
                      disabled={prefersReducedMotion}
                      onChange={(v) => {
                        document.documentElement.style.setProperty(
                          "--fx-speed",
                          `${v}s`,
                        );
                        onFxSpeedChange?.(v);
                      }}
                    />
                  )}
                  {showSpread && (
                    <SliderRow
                      id="tp-spread"
                      label="Spread"
                      min={0}
                      max={60}
                      step={1}
                      value={fxSpread}
                      display={`${fxSpread}`}
                      onChange={(v) => {
                        document.documentElement.style.setProperty(
                          "--fx-spread",
                          String(v),
                        );
                        onFxSpreadChange?.(v);
                      }}
                    />
                  )}
                  {showDepth && (
                    <SliderRow
                      id="tp-depth"
                      label="Depth"
                      min={0}
                      max={60}
                      step={1}
                      value={fxDepth}
                      display={`${fxDepth}°`}
                      onChange={(v) => {
                        document.documentElement.style.setProperty(
                          "--fx-depth",
                          String(v),
                        );
                        onFxDepthChange?.(v);
                      }}
                    />
                  )}
                </div>
              </>
            )}

            <div className="theme-section-header">Effects</div>
            {/* effects-grid is a flex column designed to hold many effect rows */}
            <div className="effects-grid">
              {onGlowChange && (
                <div className="effect-row-group">
                  <div
                    className={`mode-row${glow ? " active" : ""}`}
                    onClick={() => onGlowChange(!glow)}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="mode-radio" />
                    <div className="mode-text">
                      <span className="mode-name">Neon Glow</span>
                      <span className="mode-desc">
                        Glow halo on accent spines and bars
                      </span>
                    </div>
                    <ToggleSwitch on={!!glow} />
                  </div>
                  {glow && onGlowIntensityChange && (
                    <div style={{ paddingLeft: 20, paddingTop: 6 }}>
                      <SliderRow
                        id="tp-glow-intensity"
                        label="Intensity"
                        min={0.25}
                        max={3}
                        step={0.05}
                        value={glowIntensity}
                        display={glowIntensity.toFixed(2)}
                        onChange={(v) => {
                          document.documentElement.style.setProperty(
                            "--glow-intensity",
                            String(v),
                          );
                          onGlowIntensityChange(v);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {onPulseChange && (
                <div className="effect-row-group">
                  <div
                    className={`mode-row${pulse ? " active" : ""}`}
                    onClick={() => onPulseChange(!pulse)}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="mode-radio" />
                    <div className="mode-text">
                      <span className="mode-name">Pulse</span>
                      <span className="mode-desc">
                        Breathing glow on accent elements
                      </span>
                    </div>
                    <ToggleSwitch on={!!pulse} />
                  </div>
                  {pulse && onPulseSpeedChange && (
                    <div style={{ paddingLeft: 20, paddingTop: 6 }}>
                      <SliderRow
                        id="tp-pulse-speed"
                        label={
                          prefersReducedMotion
                            ? "Pulse Speed (reduced-motion active)"
                            : "Pulse Speed"
                        }
                        min={1}
                        max={10}
                        step={0.5}
                        value={pulseSpeed}
                        display={`${pulseSpeed}s`}
                        disabled={prefersReducedMotion}
                        onChange={(v) => {
                          document.documentElement.style.setProperty(
                            "--pulse-speed",
                            `${v}s`,
                          );
                          onPulseSpeedChange(v);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {onInnerGlowChange && (
                <div className="effect-row-group">
                  <div
                    className={`mode-row${innerGlow ? " active" : ""}`}
                    onClick={() => onInnerGlowChange(!innerGlow)}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="mode-radio" />
                    <div className="mode-text">
                      <span className="mode-name">Inner Glow</span>
                      <span className="mode-desc">
                        Inset glow inside accent fills
                      </span>
                    </div>
                    <ToggleSwitch on={!!innerGlow} />
                  </div>
                </div>
              )}

              {onGradientBorderChange && (
                <div className="effect-row-group">
                  <div
                    className={`mode-row${gradientBorder ? " active" : ""}`}
                    onClick={() => onGradientBorderChange(!gradientBorder)}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="mode-radio" />
                    <div className="mode-text">
                      <span className="mode-name">Gradient Border</span>
                      <span className="mode-desc">
                        Animated gradient ring around cards
                      </span>
                    </div>
                    <ToggleSwitch on={!!gradientBorder} />
                  </div>
                </div>
              )}

              {onCardGlowChange && (
                <div className="effect-row-group">
                  <div
                    className={`mode-row${cardGlow && (glow || innerGlow) ? " active" : ""}`}
                    onClick={() =>
                      (glow || innerGlow) && onCardGlowChange(!cardGlow)
                    }
                    style={{
                      cursor: glow || innerGlow ? "pointer" : "not-allowed",
                      opacity: !glow && !innerGlow ? 0.5 : 1,
                    }}
                  >
                    <span className="mode-radio" />
                    <div className="mode-text">
                      <span className="mode-name">Card Glow</span>
                      <span className="mode-desc">
                        {!glow && !innerGlow
                          ? "Requires Neon Glow or Inner Glow"
                          : "Extend halo to full card border"}
                      </span>
                    </div>
                    <ToggleSwitch on={!!cardGlow && (!!glow || !!innerGlow)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className="theme-page-preview-col">
          <div className="theme-section-header">Live Preview</div>
          <ThemePreview />
        </div>
      </div>
    </main>
  );
}
