export function StatusIndicator({ status }: { status: string }) {
  let color: string;
  let bg: string;
  let label: string;
  switch (status) {
    case "running":
      color = "var(--success)";
      bg = "rgba(34,197,94,0.12)";
      label = "Running";
      break;
    case "starting":
      color = "var(--warning)";
      bg = "rgba(234,179,8,0.12)";
      label = "Starting";
      break;
    case "loading":
      color = "var(--accent-primary)";
      bg = "rgba(59,130,246,0.12)";
      label = "Loading";
      break;
    case "failed":
      color = "var(--danger)";
      bg = "rgba(239,68,68,0.12)";
      label = "Failed";
      break;
    default:
      color = "var(--text-muted)";
      bg = "rgba(255,255,255,0.06)";
      label = "Stopped";
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        color,
        whiteSpace: "nowrap",
        overflow: "hidden",
        background: bg,
        borderRadius: 6,
        padding: "2px 6px",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          animation:
            status === "running"
              ? "dot-pulse 1.8s ease-in-out infinite"
              : undefined,
        }}
      />
      {label}
    </span>
  );
}
