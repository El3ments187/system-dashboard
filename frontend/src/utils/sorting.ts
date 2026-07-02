import { LaunchProfile, ProfileState } from "../types/metrics";

export type SortColumn =
  | "status"
  | "model"
  | "params"
  | "quant"
  | "ctx"
  | "vram"
  | "ram"
  | "spec"
  | "tps";
export type SortDirection = "asc" | "desc" | "none";

export interface SortConfig {
  column: SortColumn | null;
  direction: SortDirection;
}

const STATUS_PRIORITY: Record<string, number> = {
  running: 5,
  loading: 4,
  starting: 3,
  stopped: 2,
  failed: 1,
  unknown: 0,
};

const parseParams = (params?: string | null): number => {
  if (!params) return NaN;
  const match = params.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[0]) : NaN;
};

const isUnknown = (val: any): boolean => {
  return (
    val === undefined ||
    val === null ||
    val === "" ||
    val === "—" ||
    Number.isNaN(val)
  );
};

export function sortProfiles(
  profiles: LaunchProfile[],
  states: Record<string, ProfileState>,
  metadata: Record<string, any>,
  config: SortConfig,
): LaunchProfile[] {
  const { column, direction } = config;

  if (!column || direction === "none") {
    return profiles;
  }

  return [...profiles].sort((a, b) => {
    let valA: any;
    let valB: any;

    switch (column) {
      case "status":
        valA = STATUS_PRIORITY[states[a.script_path]?.status || "stopped"] ?? 0;
        valB = STATUS_PRIORITY[states[b.script_path]?.status || "stopped"] ?? 0;
        break;
      case "model":
        valA = (
          a.parsed_args?.model_path
            ?.split("/")
            .pop()
            ?.replace(/\.gguf$/i, "") ?? a.name
        ).toLowerCase();
        valB = (
          b.parsed_args?.model_path
            ?.split("/")
            .pop()
            ?.replace(/\.gguf$/i, "") ?? b.name
        ).toLowerCase();
        break;
      case "params":
        valA = parseParams(a.filename_meta?.params || "");
        valB = parseParams(b.filename_meta?.params || "");
        break;
      case "quant":
        valA = (a.filename_meta?.quant || "").toLowerCase();
        valB = (b.filename_meta?.quant || "").toLowerCase();
        break;
      case "ctx":
        valA = a.parsed_args?.context_size ?? NaN;
        valB = b.parsed_args?.context_size ?? NaN;
        break;
      case "vram":
        valA =
          states[a.script_path]?.peak_vram_mb ??
          metadata[a.script_path]?.peak_vram_mb;
        valB =
          states[b.script_path]?.peak_vram_mb ??
          metadata[b.script_path]?.peak_vram_mb;
        break;
      case "ram":
        valA =
          states[a.script_path]?.peak_ram_mb ??
          metadata[a.script_path]?.peak_ram_mb;
        valB =
          states[b.script_path]?.peak_ram_mb ??
          metadata[b.script_path]?.peak_ram_mb;
        break;
      case "spec":
        valA = (a.parsed_args?.spec_type || "None").toLowerCase();
        valB = (b.parsed_args?.spec_type || "None").toLowerCase();
        break;
      case "tps":
        const tpsA =
          states[a.script_path]?.current_tps ??
          metadata[a.script_path]?.avg_gen_tps;
        const tpsB =
          states[b.script_path]?.current_tps ??
          metadata[b.script_path]?.avg_gen_tps;
        valA = tpsA ?? NaN;
        valB = tpsB ?? NaN;
        break;
      default:
        return 0;
    }

    const aUnknown = isUnknown(valA);
    const bUnknown = isUnknown(valB);

    if (aUnknown && bUnknown) return 0;
    if (aUnknown) return 1; // Unknown always last
    if (bUnknown) return -1; // Unknown always last

    if (valA < valB) return direction === "asc" ? -1 : 1;
    if (valA > valB) return direction === "asc" ? 1 : -1;
    return 0;
  });
}
