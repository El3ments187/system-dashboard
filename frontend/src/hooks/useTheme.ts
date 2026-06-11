import { useState, useEffect } from 'react';

const ACCENT_COLORS: Record<string, { color: string; glow: string }> = {
  blue:   { color: '#3b8aff', glow: 'rgba(59, 138, 255, 0.3)' },
  cyan:   { color: '#00e0ff', glow: 'rgba(0, 224, 255, 0.3)' },
  green:  { color: '#22c192', glow: 'rgba(34, 193, 146, 0.3)' },
  purple: { color: '#8b5aff', glow: 'rgba(139, 90, 255, 0.3)' },
  orange: { color: '#f59b1c', glow: 'rgba(245, 155, 28, 0.3)' },
  red:    { color: '#e84747', glow: 'rgba(232, 71, 71, 0.3)' },
};

const PRESETS = [
  { name: 'Blue',   value: 'blue',   color: '#3b8aff' },
  { name: 'Cyan',   value: 'cyan',   color: '#00e0ff' },
  { name: 'Green',  value: 'green',  color: '#22c192' },
  { name: 'Purple', value: 'purple', color: '#8b5aff' },
  { name: 'Orange', value: 'orange', color: '#f59b1c' },
  { name: 'Red',    value: 'red',    color: '#e84747' },
];

const BG_PRESETS = [
  { name: 'Dark',    value: 'dark',    color: '#0d1118' },
  { name: 'Midnight',value: 'midnight', color: '#080c14' },
  { name: 'Light',   value: 'light',   color: '#f4f6fa' },
  { name: 'Ocean',   value: 'ocean',   color: '#0a1420' },
  { name: 'Forest',  value: 'forest',  color: '#0d1610' },
];

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

  return { accent, setAccent, bg, setBg, current, presets: PRESETS, bgPresets: BG_PRESETS };
}
