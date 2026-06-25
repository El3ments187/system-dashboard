export const THEME_AWARE_COMPONENTS = [
  'GpuCard',
  'CpuCard',
  'MemoryCard',
  'StorageCard',
  'MetricChart',
  'ProgressBar',
  'StoragePerformanceCard',
  'StorageHistoryChart',
];

export const SEMANTIC_COLORS = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--success)',
};

export const PER_CORE_EXCEPTION = {
  component: 'CoreBars',
  description:
    'Per-core utilization bars must always use the full 32-color palette and never participate in theme modes.',
  colorCount: 32,
};

export function isThemeAware(componentName: string): boolean {
  return THEME_AWARE_COMPONENTS.some(name => componentName.includes(name));
}

export function isSemanticColor(value: string): boolean {
  return Object.values(SEMANTIC_COLORS).some(c => value.includes(c));
}
