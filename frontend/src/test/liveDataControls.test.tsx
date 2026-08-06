/**
 * Unit pin for the Live/Pause control — the mechanism behind the header chip
 * and the single most important diagnostic instrument this app has (the
 * live-pause differential attributed the second leak). 45 lines of context
 * with zero tests until now.
 */
import { renderHook, act } from "@testing-library/react";
import {
  LiveDataControlsProvider,
  useLiveDataControlsContext,
} from "../context/LiveDataControlsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LiveDataControlsProvider>{children}</LiveDataControlsProvider>
);

describe("LiveDataControlsContext", () => {
  it("starts live, and pause/resume/toggle transition correctly", () => {
    const { result } = renderHook(() => useLiveDataControlsContext(), {
      wrapper,
    });
    expect(result.current.isPaused).toBe(false);
    act(() => result.current.pause());
    expect(result.current.isPaused).toBe(true);
    act(() => result.current.resume());
    expect(result.current.isPaused).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isPaused).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isPaused).toBe(false);
  });

  it("throws a helpful error outside the provider", () => {
    expect(() => renderHook(() => useLiveDataControlsContext())).toThrow();
  });
});
