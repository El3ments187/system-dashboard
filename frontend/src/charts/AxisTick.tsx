/**
 * Custom axis tick label. recharts' default tick renders through <Text>, which
 * keys each <tspan> by its text content (`${words}-${index}` in
 * recharts/component/Text.js). A live-updating clock label therefore changes
 * the key every poll, so React unmounts + detaches the old <tspan> and mounts
 * a new one each render — the Overview renderer's multi-GB leak. A plain
 * <text> with a direct string child is reconciled in place (React updates the
 * text node's value; nothing detaches). Labels are unchanged.
 *
 * recharts calls a function-type `tick` directly with the computed tick props,
 * so this is a pure render helper — it must not use hooks.
 */
function baselineFor(
  verticalAnchor: string | undefined,
): "central" | "auto" | "hanging" {
  if (verticalAnchor === "middle") return "central";
  if (verticalAnchor === "end") return "auto";
  return "hanging";
}

export function AxisTick(props: any) {
  const { x, y, payload, textAnchor, verticalAnchor, tickFormatter, index } =
    props;
  const raw = payload?.value ?? "";
  const label =
    typeof tickFormatter === "function"
      ? String(tickFormatter(raw, index ?? 0) ?? "")
      : String(raw);
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline={baselineFor(verticalAnchor)}
      fill="var(--text-muted)"
      fontSize={10}
      className="recharts-cartesian-axis-tick-value"
    >
      {label}
    </text>
  );
}
