import { getAccentMode } from '../utils/accentColors';

export const WARNING_THRESHOLD = 70;
export const CRITICAL_THRESHOLD = 90;

// CPU/GPU temperatures run on a different scale than utilization percentages,
// so they get their own thresholds rather than reusing WARNING/CRITICAL_THRESHOLD.
export const TEMP_WARNING_THRESHOLD = 80;
export const TEMP_CRITICAL_THRESHOLD = 90;

// Storage device temperatures run cooler than CPU/GPU dies, hence separate thresholds.
export const STORAGE_TEMP_WARNING_THRESHOLD = 50;
export const STORAGE_TEMP_CRITICAL_THRESHOLD = 65;

export type ProgressState = 'normal' | 'warning' | 'critical';

const STATE_RANK: Record<ProgressState, number> = { normal: 0, warning: 1, critical: 2 };

export function worseState(a: ProgressState, b: ProgressState): ProgressState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

export function getStateColor(state: ProgressState): string {
  switch (state) {
    case 'critical':
      return 'var(--danger)';
    case 'warning':
      return 'var(--warning)';
    default:
      return 'var(--success)';
  }
}

export function getStateLabel(state: ProgressState): string {
  switch (state) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    default:
      return 'Normal';
  }
}

export function getProgressState(percent: number): ProgressState {
  if (percent >= CRITICAL_THRESHOLD) return 'critical';
  if (percent >= WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

export function getProgressColor(percent: number): string {
  return getStateColor(getProgressState(percent));
}

export function getTempState(temp: number): ProgressState {
  if (temp >= TEMP_CRITICAL_THRESHOLD) return 'critical';
  if (temp >= TEMP_WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

export function getTempColor(temp: number): string {
  return getStateColor(getTempState(temp));
}

export function getStorageTempState(temp: number): ProgressState {
  if (temp >= STORAGE_TEMP_CRITICAL_THRESHOLD) return 'critical';
  if (temp >= STORAGE_TEMP_WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

export function getStorageTempColor(temp: number): string {
  return getStateColor(getStorageTempState(temp));
}

export function getProgressGradient(percent: number): string {
  const state = getProgressState(percent);
  const mode = getAccentMode();
  const isAnimated = mode === 'animated-gradient' || mode === 'rainbow-wave';
  const colorVar = state === 'critical' ? 'var(--danger)' : state === 'warning' ? 'var(--warning)' : 'var(--accent-primary)';

  if (isAnimated) {
    return `linear-gradient(90deg, ${colorVar}, color-mix(in srgb, ${colorVar} 70%, white))`;
  }

  return colorVar;
}
