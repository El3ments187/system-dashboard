import { useState, useEffect } from 'react';

/* ---- color utilities ---- */

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lighten(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.min(255, Math.floor(r + (255 - r) * amount));
  g = Math.min(255, Math.floor(g + (255 - g) * amount));
  b = Math.min(255, Math.floor(b + (255 - b) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/* ---- accent theme config ---- */

interface AccentTheme {
  id: string;
  name: string;
  color: string;
}

const ACCENT_THEMES: AccentTheme[] = [
  /* Blues */
  { id: 'blue',     name: 'Blue',           color: '#3B82F6' },
  { id: 'sky',      name: 'Sky',            color: '#60A5FA' },
  { id: 'ice',      name: 'Ice',            color: '#8FD8FF' },
  { id: 'sapphire', name: 'Sapphire',       color: '#0F52BA' },
  { id: 'cyber-blue', name: 'Cyber Blue',   color: '#00BFFF' },

  /* Cyans & Teals */
  { id: 'cyan',     name: 'Cyan',           color: '#06B6D4' },
  { id: 'aqua',     name: 'Aqua',           color: '#7FFFD4' },
  { id: 'teal',     name: 'Teal',           color: '#14B8A6' },
  { id: 'turquoise', name: 'Turquoise',     color: '#40E0D0' },

  /* Greens */
  { id: 'green',    name: 'Green',          color: '#22C55E' },
  { id: 'emerald',  name: 'Emerald',        color: '#50C878' },
  { id: 'mint',     name: 'Mint',           color: '#6EE7B7' },
  { id: 'terminal', name: 'Terminal Green', color: '#39FF14' },

  /* Yellows & Golds */
  { id: 'yellow',   name: 'Yellow',         color: '#FACC15' },
  { id: 'amber',    name: 'Amber',          color: '#F59E0B' },
  { id: 'gold',     name: 'Gold',           color: '#D4AF37' },
  { id: 'bronze',   name: 'Bronze',         color: '#CD7F32' },

  /* Oranges & Reds */
  { id: 'orange',   name: 'Orange',         color: '#F97316' },
  { id: 'coral',    name: 'Coral',          color: '#FF7F6A' },
  { id: 'red',      name: 'Red',            color: '#EF4444' },
  { id: 'crimson',  name: 'Crimson',        color: '#DC143C' },
  { id: 'ruby',     name: 'Ruby',           color: '#E0115F' },

  /* Pinks & Magentas */
  { id: 'rose',     name: 'Rose',           color: '#FB7185' },
  { id: 'pink',     name: 'Pink',           color: '#EC4899' },
  { id: 'magenta',  name: 'Magenta',        color: '#D946EF' },
  { id: 'orchid',   name: 'Orchid',         color: '#DA70D6' },

  /* Purples */
  { id: 'purple',   name: 'Purple',         color: '#8B5CF6' },
  { id: 'lavender', name: 'Lavender',       color: '#B497FF' },
  { id: 'indigo',   name: 'Indigo',         color: '#6366F1' },
  { id: 'violet',   name: 'Violet',         color: '#8A2BE2' },

  /* Neutrals & Metals */
  { id: 'silver',   name: 'Silver',         color: '#94A3B8' },
  { id: 'platinum', name: 'Platinum',       color: '#E5E4E2' },
  { id: 'copper',   name: 'Copper',         color: '#B87333' },
];

/* ---- background theme config ---- */

interface BackgroundTheme {
  id: string;
  name: string;
  background: string;
}

const BACKGROUND_THEMES: BackgroundTheme[] = [
  /* Dark backgrounds */
  { id: 'dark',    name: 'Dark',       background: '#0A0F1A' },
  { id: 'midnight', name: 'Midnight',  background: '#020617' },
  { id: 'ocean',   name: 'Ocean',      background: '#071422' },
  { id: 'forest',  name: 'Forest',     background: '#071A12' },
  { id: 'slate',   name: 'Slate',      background: '#0F172A' },
  { id: 'charcoal',name: 'Charcoal',   background: '#111827' },
  { id: 'graphite',name: 'Graphite',   background: '#1E293B' },
  { id: 'nord',    name: 'Nord',       background: '#2E3440' },
  { id: 'dracula', name: 'Dracula',    background: '#282A36' },
  { id: 'oled',    name: 'OLED Black', background: '#000000' },
  { id: 'obsidian',name: 'Obsidian',   background: '#0B0B0D' },
  { id: 'eclipse', name: 'Eclipse',    background: '#060B14' },
  { id: 'deep-space', name: 'Deep Space', background: '#0A0F1E' },
  { id: 'matrix',  name: 'Matrix',     background: '#07110A' },
  { id: 'storm',   name: 'Storm',      background: '#101725' },
  { id: 'midnight-purple', name: 'Midnight Purple', background: '#120E1C' },
  { id: 'arctic',  name: 'Arctic',     background: '#0D1726' },
  { id: 'carbon',  name: 'Carbon',     background: '#121212' },

  /* Light backgrounds */
  { id: 'light',   name: 'Light',      background: '#F8FAFC' },
  { id: 'paper',   name: 'Paper',      background: '#F5F6F8' },
  { id: 'nord-light', name: 'Nord Light', background: '#ECEFF4' },
  { id: 'cream',   name: 'Cream',      background: '#F7F4ED' },
];

/* ---- derived accent colors map ---- */

const ACCENT_COLORS: Record<string, { color: string; glow: string }> = Object.fromEntries(
  ACCENT_THEMES.map(t => [t.id, {
    color: t.color,
    glow: hexToRgba(t.color, 0.3),
  }])
);

/* ---- presets for ThemePanel rendering ---- */

const PRESETS = ACCENT_THEMES.map(t => ({
  name: t.name,
  value: t.id,
  color: t.color,
}));

const BG_PRESETS = BACKGROUND_THEMES.map(t => ({
  name: t.name,
  value: t.id,
  color: t.background,
}));

/* ---- hook ---- */

export function useTheme() {
  const [accent, setAccent] = useState<string>(() => {
    return localStorage.getItem('dashboard-accent') || 'blue';
  });

  const [bg, setBg] = useState<string>(() => {
    return localStorage.getItem('dashboard-bg') || 'dark';
  });

  const current = ACCENT_COLORS[accent] || ACCENT_COLORS.blue;

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('dashboard-accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bg', bg);
    localStorage.setItem('dashboard-bg', bg);
  }, [bg]);

  return {
    accent,
    setAccent,
    bg,
    setBg,
    current,
    presets: PRESETS,
    bgPresets: BG_PRESETS,
    accentThemes: ACCENT_THEMES,
    backgroundThemes: BACKGROUND_THEMES,
    darken,
    lighten,
    hexToRgba,
  };
}

export { ACCENT_THEMES, BACKGROUND_THEMES, ACCENT_COLORS, PRESETS, BG_PRESETS, darken, lighten, hexToRgba };
