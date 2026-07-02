export const mockCpuMetrics = {
  model: "AMD Ryzen 9 7950X",
  cores: Array.from({ length: 32 }, (_, i) => ({
    utilization_percent: 40 + (i % 5) * 5,
    temperature_celsius: 60 + (i % 3),
  })),
};

export const mockGpuMetrics = [
  {
    name: "NVIDIA GeForce RTX 4090",
    utilization_percent: 65,
    temperature_celsius: 72,
    vram_used_gb: 8.5,
    vram_total_gb: 24,
    power_usage_watts: 250,
    power_limit_watts: 300,
    fan_speed_rpm: 1200,
    clock_speed_mhz: 2500,
    memory_clock_mhz: 1000,
  },
];

export const mockMemoryMetrics = {
  total_gb: 32,
  used_gb: 23.2,
  swap_total_gb: 4.0,
  swap_used_gb: 1.2,
  utilization_percent: 72.5,
};

export const mockStorageDevices = [
  {
    device: "/dev/sda",
    io_stats: {
      reads: 150000,
      writes: 320000,
      read_sectors: 4800000,
      write_sectors: 10240000,
      read_bytes_per_sec: 524288,
      write_bytes_per_sec: 1048576,
      read_iops: 120,
      write_iops: 250,
    },
    mounts: [
      {
        device: "/dev/sda",
        mount_point: "/",
        filesystem: "ext4",
        total_bytes: 536870912000,
        used_bytes: 375809638400,
        free_bytes: 161061273600,
        utilization_percent: 70.0,
      },
    ],
    temperature_celsius: 42,
  },
];

export const mockSystemMetrics = {
  cpu_percent: 45,
  memory_percent: 72.5,
};
