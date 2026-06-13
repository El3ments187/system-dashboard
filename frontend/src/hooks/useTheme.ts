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
  { id: 'blue',     name: 'Blue',           color: '#3B82F6' },
  { id: 'cyan',     name: 'Cyan',           color: '#06B6D4' },
  { id: 'teal',     name: 'Teal',           color: '#14B8A6' },
  { id: 'green',    name: 'Green',          color: '#10B981' },
  { id: 'lime',     name: 'Lime',           color: '#84CC16' },
  { id: 'yellow',   name: 'Yellow',         color: '#F5C542' },
  { id: 'amber',    name: 'Amber',          color: '#F59E0B' },
  { id: 'orange',   name: 'Orange',         color: '#FB923C' },
  { id: 'red',      name: 'Red',            color: '#EF4444' },
  { id: 'rose',     name: 'Rose',           color: '#F43F5E' },
  { id: 'pink',     name: 'Pink',           color: '#EC4899' },
  { id: 'purple',   name: 'Purple',         color: '#8B5CF6' },
  { id: 'indigo',   name: 'Indigo',         color: '#6366F1' },
  { id: 'silver',   name: 'Silver',         color: '#E5E7EB' },
  { id: 'terminal', name: 'Terminal Green', color: '#00FF88' },
];

/* ---- background theme config ---- */

interface BackgroundTheme {
  id: string;
  name: string;
  background: string;
}

const BACKGROUND_THEMES: BackgroundTheme[] = [
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
  { id: 'carbon',  name: 'Carbon',     background: '#121212' },
  { id: 'light',   name: 'Light',      background: '#F8FAFC' },
  { id: 'paper',   name: 'Paper',      background: '#F9FAFB' },
  { id: 'nord-light', name: 'Nord Light', background: '#ECEFF4' },
  { id: 'cream',   name: 'Cream',      background: '#FFFDF5' },
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
