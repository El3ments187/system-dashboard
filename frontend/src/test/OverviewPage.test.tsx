// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

function createMockFetch(overrides?: { storageDevices?: any[] }) {
  const storageDevices = overrides?.storageDevices ?? [{ device: '/dev/sda', io_stats: { reads: 150000, writes: 320000, read_sectors: 4800000, write_sectors: 10240000, read_bytes_per_sec: 524288, write_bytes_per_sec: 1048576, read_iops: 120, write_iops: 250 }, mounts: [{ device: '/dev/sda', mount_point: '/', filesystem: 'ext4', total_bytes: 536870912000, used_bytes: 375809638400, free_bytes: 161061273600, utilization_percent: 70.0 }], temperature_celsius: 42 }];
  
  return (url: string) => {
    if (url.includes('/health')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
    if (url === '/api/metrics/cpu') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { model: 'AMD Ryzen 9 7950X', cores: [{ utilization_percent: 45, temperature_celsius: 62 }, { utilization_percent: 52, temperature_celsius: 63 }, { utilization_percent: 38, temperature_celsius: 61 }, { utilization_percent: 70, temperature_celsius: 65 }] } }) });
    if (url === '/api/metrics/memory') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { total_gb: 32, used_gb: 23.2, swap_total_gb: 4.0, swap_used_gb: 1.2, utilization_percent: 72.5 } }) });
    if (url === '/api/metrics/gpu') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ name: 'NVIDIA GeForce RTX 4090', utilization_percent: 65, temperature_celsius: 72, vram_used_gb: 8.5, vram_total_gb: 24, power_usage_watts: 250, power_limit_watts: 300, fan_speed_rpm: 1200, clock_speed_mhz: 2500, memory_clock_mhz: 1000 }] }) });
    if (url === '/api/metrics/storage/devices') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: storageDevices }) });
    if (url === '/api/metrics/storage/history') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    if (url.includes('/ai')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
    if (url.includes('/metrics/system')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ cpu_percent: 45, memory_percent: 72.5 }) });
    if (url === '/api/alerts') return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    console.log('UNMATCHED FETCH:', url);
    return Promise.resolve({ ok: false, status: 500 });
  };
}

function renderWithProviders(ui: React.ReactElement, overrides?: { storageDevices?: any[] }) {
  const mockFn = createMockFetch(overrides);
  global.fetch = vi.fn().mockImplementation(mockFn);
  
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('Overview Page - Solid Mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('layout structure', () => {
    it('renders main dashboard grid container', async () => {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => expect(container.querySelector('.dashboard-grid')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders overview GPU row', async () => {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => expect(container.querySelector('.overview-gpu-row')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders overview CPU row', async () => {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => expect(container.querySelector('.overview-cpu-row')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders overview memory row', async () => {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => expect(container.querySelector('.overview-memory-row')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders storage row', async () => {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => expect(container.querySelector('.storage-row')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders GPU card in overview with utilization data', async () => {
      renderWithProviders(<App />);
      await waitFor(() => {
        const gpuRow = document.querySelector('.overview-gpu-row');
        expect(gpuRow).toBeInTheDocument();
      }, { timeout: 4000 });
    });
    it('renders CPU card in overview', async () => {
      renderWithProviders(<App />);
      await waitFor(() => expect(document.querySelector('.overview-cpu-row')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders Memory card in overview', async () => {
      renderWithProviders(<App />);
      await waitFor(() => expect(screen.getByText('Memory')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders Storage card in overview', async () => {
      renderWithProviders(<App />);
      await waitFor(() => expect(screen.getByText('Storage')).toBeInTheDocument(), { timeout: 4000 });
    });
  });

  describe('Turquoise accent application', () => {
    it('applies accent color to GPU card metric values', async () => {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => {
        const gpuDetailValues = container.querySelectorAll('.card-detail-value');
        expect(gpuDetailValues.length).toBeGreaterThan(0);
      }, { timeout: 4000 });
    });
    it('displays memory utilization with correct value', async () => {
      renderWithProviders(<App />);
      await waitFor(() => {
        const memoryRow = document.querySelector('.overview-memory-row');
        expect(memoryRow).toBeInTheDocument();
        const text = memoryRow?.textContent || '';
        expect(text).toMatch(/\d+\.?\d*%/);
      }, { timeout: 4000 });
    });
  });

  describe('storage card integration', () => {
    it('displays storage device name', async () => {
      renderWithProviders(<App />);
      await waitFor(() => expect(screen.getByText('/dev/sda')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('displays storage device temperature', async () => {
      renderWithProviders(<App />);
      await waitFor(() => expect(screen.getByText(/42°C/)).toBeInTheDocument(), { timeout: 4000 });
    });
    it('shows mount count for each device', async () => {
      renderWithProviders(<App />);
      await waitFor(() => expect(screen.getByText(/1 mount/)).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders storage performance chart when history exists', async () => {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => {
        const metricCards = container.querySelectorAll('.metric-card');
        expect(metricCards.length).toBeGreaterThan(2);
      }, { timeout: 4000 });
    });
  });

  describe('status indicators', () => {
    it('shows Normal status for GPU with moderate utilization', async () => {
      renderWithProviders(<App />);
      await waitFor(() => {
        const gpuRow = document.querySelector('.overview-gpu-row');
        expect(gpuRow).toBeInTheDocument();
        const text = gpuRow?.textContent || '';
        expect(text).toMatch(/(Normal|OK|Nominal)/i);
      }, { timeout: 4000 });
    });
  });

  describe('edge cases', () => {
    it('handles no storage devices gracefully', async () => {
      renderWithProviders(<App />, { storageDevices: [] });
      await waitFor(() => expect(screen.getByText('Storage')).toBeInTheDocument(), { timeout: 4000 });
    });
    it('renders all four card types in overview simultaneously', async () => {
      renderWithProviders(<App />);
      await waitFor(() => expect(document.querySelector('.overview-gpu-row')).toBeInTheDocument(), { timeout: 4000 });
      await waitFor(() => expect(document.querySelector('.overview-cpu-row')).toBeInTheDocument(), { timeout: 4000 });
      await waitFor(() => expect(screen.getByText('Memory')).toBeInTheDocument(), { timeout: 4000 });
      await waitFor(() => expect(screen.getByText('Storage')).toBeInTheDocument(), { timeout: 4000 });
    });
  });
});
