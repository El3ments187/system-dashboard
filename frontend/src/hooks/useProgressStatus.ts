import {
  getProgressState,
  getProgressColor,
  getStateLabel,
} from "../utils/progress";

export function useProgressStatus(percent: number | null | undefined) {
  const state = percent != null ? getProgressState(percent) : "normal";
  const color = percent != null ? getProgressColor(percent) : "var(--success)";
  const label = getStateLabel(state);

  return { state, color, label };
}
