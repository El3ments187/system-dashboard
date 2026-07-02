import { render as rtlRender } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../components/common/TooltipProvider";
import type { ReactNode } from "react";

class MockResizeObserver implements ResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

export interface RenderWithThemeOptions {
  accentMode?: string;
  accent?: string;
}

export function renderWithTheme(
  ui: ReactNode,
  { accentMode = "solid", accent = "turquoise" }: RenderWithThemeOptions = {},
) {
  const wrapper: React.FC<{ children: ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );

  document.documentElement.setAttribute("data-accent-mode", accentMode);
  document.documentElement.setAttribute("data-accent", accent);

  const result = rtlRender(ui, { wrapper });

  return result;
}

export function resetThemeAttributes() {
  document.documentElement.removeAttribute("data-accent-mode");
  document.documentElement.removeAttribute("data-accent");
}
