# System Monitoring Dashboard

A real-time system monitoring dashboard for Linux with NVIDIA GPU support. Built with Rust + Axum backend and React + TypeScript frontend.

## Features

- **Real-time CPU monitoring** — utilization, temperature, frequency, core count
- **Memory monitoring** — RAM and swap usage with utilization percentage
- **NVIDIA GPU monitoring** — utilization, temperature, VRAM, power draw via NVML with nvidia-smi fallback
- **Storage monitoring** — all mounted filesystems with usage bars
- **Dark theme with 6 accent colors** — Blue, Cyan, Green, Purple, Orange, Red
- **60-second rolling history charts** — smooth animated Recharts visualizations
- **Responsive layout** — works on desktop to ultrawide monitors (up to 5K+)
- **Persistent preferences** — theme accent color saved in localStorage

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Vite)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │  CPU Card │ │ Memory  │ │  GPU    │ │Storage │ │
│  │  Chart   │ │  Chart  │ │  Chart  │ │        │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  ┌──────────────────────────────────────────────┐   │
│  │          Theme Panel + Header                  │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│                    Backend (Axum)                    │
│  GET /api/health           — Health check           │
│  GET /api/metrics/cpu      — CPU metrics            │
│  GET /api/metrics/memory   — Memory metrics         │
│  GET /api/metrics/gpu      — GPU metrics            │
│  GET /api/metrics/disk     — Disk metrics           │
│  GET /api/metrics/system   — System info            │
├─────────────────────────────────────────────────────┤
│                 System Collectors                    │
│  sysinfo   — CPU, memory, disk stats               │
│  nvml-wrapper — NVIDIA GPU stats (primary)         │
│  nvidia-smi — GPU stats (fallback)                 │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

### Linux Mint Dependencies

```bash
sudo apt update
sudo apt install -y libudev-dev libsystemd-dev libprocps-dev pkg-config
```

### NVIDIA GPU Requirements

- NVIDIA proprietary driver >= 550 recommended
- Verify GPU access: `nvidia-smi`
- If `nvidia-smi` fails, install: `sudo apt install nvidia-utils`

### Rust

```bash
curl --proto '=https' --tlsversion 1.2 -sSf https://sh.rustup.rs | sh
source ~/.profile
rustup install stable
cargo --version
```

### Node.js

```bash
curl -fsSL https://fnm.vercel.app/install.sh | sh
fnm install --lts
fnm use --lts
node --version
npm --version
```

## Setup & Run

### Backend

```bash
cd backend
cargo build
cargo run
```

The API server starts on **http://localhost:3001** with these endpoints:

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/metrics/cpu` | CPU utilization, temperature, frequency |
| `GET /api/metrics/memory` | RAM and swap usage |
| `GET /api/metrics/gpu` | GPU utilization, temperature, VRAM |
| `GET /api/metrics/disk` | All mounted filesystems |
| `GET /api/metrics/system` | Hostname, uptime, kernel info |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server starts on **http://localhost:5173**. API calls are proxied to the backend.

### Production Build

```bash
# Backend
cd backend
cargo build --release

# Frontend
cd frontend
npm run build
# Output in dist/ — serve with nginx, caddy, or any static server
```

## NVIDIA GPU Troubleshooting

### GPU metrics show zeros or "No GPU detected"

1. **Verify nvidia-smi works:**
   ```bash
   nvidia-smi
   nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv
   ```

2. **Check driver:**
   ```bash
   nvidia-smi --query-driver=installed,runtime
   ```

3. **Install nvidia-utils if missing:**
   ```bash
   sudo apt install nvidia-utils
   ```

4. **Ensure user has access to /dev/nvidiactl:**
   ```bash
   ls -la /dev/nvidiactl
   sudo usermod -aG video $USER
   ```

5. **If nvml-wrapper is unavailable**, the app automatically falls back to `nvidia-smi` parsing. Check logs:
   ```bash
   cargo run 2>&1 | grep -i gpu
   ```

### NVML library not found at runtime

```bash
ldconfig -p | grep nvidia
sudo ldconfig /usr/lib/nvidia
sudo ldconfig -p
```

### Driver version too old

- nvml-wrapper requires driver >= 550
- Update: `sudo apt install nvidia-driver-550`
- Reboot after driver update

### No GPU detected at all

- Verify GPU is detected: `lspci | grep -i nvidia`
- Check kernel module: `lsmod | grep -i nvidia`
- Load module: `sudo modprobe nvidia`

## Deployment (Local Network)

### Backend

```bash
# Bind to all interfaces for network access
AXUM_HOST=0.0.0.0 AXUM_PORT=3001 cargo run --release
```

### Frontend

```bash
npm run build

