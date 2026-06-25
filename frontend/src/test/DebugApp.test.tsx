// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const mockFetch = (url: string) => {
  if (url.includes('/health')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
  if (url === '/api/metrics/cpu') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { model: 'AMD Ryzen 9 7950X', cores: [{ utilization_percent: 45, temperature_celsius: 62 }, { utilization_percent: 52, temperature_celsius: 63 }, { utilization_percent: 38, temperature_celsius: 61 }, { utilization_percent: 70, temperature_celsius: 65 }] } }) });
  if (url === '/api/metrics/memory') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { total_gb: 32, used_gb: 23.2, swap_total_gb: 4.0, swap_used_gb: 1.2, utilization_percent: 72.5 } }) });
  if (url === '/api/metrics/gpu') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ name: 'NVIDIA GeForce RTX 4090', utilization_percent: 65, temperature_celsius: 72, vram_used_gb: 8.5, vram_total_gb: 24, power_usage_watts: 250, power_limit_watts: 300, fan_speed_rpm: 1200, clock_speed_mhz: 2500, memory_clock_mhz: 1000 }] }) });
  if (url === '/api/metrics/storage/devices') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ device: '/dev/sda', io_stats: { reads: 150000, writes: 320000, read_sectors: 4800000, write_sectors: 10240000, read_bytes_per_sec: 524288, write_bytes_per_sec: 1048576, read_iops: 120, write_iops: 250 }, mounts: [{ device: '/dev/sda', mount_point: '/', filesystem: 'ext4', total_bytes: 536870912000, used_bytes: 375809638400, free_bytes: 161061273600, utilization_percent: 70.0 }], temperature_celsius: 42 }] }) });
  if (url === '/api/metrics/storage/history') return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
  if (url.includes('/ai')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
  console.log('UNMATCHED FETCH:', url);
  return Promise.resolve({ ok: false, status: 500 });
};

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn().mockImplementation(mockFetch);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Debug', () => {
  it('dump all text with all endpoints mocked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );
    
    await vi.advanceTimersByTimeAsync(800); // Clear loading timeout
    await vi.advanceTimersByTimeAsync(500); // Let queries resolve
    
    const allText = screen.getAllByText(/.*/).map(el => el.textContent?.trim()).filter(Boolean);
    console.log('All texts:', JSON.stringify(allText));
    
    expect(true).toBe(true);
  });
});
