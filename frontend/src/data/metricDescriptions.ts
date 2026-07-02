export interface MetricDescription {
  title: string;
  description: string;
  unit?: string;
  direction?: "higher-is-better" | "lower-is-better" | "neutral";
}

export const metricDescriptions: Record<string, MetricDescription> = {
  // CPU metrics
  cpu_utilization: {
    title: "CPU Utilization",
    description: "Percentage of CPU capacity currently in use across all cores",
    unit: "%",
    direction: "lower-is-better",
  },
  cpu_temperature: {
    title: "CPU Temperature",
    description:
      "Current CPU core temperature. Higher values indicate more thermal load",
    unit: "°C",
    direction: "lower-is-better",
  },
  cpu_frequency: {
    title: "CPU Frequency",
    description: "Current clock speed of the CPU cores",
    unit: "MHz",
    direction: "higher-is-better",
  },
  cpu_cores: {
    title: "Physical Cores",
    description: "Number of physical CPU cores available",
    direction: "neutral",
  },
  cpu_threads: {
    title: "Logical Threads",
    description: "Number of logical threads (physical cores × hyperthreading)",
    direction: "neutral",
  },
  cpu_load_1m: {
    title: "Load Average (1 min)",
    description:
      "Average system load over the last 1 minute. Compare against core count for context",
    unit: "",
    direction: "lower-is-better",
  },
  cpu_load_5m: {
    title: "Load Average (5 min)",
    description: "Average system load over the last 5 minutes",
    unit: "",
    direction: "lower-is-better",
  },
  cpu_load_15m: {
    title: "Load Average (15 min)",
    description: "Average system load over the last 15 minutes",
    unit: "",
    direction: "lower-is-better",
  },

  // Memory metrics
  memory_utilization: {
    title: "Memory Utilization",
    description: "Percentage of RAM currently in use",
    unit: "%",
    direction: "lower-is-better",
  },
  memory_used_gb: {
    title: "RAM Used",
    description: "Amount of physical memory currently allocated",
    unit: "GB",
    direction: "neutral",
  },
  memory_total_gb: {
    title: "Total RAM",
    description: "Total installed physical memory",
    unit: "GB",
    direction: "neutral",
  },
  swap_used_gb: {
    title: "Swap Used",
    description:
      "Amount of disk-based swap space currently in use. High values may indicate memory pressure",
    unit: "GB",
    direction: "lower-is-better",
  },
  swap_total_gb: {
    title: "Total Swap",
    description: "Total configured swap space on disk",
    unit: "GB",
    direction: "neutral",
  },
  swap_utilization: {
    title: "Swap Utilization",
    description: "Percentage of total swap space currently in use",
    unit: "%",
    direction: "lower-is-better",
  },

  // GPU metrics
  gpu_utilization: {
    title: "GPU Utilization",
    description: "Percentage of GPU compute capacity currently in use",
    unit: "%",
    direction: "neutral",
  },
  gpu_temperature: {
    title: "GPU Temperature",
    description:
      "Current GPU core temperature. Higher values indicate more thermal load",
    unit: "°C",
    direction: "lower-is-better",
  },
  gpu_vram_used_gb: {
    title: "VRAM Used",
    description: "Amount of GPU video memory currently allocated",
    unit: "GB",
    direction: "neutral",
  },
  gpu_vram_total_gb: {
    title: "Total VRAM",
    description: "Total installed GPU video memory",
    unit: "GB",
    direction: "neutral",
  },
  gpu_power_draw: {
    title: "Power Draw",
    description: "Current GPU power consumption in watts",
    unit: "W",
    direction: "neutral",
  },
  gpu_power_limit: {
    title: "Power Limit",
    description: "Maximum power limit configured for the GPU",
    unit: "W",
    direction: "neutral",
  },

  // Storage metrics
  storage_utilization: {
    title: "Storage Utilization",
    description: "Overall disk space utilization across all mounts and devices",
    unit: "%",
    direction: "lower-is-better",
  },
  storage_read_throughput: {
    title: "Read Throughput",
    description: "Current data read rate from storage device",
    unit: "B/s",
    direction: "neutral",
  },
  storage_write_throughput: {
    title: "Write Throughput",
    description: "Current data write rate to storage device",
    unit: "B/s",
    direction: "neutral",
  },
  storage_read_iops: {
    title: "Read IOPS",
    description: "Input/Output Operations Per Second for read operations",
    unit: "IOPS",
    direction: "neutral",
  },
  storage_write_iops: {
    title: "Write IOPS",
    description: "Input/Output Operations Per Second for write operations",
    unit: "IOPS",
    direction: "neutral",
  },
};

export function getMetricDescription(
  key: string,
): MetricDescription | undefined {
  return metricDescriptions[key];
}
