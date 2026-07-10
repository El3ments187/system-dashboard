/// <reference types="vitest" />
import { render, screen } from "@testing-library/react";
import PanelErrorBoundary from "../components/common/PanelErrorBoundary";
import PanelErrorState from "../components/common/PanelErrorState";

// Mock child that throws
function ThrowChild(): React.JSX.Element {
  throw new Error("Test error");
}

describe("PanelErrorBoundary", () => {
  it("catches render errors and shows error UI", () => {
    render(
      <PanelErrorBoundary panelName="TestPanel">
        <ThrowChild />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/TestPanel Error/i)).toBeInTheDocument();
  });

  it("does not reset error state on re-render with same panelName", () => {
    const { rerender } = render(
      <PanelErrorBoundary panelName="StablePanel">
        <ThrowChild />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/StablePanel Error/i)).toBeInTheDocument();

    // Re-render with same panelName - error should persist
    rerender(
      <PanelErrorBoundary panelName="StablePanel">
        <ThrowChild />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/StablePanel Error/i)).toBeInTheDocument();
  });

  it("resets error state when panelName changes", () => {
    const { rerender } = render(
      <PanelErrorBoundary panelName="PanelA">
        <ThrowChild />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/PanelA Error/i)).toBeInTheDocument();

    // Change panelName - should reset and catch new error
    rerender(
      <PanelErrorBoundary panelName="PanelB">
        <ThrowChild />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/PanelB Error/i)).toBeInTheDocument();
  });

  it("renders children when no error occurs", () => {
    render(
      <PanelErrorBoundary panelName="GoodPanel">
        <div data-testid="child">Safe Content</div>
      </PanelErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

describe("PanelErrorBoundary — App-level coverage", () => {
  it("shows App Error fallback when panelName is App", () => {
    render(
      <PanelErrorBoundary panelName="App">
        <ThrowChild />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText(/App Error/i)).toBeInTheDocument();
  });

  it("does not propagate — sibling outside the boundary is unaffected", () => {
    render(
      <div>
        <PanelErrorBoundary panelName="App">
          <ThrowChild />
        </PanelErrorBoundary>
        <div data-testid="sibling">Still here</div>
      </div>,
    );
    expect(screen.getByText(/App Error/i)).toBeInTheDocument();
    expect(screen.getByTestId("sibling")).toBeInTheDocument();
  });
});

describe("PanelErrorState", () => {
  it("renders with error info and retry button", () => {
    const mockRetry = vi.fn();
    render(
      <PanelErrorState
        panelName="TestPanel"
        error={new Error("Test error message")}
        errorInfo={null}
        onRetry={mockRetry}
      />,
    );
    expect(screen.getByText(/TestPanel Error/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", async () => {
    const mockRetry = vi.fn();
    render(
      <PanelErrorState
        panelName="TestPanel"
        error={new Error("Test error")}
        errorInfo={null}
        onRetry={mockRetry}
      />,
    );
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await retryBtn.click();
    expect(mockRetry).toHaveBeenCalled();
  });
});
