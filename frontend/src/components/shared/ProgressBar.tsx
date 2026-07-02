import { getProgressGradient, getProgressState } from "../../utils/progress";

interface ProgressBarProps {
  percent: number;
  variant?: "default" | "compact";
}

export default function ProgressBar({
  percent,
  variant = "default",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const state = getProgressState(clamped);
  const gradient = getProgressGradient(clamped);

  const containerClass =
    variant === "compact" ? "card-progress progress-compact" : "card-progress";
  const barClass = `card-progress-bar progress-bar-${state}`;

  return (
    <div className={containerClass}>
      <div
        className={barClass}
        style={{
          width: `${clamped}%`,
          background: gradient,
        }}
      />
    </div>
  );
}
