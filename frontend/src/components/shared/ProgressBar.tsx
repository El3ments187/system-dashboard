import { getProgressGradient, getProgressState } from "../../utils/progress";

interface ProgressBarProps {
  percent: number;
  variant?: "default" | "compact";
  barClassName?: string;
}

export default function ProgressBar({
  percent,
  variant = "default",
  barClassName,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const state = getProgressState(clamped);
  const gradient = getProgressGradient(clamped);

  const containerClass =
    variant === "compact" ? "card-progress progress-compact" : "card-progress";
  const barClass = `card-progress-bar accent-fill progress-bar-${state}${barClassName ? ` ${barClassName}` : ""}`;

  const isGlowTarget = barClassName?.includes("accent-glow-target");

  return (
    <div className={containerClass}>
      <div
        className={barClass}
        data-state={state}
        style={{
          width: `${clamped}%`,
          background: gradient,
        }}
      >
        {isGlowTarget && <span className="bright-breathe" />}
        {isGlowTarget && <span className="bright-surge" />}
      </div>
    </div>
  );
}
