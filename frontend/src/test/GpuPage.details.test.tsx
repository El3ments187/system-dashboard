import { screen } from '@testing-library/react';
import GpuPage from '../pages/GpuPage';
import { accent, renderGpuPage } from './fixtures/gpuPageFixtures';

describe('GpuPage - VRAM display', () => {
  it('displays VRAM in GB format when >= 1GB', () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText(/8\.5 GB \/ 24\.0 GB/)).toBeInTheDocument();
  });

  it('displays VRAM in MB format when < 1GB', () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [{ name: 'Test GPU', utilization_percent: 50, temperature_celsius: 60, vram_used_gb: 0.5, vram_total_gb: 0.75, power_usage_watts: 100, power_limit_watts: 200, fan_speed_rpm: 800 }],
    });
    expect(screen.getByText(/512 MB \/ 768 MB/)).toBeInTheDocument();
  });

  it('handles zero VRAM total gracefully', () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [{ name: 'Test GPU', utilization_percent: 50, temperature_celsius: 60, vram_used_gb: 4.0, vram_total_gb: 0, power_usage_watts: 100, power_limit_watts: 200, fan_speed_rpm: 800 }],
    });
    expect(screen.getByText('Test GPU')).toBeInTheDocument();
  });
});

describe('GpuPage - power display', () => {
  it('displays power usage with limit', () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getAllByText(/250W/).length).toBeGreaterThan(0);
  });

  it('handles missing power limit gracefully', () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [{ name: 'Test GPU', utilization_percent: 50, temperature_celsius: 60, vram_used_gb: 4.0, vram_total_gb: 8, power_usage_watts: 100, power_limit_watts: 0, fan_speed_rpm: 800 }],
    });
    expect(screen.getByText('Test GPU')).toBeInTheDocument();
  });
});

describe('GpuPage - fan speed display', () => {
  it('displays fan RPM when available', () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText(/1200 RPM/)).toBeInTheDocument();
  });

  it('shows dash when fan speed is zero', () => {
    renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [{ name: 'Test GPU', utilization_percent: 50, temperature_celsius: 60, vram_used_gb: 4.0, vram_total_gb: 8, power_usage_watts: 100, power_limit_watts: 200, fan_speed_rpm: 0 }],
    });
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });
});

describe('GpuPage - clock speed display', () => {
  it('displays clock speed when available', () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText(/2500 MHz/)).toBeInTheDocument();
  });

  it('hides clock speed when zero or null', () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [{ name: 'Test GPU', utilization_percent: 50, temperature_celsius: 60, vram_used_gb: 4.0, vram_total_gb: 8, power_usage_watts: 100, power_limit_watts: 200, fan_speed_rpm: 800, clock_speed_mhz: 0 }],
    });
    expect(container.querySelector('[style*="Clock"]')).not.toBeInTheDocument();
  });

  it('displays memory clock when available', () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText(/1000 MHz/)).toBeInTheDocument();
  });

  it('hides memory clock when zero or null', () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [{ name: 'Test GPU', utilization_percent: 50, temperature_celsius: 60, vram_used_gb: 4.0, vram_total_gb: 8, power_usage_watts: 100, power_limit_watts: 200, fan_speed_rpm: 800, memory_clock_mhz: 0 }],
    });
    expect(container.querySelector('[style*="MemClk"]')).not.toBeInTheDocument();
  });
});

describe('GpuPage - driver version display', () => {
  it('displays driver version when available', () => {
    renderGpuPage(<GpuPage accent={accent} />);
    expect(screen.getByText(/550\.0/)).toBeInTheDocument();
  });

  it('hides driver section when not provided', () => {
    const { container } = renderGpuPage(<GpuPage accent={accent} />, {
      gpuRawData: [{ name: 'Test GPU', utilization_percent: 50, temperature_celsius: 60, vram_used_gb: 4.0, vram_total_gb: 8, power_usage_watts: 100, power_limit_watts: 200, fan_speed_rpm: 800 }],
    });
    expect(container.querySelector('[style*="Driver"]')).not.toBeInTheDocument();
  });
});
