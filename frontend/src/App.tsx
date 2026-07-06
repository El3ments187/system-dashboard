import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "./components/Header";
import { MetricsProvider } from "./context/MetricsContext";
import { LiveDataControlsProvider } from "./context/LiveDataControlsContext";
import { AlertsProvider } from "./context/AlertsContext";
import { TooltipProvider } from "./components/common/TooltipProvider";
import { useTheme } from "./hooks/useTheme";
import { useAccentIndexer } from "./utils/accentColors";
import "./styles/theme.css";
import { checkHealth } from "./services/api";
import GpuPage from "./pages/GpuPage";
import CpuPage from "./pages/CpuPage";
import LlamaCppPage from "./pages/LlamaCppPage";
import AiPage from "./pages/AiPage";
import LlamaCppTerminalViewer from "./pages/LlamaCppTerminalViewer";
import SettingsPage from "./pages/SettingsPage";
import OverviewPage from "./pages/OverviewPage";
import ThemePage from "./pages/ThemePage";

type ActivePage =
  | "overview"
  | "gpu"
  | "cpu"
  | "llama-cpp"
  | "ai"
  | "terminal"
  | "settings"
  | "theme";

function getPageFromPathname(pathname: string): ActivePage {
  if (pathname === "/gpu") return "gpu";
  if (pathname === "/cpu") return "cpu";
  if (pathname === "/llama-cpp") return "llama-cpp";
  if (pathname === "/llama-cpp/terminal") return "terminal";
  if (pathname === "/ai") return "ai";
  if (pathname === "/settings") return "settings";
  if (pathname === "/theme") return "theme";
  return "overview";
}

function getPathForPage(page: ActivePage): string {
  if (page === "overview") return "/";
  if (page === "terminal") return "/llama-cpp/terminal";
  if (page === "llama-cpp") return "/llama-cpp";
  return `/${page}`;
}

function PageContent({
  activePage,
  accent,
}: {
  activePage: ActivePage;
  accent: { color: string; glow: string };
}) {
  if (activePage === "terminal") return <LlamaCppTerminalViewer />;
  if (activePage === "gpu") return <GpuPage accent={accent} />;
  if (activePage === "cpu") return <CpuPage accent={accent} />;
  if (activePage === "llama-cpp") return <LlamaCppPage />;
  if (activePage === "settings") return <SettingsPage accent={accent} />;
  if (activePage === "ai") return <AiPage />;
  return <OverviewPage accent={accent} />;
}

export default function App() {
  useAccentIndexer();
  const {
    accent,
    setAccent,
    bg,
    setBg,
    accentMode,
    setAccentMode,
    glow,
    setGlow,
    fxSpeed,
    setFxSpeed,
    fxSpread,
    setFxSpread,
    fxDepth,
    setFxDepth,
    glowIntensity,
    setGlowIntensity,
    resetTheme,
    current,
  } = useTheme();
  const [loading, setLoading] = useState(true);
  const isInitialMount = useRef(true);
  const isNavigatingRef = useRef(false);
  const [activePage, setActivePage] = useState<ActivePage>(() =>
    getPageFromPathname(window.location.pathname),
  );

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
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    const path = getPathForPage(activePage);
    const search = activePage === "terminal" ? window.location.search : "";
    if (isInitialMount.current) {
      isInitialMount.current = false;
      window.history.replaceState({ page: activePage }, "", path + search);
    } else {
      window.history.pushState({ page: activePage }, "", path + search);
    }
  }, [activePage]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => {
      isNavigatingRef.current = true;
      setActivePage(getPageFromPathname(window.location.pathname));
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
                healthOk={healthOk}
                activePage={activePage}
                onPageChange={setActivePage}
              />
              {activePage === "theme" ? (
                <ThemePage
                  accent={accent}
                  onAccentChange={setAccent}
                  accentMode={accentMode}
                  onAccentModeChange={setAccentMode}
                  bg={bg}
                  onBgChange={setBg}
                  onReset={resetTheme}
                  glow={glow}
                  onGlowChange={setGlow}
                  fxSpeed={fxSpeed}
                  onFxSpeedChange={setFxSpeed}
                  fxSpread={fxSpread}
                  onFxSpreadChange={setFxSpread}
                  fxDepth={fxDepth}
                  onFxDepthChange={setFxDepth}
                  glowIntensity={glowIntensity}
                  onGlowIntensityChange={setGlowIntensity}
                />
              ) : (
                <PageContent activePage={activePage} accent={current} />
              )}
            </div>
          </MetricsProvider>
        </AlertsProvider>
      </LiveDataControlsProvider>
    </TooltipProvider>
  );
}
