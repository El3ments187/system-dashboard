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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" richColors duration={5000} />
    </QueryClientProvider>
  </StrictMode>,
);
