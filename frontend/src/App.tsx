import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "./components/Header";
import ThemePanel from "./components/ThemePanel";
import CpuCard from "./components/cards/CpuCard";
import MemoryCard from "./components/cards/MemoryCard";
import GpuCard from "./components/cards/GpuCard";
import CpuChart from "./charts/CpuChart";
import MemoryChart from "./charts/MemoryChart";

import GpuChart from "./charts/GpuChart";
import StorageCard from "./components/cards/StorageCard";
import StoragePerformanceCard from "./components/cards/StoragePerformanceCard";
import { MetricsProvider } from "./context/MetricsContext";
import { LiveDataControlsProvider } from "./context/LiveDataControlsContext";
import { AlertsProvider } from "./context/AlertsContext";
import { TooltipProvider } from "./components/common/TooltipProvider";
import { useTheme } from "./hooks/useTheme";
import "./styles/theme.css";
import { checkHealth } from "./services/api";
import GpuPage from "./pages/GpuPage";
import CpuPage from "./pages/CpuPage";
import LlamaCppPage from "./pages/LlamaCppPage";
import AiPage from "./pages/AiPage";
import AiTerminalViewer from "./pages/AiTerminalViewer";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const {
    accent,
    setAccent,
    bg,
    setBg,
    accentMode,
    setAccentMode,
    resetTheme,
    current,
  } = useTheme();
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<
    "overview" | "gpu" | "cpu" | "llama-cpp" | "ai" | "terminal" | "settings"
  >(() => {
    if (window.location.pathname === "/gpu") return "gpu";
    if (window.location.pathname === "/cpu") return "cpu";
    if (window.location.pathname === "/llama-cpp") return "llama-cpp";
    if (window.location.pathname === "/ai/terminal") return "terminal";
    if (window.location.pathname === "/ai") return "ai";
    if (window.location.pathname === "/settings") return "settings";
    return "overview";
  });

  const { data: healthOk } = useQuery<boolean>({
    queryKey: ["health"],
    queryFn: checkHealth,
    refetchInterval: 10000,
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Sync URL with active page (preserve query params for terminal to keep pts param)
  useEffect(() => {
    const path =
      activePage === "overview"
        ? "/"
        : activePage === "terminal"
          ? "/ai/terminal"
          : activePage === "llama-cpp"
            ? "/llama-cpp"
            : `/${activePage}`;
    const search = activePage === "terminal" ? window.location.search : "";
    window.history.pushState({ page: activePage }, "", path + search);
  }, [activePage]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => {
      if (window.location.pathname === "/gpu") {
        setActivePage("gpu");
      } else if (window.location.pathname === "/cpu") {
        setActivePage("cpu");
      } else if (window.location.pathname === "/llama-cpp") {
        setActivePage("llama-cpp");
      } else if (window.location.pathname === "/ai/terminal") {
        setActivePage("terminal");
      } else if (window.location.pathname === "/ai") {
        setActivePage("ai");
      } else if (window.location.pathname === "/settings") {
        setActivePage("settings");
      } else {
        setActivePage("overview");
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  if (loading) {
    return (
      <div
        className="loading-screen"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="loading-spinner" />
        <p
          style={{
            color: "var(--text-secondary)",
            marginTop: "24px",
            fontSize: "14px",
          }}
        >
          Initializing dashboard...
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <LiveDataControlsProvider>
        <AlertsProvider>
          <MetricsProvider>
            <div className="app-root">
              <Header
                accent={current}
                showThemePanel={showThemePanel}
                onToggleThemePanel={() => setShowThemePanel(!showThemePanel)}
                healthOk={healthOk}
                activePage={activePage}
                onPageChange={setActivePage}
              />
              <ThemePanel
                open={showThemePanel}
                onClose={() => setShowThemePanel(false)}
                accent={accent}
                onAccentChange={setAccent}
                accentMode={accentMode}
                onAccentModeChange={setAccentMode}
                bg={bg}
                onBgChange={setBg}
                current={current}
                onReset={resetTheme}
              />
              {activePage === "terminal" ? (
                <AiTerminalViewer />
              ) : activePage === "overview" ? (
                <main className="dashboard-grid">
                  <div className="dashboard-row overview-gpu-row">
                    <GpuCard accent={current} />
                    <GpuChart accent={current} />
                  </div>
                  <div className="dashboard-row overview-cpu-row">
                    <CpuCard accent={current} />
                    <CpuChart accent={current} />
                  </div>
                  <div className="dashboard-row overview-memory-row">
                    <MemoryCard accent={current} />
                    <MemoryChart accent={current} />
                  </div>
                  <div className="dashboard-row storage-row">
                    <StorageCard accent={current} />
                    <StoragePerformanceCard />
                  </div>
                </main>
              ) : activePage === "gpu" ? (
                <GpuPage accent={current} />
              ) : activePage === "cpu" ? (
                <CpuPage accent={current} />
              ) : activePage === "llama-cpp" ? (
                <LlamaCppPage />
              ) : activePage === "settings" ? (
                <SettingsPage accent={current} />
              ) : activePage === "ai" ? (
                <AiPage />
              ) : null}
            </div>
          </MetricsProvider>
        </AlertsProvider>
      </LiveDataControlsProvider>
    </TooltipProvider>
  );
}
