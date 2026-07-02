/**
 * Extract the most specific GGUF quant token from a model filename.
 * Matches mid-string; requires a delimiter (hyphen, underscore, dot, or start)
 * before the token so partial false positives like A3B or UD are rejected.
 * Returns the longest match, or empty string if none found.
 */
export function extractQuant(fileName: string): string {
  const re = /(?:^|[-_.])(B?F16|B?F32|I?Q\d(?:_[A-Z0-9]+)*)/gi;
  let best = "";
  let m;
  while ((m = re.exec(fileName)) !== null) {
    const tok = m[1];
    if (tok.length > best.length) best = tok;
  }
  return best;
}

const SPEC_LABELS: Record<string, string> = {
  draft: "Draft",
  "draft-mtp": "MTP",
  eagle: "EAGLE",
  eagle3: "EAGLE-3",
};

export function formatCtx(contextSize?: number | null): string {
  if (contextSize == null || contextSize <= 0) return "\u2014";
  return `${Math.round(contextSize / 1024)}K`;
}

export function formatGB(mb?: number | null): string {
  if (mb == null) return "\u2014";
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function formatTps(tps?: number | null): string {
  if (tps == null) return "\u2014";
  return `${Math.round(tps)}`;
}

export function specLabel(specType?: string | null): string {
  if (!specType) return "None";
  return SPEC_LABELS[specType] ?? "Other";
}

export function fmtUptime(sec: number | null | undefined): string {
  if (sec == null) return "\u2014";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export function fmtKb(kb: number | null | undefined): string {
  if (kb == null) return "\u2014";
  if (kb < 1024) return `${Math.round(kb)} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}

export function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return "\u2014";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function calcBuildsBehind(
  local?: string | null,
  latest?: string | null,
): number | null {
  if (!local || !latest) return null;
  const lm = local.match(/b?(\d+)/);
  const rm = latest.match(/b?(\d+)/);
  if (!lm || !rm) return null;
  const diff = parseInt(rm[1], 10) - parseInt(lm[1], 10);
  return diff > 0 ? diff : 0;
}
