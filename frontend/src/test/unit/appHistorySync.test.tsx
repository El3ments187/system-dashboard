// @vitest-environment jsdom
import React, { useState, useEffect, useRef } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";

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

// Mirrors App.tsx URL-sync effect (lines 143-163).
// When App.tsx's effect changes, update this harness in the same commit.
function UrlSyncHarness({ initialPage }: { initialPage?: ActivePage }) {
  const isInitialMount = useRef(true);
  const isNavigatingRef = useRef(false);
  const [activePage, setActivePage] = useState<ActivePage>(
    initialPage ?? getPageFromPathname(window.location.pathname),
  );

  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    const path = getPathForPage(activePage);
    const search = activePage === "terminal" ? window.location.search : "";
    const target = path + search;
    const currentUrl = window.location.pathname + window.location.search;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      window.history.replaceState({ page: activePage }, "", target);
      return;
    }
    if (target === currentUrl) {
      window.history.replaceState({ page: activePage }, "", target);
      return;
    }
    window.history.pushState({ page: activePage }, "", target);
  }, [activePage]);

  useEffect(() => {
    const handler = () => {
      isNavigatingRef.current = true;
      setActivePage(getPageFromPathname(window.location.pathname));
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return (
    <div>
      {(
        ["overview", "gpu", "cpu", "llama-cpp", "terminal"] as ActivePage[]
      ).map((p) => (
        <button key={p} data-testid={`nav-${p}`} onClick={() => setActivePage(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

describe("App URL-sync effect — window.history contract", () => {
  let pushSpy: ReturnType<typeof vi.spyOn>;
  let replaceSpy: ReturnType<typeof vi.spyOn>;

  function spyHistory() {
    pushSpy = vi.spyOn(window.history, "pushState");
    replaceSpy = vi.spyOn(window.history, "replaceState");
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
    spyHistory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("1: initial mount calls replaceState once with current path; pushState never called", () => {
    render(<UrlSyncHarness />);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith(expect.any(Object), "", "/");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("2: StrictMode double-invoke with same activePage never calls pushState", () => {
    // StrictMode runs each effect twice. The same-URL guard detects target === currentUrl
    // on the second pass and calls replaceState instead of pushState.
    render(
      <React.StrictMode>
        <UrlSyncHarness />
      </React.StrictMode>,
    );
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("3: navigating to a new page calls pushState once with the new path", async () => {
    const { getByTestId } = render(<UrlSyncHarness />);
    replaceSpy.mockClear();
    pushSpy.mockClear();

    await act(async () => {
      fireEvent.click(getByTestId("nav-gpu"));
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith(expect.any(Object), "", "/gpu");
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("3b: unrecognised path normalises to / via replaceState on initial mount; pushState never called", () => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/bogus");
    spyHistory();

    render(<UrlSyncHarness />);

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith(expect.any(Object), "", "/");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("4: popstate (back/forward) does not call pushState or replaceState", async () => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/cpu");
    spyHistory();

    render(<UrlSyncHarness initialPage="cpu" />);
    replaceSpy.mockClear();
    pushSpy.mockClear();

    // Simulate browser Back: URL reverts to "/" then popstate fires
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
    spyHistory();

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("5: navigating to terminal preserves window.location.search in the pushed URL", async () => {
    const { getByTestId } = render(<UrlSyncHarness initialPage="overview" />);
    // Inject pts param after initial mount (simulates terminal having previously set it via pushState)
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/?pts=99999");
    spyHistory();

    await act(async () => {
      fireEvent.click(getByTestId("nav-terminal"));
    });

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith(
      expect.any(Object),
      "",
      "/llama-cpp/terminal?pts=99999",
    );
  });
});
