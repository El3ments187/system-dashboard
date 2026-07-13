import { useState, useEffect, useCallback } from "react";

/* ---- color utilities ---- */

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.min(255, Math.floor(r + (255 - r) * amount));
  g = Math.min(255, Math.floor(g + (255 - g) * amount));
  b = Math.min(255, Math.floor(b + (255 - b) * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/* ---- accent theme config ---- */

interface AccentTheme {
  id: string;
  name: string;
  color: string;
}

/**
 * Ordered as a continuous hue spectrum (computed via HSL, hue descending from Blue) rather
 * than alphabetically or by category, so neighboring swatches in the picker are always
 * perceptually related and moving along the row feels like traversing a color wheel.
 * Greens bridge Blues -> Yellows; Purples bridge Reds back toward Blue. Silver/Platinum are
 * desaturated neutrals with no real place on the hue wheel, so they're grouped at the very
 * end instead of wherever their (largely meaningless) computed hue would otherwise land.
 */
const ACCENT_THEMES: AccentTheme[] = [
  /* Blues */
  { id: "blue", name: "Blue", color: "#3B82F6" },
  { id: "sky", name: "Sky", color: "#60A5FA" },
  { id: "sapphire", name: "Sapphire", color: "#0F52BA" },
  { id: "ice", name: "Ice", color: "#8FD8FF" },

  /* Cyans & Teals */
  { id: "cyan", name: "Cyan", color: "#06B6D4" },
  { id: "turquoise", name: "Turquoise", color: "#40E0D0" },
  { id: "teal", name: "Teal", color: "#14B8A6" },
  { id: "aqua", name: "Aqua", color: "#7FFFD4" },
  { id: "mint", name: "Mint", color: "#6EE7B7" },

  /* Greens (bridge Blues -> Yellows) */
  { id: "green", name: "Green", color: "#22C55E" },
  { id: "emerald", name: "Emerald", color: "#50C878" },
  { id: "terminal", name: "Terminal Green", color: "#39FF14" },

  /* Yellows & Golds */
  { id: "yellow", name: "Yellow", color: "#FACC15" },
  { id: "gold", name: "Gold", color: "#D4AF37" },
  { id: "amber", name: "Amber", color: "#F59E0B" },
  { id: "bronze", name: "Bronze", color: "#CD7F32" },
  { id: "copper", name: "Copper", color: "#B87333" },

  /* Oranges & Reds */
  { id: "orange", name: "Orange", color: "#F97316" },
  { id: "coral", name: "Coral", color: "#FF7F6A" },
  { id: "red", name: "Red", color: "#EF4444" },

  /* Pinks & Magentas */
  { id: "rose", name: "Rose", color: "#FB7185" },
  { id: "crimson", name: "Crimson", color: "#DC143C" },
  { id: "ruby", name: "Ruby", color: "#E0115F" },
  { id: "pink", name: "Pink", color: "#EC4899" },
  { id: "orchid", name: "Orchid", color: "#DA70D6" },
  { id: "magenta", name: "Magenta", color: "#D946EF" },

  /* Purples (bridge Reds -> back toward Blue) */
  { id: "violet", name: "Violet", color: "#8A2BE2" },
  { id: "purple", name: "Purple", color: "#8B5CF6" },
  { id: "lavender", name: "Lavender", color: "#B497FF" },
  { id: "indigo", name: "Indigo", color: "#6366F1" },

  /* Neutrals & Metals — grouped at the end, not on the hue wheel */
  { id: "silver", name: "Silver", color: "#94A3B8" },
  { id: "platinum", name: "Platinum", color: "#E5E4E2" },
];

/* ---- background theme config ---- */

interface BackgroundTheme {
  id: string;
  name: string;
  background: string;
}

const BACKGROUND_THEMES: BackgroundTheme[] = [
  /* Dark backgrounds */
  { id: "dark", name: "Dark", background: "#0A0F1A" },
  { id: "midnight", name: "Midnight", background: "#020617" },
  { id: "ocean", name: "Ocean", background: "#071422" },
  { id: "forest", name: "Forest", background: "#071A12" },
  { id: "slate", name: "Slate", background: "#0F172A" },
  { id: "charcoal", name: "Charcoal", background: "#111827" },
  { id: "graphite", name: "Graphite", background: "#1E293B" },
  { id: "nord", name: "Nord", background: "#2E3440" },
  { id: "dracula", name: "Dracula", background: "#282A36" },
  { id: "oled", name: "OLED Black", background: "#000000" },
  { id: "obsidian", name: "Obsidian", background: "#0B0B0D" },
  { id: "eclipse", name: "Eclipse", background: "#060B14" },
  { id: "deep-space", name: "Deep Space", background: "#0A0F1E" },
  { id: "matrix", name: "Matrix", background: "#07110A" },
  { id: "storm", name: "Storm", background: "#101725" },
  { id: "midnight-purple", name: "Midnight Purple", background: "#120E1C" },
  { id: "arctic", name: "Arctic", background: "#0D1726" },
  { id: "carbon", name: "Carbon", background: "#121212" },

  /* Light backgrounds */
  { id: "light", name: "Light", background: "#F8FAFC" },
  { id: "paper", name: "Paper", background: "#F5F6F8" },
  { id: "nord-light", name: "Nord Light", background: "#ECEFF4" },
  { id: "cream", name: "Cream", background: "#F7F4ED" },
];

/* ---- derived accent colors map ---- */

const ACCENT_COLORS: Record<string, { color: string; glow: string }> =
  Object.fromEntries(
    ACCENT_THEMES.map((t) => [
      t.id,
      {
        color: t.color,
        glow: hexToRgba(t.color, 0.3),
      },
    ]),
  );

/* ---- presets for ThemePanel rendering ---- */

const PRESETS = ACCENT_THEMES.map((t) => ({
  name: t.name,
  value: t.id,
  color: t.color,
}));

const BG_PRESETS = BACKGROUND_THEMES.map((t) => ({
  name: t.name,
  value: t.id,
  color: t.background,
}));

/* ---- accent mode config ---- */

interface AccentMode {
  id: string;
  name: string;
  description: string;
}

const ACCENT_MODES: AccentMode[] = [
  { id: "solid", name: "Solid", description: "Single accent color." },
  {
    id: "sheen",
    name: "Sheen",
    description: "A highlight that sweeps across the UI.",
  },
  {
    id: "flow",
    name: "Flow",
    description: "A gentle multi-shade flow of your accent.",
  },
  {
    id: "rainbow-wave",
    name: "Rainbow Wave",
    description: "Classic RGB rainbow effect.",
  },
  {
    id: "spectrum",
    name: "Spectrum Per-Element",
    description: "Distributes hues across the UI.",
  },
];

const DEFAULT_ACCENT = "blue";
const DEFAULT_BG = "dark";
const DEFAULT_ACCENT_MODE = "solid";

// Migrate persisted mode choices from removed modes to their closest replacement.
function migrateAccentMode(mode: string | null): string {
  if (mode === "gradient" || mode === "animated-gradient") return "sheen";
  return mode || DEFAULT_ACCENT_MODE;
}

function _hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : null;
}

function _nearestPaletteColor(hex: string): string {
  const rgb = _hexToRgb(hex);
  if (!rgb) return ACCENT_THEMES[0].color;
  let nearest = ACCENT_THEMES[0];
  let minDist = Infinity;
  for (const t of ACCENT_THEMES) {
    const tr = _hexToRgb(t.color);
    if (!tr) continue;
    const d =
      (rgb[0] - tr[0]) ** 2 + (rgb[1] - tr[1]) ** 2 + (rgb[2] - tr[2]) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = t;
    }
  }
  return nearest.color;
}