# Serve with nginx
sudo apt install nginx
# Copy dist/ to /var/www/dashboard/
# Configure nginx to proxy /api to backend
```

### nginx config example

```nginx
server {
  listen 80;
  server_name dashboard.local;

  root /var/www/dashboard;

  # Serve frontend
  location / {
    try_files $uri /index.html;
  }

  # Proxy API to backend
  location /api {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
  }
}
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Rust, Axum, sysinfo |
| GPU | nvml-wrapper (primary), nvidia-smi (fallback) |
| Frontend | React 19, TypeScript, Vite 6 |
| Charts | Recharts 3 |
| Styling | CSS Variables (custom properties) |
| State | React hooks (useState, useEffect, useCallback) |

## File Structure

```
system-dashboard/
├── backend/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs              — Entry point, server config
│       ├── error.rs             — Custom error types
│       ├── models/
│       │   └── metrics.rs       — API response types
│       ├── collectors/
│       │   ├── cpu.rs           — CPU metrics (sysinfo)
│       │   ├── memory.rs        — Memory metrics (sysinfo)
│       │   ├── gpu.rs           — GPU metrics (NVML + fallback)
│       │   ├── disk.rs          — Disk metrics (sysinfo)
│       │   └── system.rs        — Hostname, uptime
│       └── api/
│           └── routes.rs        — API routes & handlers
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx             — Root mount
│       ├── App.tsx              — Layout + theme provider
│       ├── styles/
│       │   ├── variables.css    — CSS custom properties
│       │   ├── global.css       — Reset + base styles
│       │   └── theme.css        — Theme overrides
│       ├── hooks/
│       │   ├── useMetrics.ts    — Polling + rolling history
│       │   └── useTheme.ts      — Theme state + localStorage
│       ├── services/
│       │   └── api.ts           — Fetch API client
│       ├── components/
│       │   ├── Header.tsx       — Dashboard header
│       │   ├── ThemePanel.tsx   — Accent color picker
│       │   └── cards/
│       │       ├── CpuCard.tsx
│       │       ├── MemoryCard.tsx
│       │       ├── GpuCard.tsx
│       │       └── StorageCard.tsx
│       └── charts/
│           ├── MetricChart.tsx  — Recharts wrapper
│           ├── CpuChart.tsx
│           ├── MemoryChart.tsx
│           └── GpuChart.tsx
└── README.md
```

## Design Decisions

1. **nvml-wrapper with fallback** — Prefers direct NVML API access for GPU metrics, but falls back to `nvidia-smi` parsing to avoid blocking progress if the crate is unavailable.

2. **CSS Variables for theming** — All accent colors flow from `--accent-primary`, `--accent-secondary`, and `--accent-glow` custom properties, making theme changes trivial.

3. **Rolling 60-second history** — The `useMetrics` hook maintains a sliding window of 120 data points (60s at 1s polling), providing smooth chart updates without memory bloat.

4. **Graceful GPU degradation** — GPU errors return zeroed metrics rather than crashing the server, ensuring the dashboard remains functional even without NVIDIA hardware.

5. **Ultrawide responsive grid** — The dashboard grid adapts from 1-column (mobile) to 2-column (desktop) to 4-6 column (ultrawide/3840px+) layouts.

## VS Code Tasks

This project includes VS Code tasks in `.vscode/tasks.json`. Launch via:

1. **Ctrl+Shift+P → Tasks: Run Task**
2. Select one of the following:

| Task | Description |
|---|---|
| **Start Dashboard** | Runs both Frontend and Backend dev servers simultaneously |
| **Frontend: Dev Server** | Starts the Vite dev server on port 5173 |
| **Backend: Rust Server** | Runs `cargo run` on the Axum API server on port 3001 |
| **Stop Dashboard** | Reminder to terminate running tasks |

### Stopping Services

To stop any running task:

1. **Ctrl+Shift+P → Tasks: Show Running Tasks**
2. Select the task and choose **Terminate Task**

Alternatively, use the **Terminal** panel where each task is displayed — click the trash icon next to the task output.

## License

MIT
