import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      // No global refetchInterval: every polling query declares its own.
      // A 1s default here silently turns any future useQuery into a 1 Hz
      // network + render loop.
      retry: 1,
    },
  },
});

// React 19 dev mode's scheduling profiler calls performance.measure() for
// every component render (~1200/s on this page). Entries accumulate in
// Blink's native C++ Performance Timeline — not V8 heap — causing ~327 MB/min
// RSS growth. Periodic clear keeps the buffer small; production is unaffected
// (enableSchedulingProfiler is stripped from prod builds).
if (import.meta.env.DEV) {
  setInterval(() => {
    performance.clearMarks();
    performance.clearMeasures();
  }, 10_000);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" richColors duration={5000} />
    </QueryClientProvider>
  </StrictMode>,
);