/** Map a saved glow-custom hex to the nearest palette color; never returns an out-of-palette value. */
export function migrateGlowCustom(saved: string | null | undefined): string {
  if (!saved) return ACCENT_THEMES[0].color;
  const inPalette = ACCENT_THEMES.some(
    (t) => t.color.toLowerCase() === saved.toLowerCase(),
  );
  if (inPalette) return saved;
  return _nearestPaletteColor(saved);
}

/* ---- hook ---- */

export function useTheme() {
  const [accent, setAccent] = useState<string>(() => {
    return localStorage.getItem("dashboard-accent") || DEFAULT_ACCENT;
  });

  const [bg, setBg] = useState<string>(() => {
    return localStorage.getItem("dashboard-bg") || DEFAULT_BG;
  });

  const [accentMode, setAccentMode] = useState<string>(() => {
    return migrateAccentMode(localStorage.getItem("dashboard-accent-mode"));
  });

  const [glow, setGlow] = useState<boolean>(() => {
    return localStorage.getItem("dashboard-glow") === "neon";
  });

  const [fxSpeed, setFxSpeed] = useState<number>(() => {
    return parseFloat(localStorage.getItem("dashboard-fx-speed") || "12");
  });

  const [fxSpread, setFxSpread] = useState<number>(() => {
    return parseFloat(localStorage.getItem("dashboard-fx-spread") || "34");
  });

  const [fxDepth, setFxDepth] = useState<number>(() => {
    return parseFloat(localStorage.getItem("dashboard-fx-depth") || "30");
  });

  const [glowIntensity, setGlowIntensity] = useState<number>(() => {
    return parseFloat(
      localStorage.getItem("dashboard-glow-intensity") || "1.4",
    );
  });

  const [pulse, setPulse] = useState<boolean>(() => {
    return localStorage.getItem("dashboard-pulse") === "on";
  });

  const [pulseSpeed, setPulseSpeed] = useState<number>(() => {
    return parseFloat(localStorage.getItem("dashboard-pulse-speed") || "4");
  });

  const [pulseIntensity, setPulseIntensity] = useState<number>(() => {
    return parseFloat(
      localStorage.getItem("dashboard-pulse-intensity") || "1.5",
    );
  });

  const [innerGlow, setInnerGlow] = useState<boolean>(() => {
    return localStorage.getItem("dashboard-inner-glow") === "on";
  });

  const [innerGlowIntensity, setInnerGlowIntensity] = useState<number>(() => {
    return parseFloat(
      localStorage.getItem("dashboard-inner-glow-intensity") || "1.4",
    );
  });

  const [gradientBorder, setGradientBorder] = useState<boolean>(() => {
    return localStorage.getItem("dashboard-gradient-border") === "on";
  });

  const [gradientBorderSpeed, setGradientBorderSpeed] = useState<number>(() => {
    return parseFloat(
      localStorage.getItem("dashboard-gradient-border-speed") || "3",
    );
  });

  const [cardGlow, setCardGlow] = useState<boolean>(() => {
    return localStorage.getItem("dashboard-card-glow") === "on";
  });

  const [glowColor, setGlowColor] = useState<"match" | "accent" | "custom">(
    () => {
      return (
        (localStorage.getItem("dashboard-glow-color") as
          "match" | "accent" | "custom") || "match"
      );
    },
  );

  const [glowCustom, setGlowCustom] = useState<string>(() => {
    return migrateGlowCustom(localStorage.getItem("dashboard-glow-custom"));
  });

  const [breathe, setBreathe] = useState<boolean>(() => {
    return localStorage.getItem("dashboard-breathe") === "on";
  });

  const [breatheSpeed, setBreatheSpeed] = useState<number>(() => {
    return parseFloat(localStorage.getItem("dashboard-breathe-speed") || "4");
  });

  const [breatheIntensity, setBreatheIntensity] = useState<number>(() => {
    return parseFloat(
      localStorage.getItem("dashboard-breathe-intensity") || "1",
    );
  });

  const [surge, setSurge] = useState<boolean>(() => {
    return localStorage.getItem("dashboard-surge") === "on";
  });

  const [surgePeriod, setSurgePeriod] = useState<number>(() => {
    return parseFloat(localStorage.getItem("dashboard-surge-period") || "6");
  });

  const [surgeIntensity, setSurgeIntensity] = useState<number>(() => {
    return parseFloat(localStorage.getItem("dashboard-surge-intensity") || "1");
  });

  const resetTheme = useCallback(() => {
    setAccent(DEFAULT_ACCENT);
    setBg(DEFAULT_BG);
    setAccentMode(DEFAULT_ACCENT_MODE);
    setGlow(false);
    setFxSpeed(12);
    setFxSpread(34);
    setFxDepth(30);
    setGlowIntensity(1.4);
    setPulse(false);
    setPulseSpeed(4);
    setPulseIntensity(1.5);
    setInnerGlow(false);
    setInnerGlowIntensity(1.4);
    setGradientBorder(false);
    setGradientBorderSpeed(3);
    setCardGlow(false);
    setGlowColor("match");
    setGlowCustom("#3b82f6");
    setBreathe(false);
    setBreatheSpeed(4);
    setBreatheIntensity(1);
    setSurge(false);
    setSurgePeriod(6);
    setSurgeIntensity(1);
  }, []);

  const hexColors = ACCENT_COLORS[accent] || ACCENT_COLORS.blue;
  // `current.color`/`current.glow` resolve through CSS variables (not literal hex) so that
  // every consumer — icons, text, gradients, anything passed `accent={current}` — automatically
  // reflects the active accent mode (e.g. animates with Rainbow Wave) with no per-component work.
  // `current.hex` retains the literal value for places that need to *display* the color (e.g. the
  // Theme Settings hex label) rather than render it.
  const current = {
    color: "var(--accent-primary)",
    glow: "var(--accent-glow)",
    hex: hexColors.color,
    hexGlow: hexColors.glow,
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    localStorage.setItem("dashboard-accent", accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute("data-bg", bg);
    localStorage.setItem("dashboard-bg", bg);
  }, [bg]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent-mode", accentMode);
    localStorage.setItem("dashboard-accent-mode", accentMode);
  }, [accentMode]);

  useEffect(() => {
    if (glow) {
      document.documentElement.setAttribute("data-glow", "neon");
    } else {
      document.documentElement.removeAttribute("data-glow");
    }
    localStorage.setItem("dashboard-glow", glow ? "neon" : "");
  }, [glow]);

  useEffect(() => {
    document.documentElement.style.setProperty("--fx-speed", `${fxSpeed}s`);
    localStorage.setItem("dashboard-fx-speed", String(fxSpeed));
  }, [fxSpeed]);

  useEffect(() => {
    document.documentElement.style.setProperty("--fx-spread", String(fxSpread));
    localStorage.setItem("dashboard-fx-spread", String(fxSpread));
  }, [fxSpread]);

  useEffect(() => {
    document.documentElement.style.setProperty("--fx-depth", String(fxDepth));
    localStorage.setItem("dashboard-fx-depth", String(fxDepth));
  }, [fxDepth]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--glow-intensity",
      String(glowIntensity),
    );
    localStorage.setItem("dashboard-glow-intensity", String(glowIntensity));
  }, [glowIntensity]);

  useEffect(() => {
    if (pulse) {
      document.documentElement.setAttribute("data-pulse", "on");
    } else {
      document.documentElement.removeAttribute("data-pulse");
    }
    localStorage.setItem("dashboard-pulse", pulse ? "on" : "");
  }, [pulse]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--pulse-speed",
      `${pulseSpeed}s`,
    );
    localStorage.setItem("dashboard-pulse-speed", String(pulseSpeed));
  }, [pulseSpeed]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--pulse-intensity",
      String(pulseIntensity),
    );
    localStorage.setItem("dashboard-pulse-intensity", String(pulseIntensity));
  }, [pulseIntensity]);

  useEffect(() => {
    if (innerGlow) {
      document.documentElement.setAttribute("data-inner-glow", "on");
    } else {
      document.documentElement.removeAttribute("data-inner-glow");
    }
    localStorage.setItem("dashboard-inner-glow", innerGlow ? "on" : "");
  }, [innerGlow]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--inner-glow-intensity",
      String(innerGlowIntensity),
    );
    localStorage.setItem(
      "dashboard-inner-glow-intensity",
      String(innerGlowIntensity),
    );
  }, [innerGlowIntensity]);

  useEffect(() => {
    if (gradientBorder) {
      document.documentElement.setAttribute("data-gradient-border", "on");
    } else {
      document.documentElement.removeAttribute("data-gradient-border");
    }
    localStorage.setItem(
      "dashboard-gradient-border",
      gradientBorder ? "on" : "",
    );
  }, [gradientBorder]);

  useEffect(() => {
    if (cardGlow) {
      document.documentElement.setAttribute("data-card-glow", "on");
    } else {
      document.documentElement.removeAttribute("data-card-glow");
    }
    localStorage.setItem("dashboard-card-glow", cardGlow ? "on" : "");
  }, [cardGlow]);

  useEffect(() => {
    document.documentElement.setAttribute("data-glow-color", glowColor);
    localStorage.setItem("dashboard-glow-color", glowColor);
  }, [glowColor]);

  useEffect(() => {
    document.documentElement.style.setProperty("--glow-custom", glowCustom);
    localStorage.setItem("dashboard-glow-custom", glowCustom);
  }, [glowCustom]);

  useEffect(() => {
    if (breathe) {
      document.documentElement.setAttribute("data-breathe", "on");
    } else {
      document.documentElement.removeAttribute("data-breathe");
    }
    localStorage.setItem("dashboard-breathe", breathe ? "on" : "");
  }, [breathe]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--gradient-border-speed",
      `${gradientBorderSpeed}s`,
    );
    localStorage.setItem(
      "dashboard-gradient-border-speed",
      String(gradientBorderSpeed),
    );
  }, [gradientBorderSpeed]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--breathe-speed",
      `${breatheSpeed}s`,
    );
    localStorage.setItem("dashboard-breathe-speed", String(breatheSpeed));
  }, [breatheSpeed]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--breathe-intensity",
      String(breatheIntensity),
    );
    localStorage.setItem(
      "dashboard-breathe-intensity",
      String(breatheIntensity),
    );
  }, [breatheIntensity]);

  useEffect(() => {
    if (surge) {
      document.documentElement.setAttribute("data-surge", "on");
    } else {
      document.documentElement.removeAttribute("data-surge");
    }
    localStorage.setItem("dashboard-surge", surge ? "on" : "");
  }, [surge]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--surge-period",
      `${surgePeriod}s`,
    );
    localStorage.setItem("dashboard-surge-period", String(surgePeriod));
  }, [surgePeriod]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--surge-intensity",
      String(surgeIntensity),
    );
    localStorage.setItem("dashboard-surge-intensity", String(surgeIntensity));
  }, [surgeIntensity]);

  return {
    accent,
    setAccent,
    bg,
    setBg,
    accentMode,
    setAccentMode,
    glow,
    setGlow,
    fxSpeed,
    setFxSpeed,
    fxSpread,
    setFxSpread,
    fxDepth,
    setFxDepth,
    glowIntensity,
    setGlowIntensity,
    pulse,
    setPulse,
    pulseSpeed,
    setPulseSpeed,
    pulseIntensity,
    setPulseIntensity,
    innerGlow,
    setInnerGlow,
    innerGlowIntensity,
    setInnerGlowIntensity,
    gradientBorder,
    setGradientBorder,
    gradientBorderSpeed,
    setGradientBorderSpeed,
    cardGlow,
    setCardGlow,
    glowColor,
    setGlowColor,
    glowCustom,
    setGlowCustom,
    breathe,
    setBreathe,
    breatheSpeed,
    setBreatheSpeed,
    breatheIntensity,
    setBreatheIntensity,
    surge,
    setSurge,
    surgePeriod,
    setSurgePeriod,
    surgeIntensity,
    setSurgeIntensity,
    resetTheme,
    current,
    presets: PRESETS,
    bgPresets: BG_PRESETS,
    accentThemes: ACCENT_THEMES,
    backgroundThemes: BACKGROUND_THEMES,
    accentModes: ACCENT_MODES,
    darken,
    lighten,
    hexToRgba,
  };
}

export {
  ACCENT_THEMES,
  BACKGROUND_THEMES,
  ACCENT_COLORS,
  PRESETS,
  BG_PRESETS,
  ACCENT_MODES,
  darken,
  lighten,
  hexToRgba,
};
