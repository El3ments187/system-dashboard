import { getProgressGradient, getProgressState } from "../../utils/progress";

interface ProgressBarProps {
  percent: number;
  variant?: "default" | "compact";
  barClassName?: string;
  glow?: boolean;
}

export default function ProgressBar({
  percent,
  variant = "default",
  barClassName,
  glow,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const state = getProgressState(clamped);
  const gradient = getProgressGradient(clamped);

  const containerClass =
    variant === "compact" ? "card-progress progress-compact" : "card-progress";
  const extraClass = barClassName ? ` ${barClassName}` : "";
  const explicit = barClassName?.includes("accent-glow-target") ?? false;
  const wantsGlow = (glow ?? true) && state === "normal";
  const isGlowTarget = explicit || wantsGlow;
  const glowClass = isGlowTarget && !explicit ? " accent-glow-target" : "";
  const barClass = `card-progress-bar accent-fill progress-bar-${state}${glowClass}${extraClass}`;

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
