import React from "react";
import { render, act } from "@testing-library/react";
import TerminalModal from "../components/TerminalModal";

vi.mock("../services/api", () => ({
  ptyReadOutput: vi.fn(),
  ptyWriteInput: vi.fn(),
  ptyResizeTerminal: vi.fn(),
  ptyKillTerminal: vi.fn(),
}));

vi.mock("../utils/ansiOutput", () => ({
  formatTerminalOutput: (text: string) => text,
}));

import {
  ptyReadOutput,
  ptyWriteInput,
  ptyResizeTerminal,
  ptyKillTerminal,
} from "../services/api";

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(ptyWriteInput).mockResolvedValue(undefined);
  vi.mocked(ptyResizeTerminal).mockResolvedValue(undefined);
  vi.mocked(ptyKillTerminal).mockResolvedValue(undefined);
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("TerminalModal output polling", () => {
  it("calls initial read without offset, then polls with nextOffset", async () => {
    vi.mocked(ptyReadOutput)
      .mockResolvedValueOnce({ text: "hello\n", nextOffset: 6 })
      .mockResolvedValueOnce({ text: "world\n", nextOffset: 12 });

    render(<TerminalModal isOpen ptsName="pts/0" onClose={() => {}} />);

    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(ptyReadOutput).toHaveBeenCalledTimes(2);
    expect(ptyReadOutput).toHaveBeenNthCalledWith(1, "pts/0");
    expect(ptyReadOutput).toHaveBeenNthCalledWith(2, "pts/0", 6);
  });

  it("appends delta to output without duplicating initial text", async () => {
    vi.mocked(ptyReadOutput)
      .mockResolvedValueOnce({ text: "hello\n", nextOffset: 6 })
      .mockResolvedValueOnce({ text: "world\n", nextOffset: 12 });

    const { container } = render(
      <TerminalModal isOpen ptsName="pts/0" onClose={() => {}} />,
    );

    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const text = container.textContent ?? "";
    // Both lines appear
    expect(text).toContain("hello");
    expect(text).toContain("world");
    // Initial text is not duplicated
    expect(text.split("hello").length - 1).toBe(1);
  });

  it("advances offset across multiple polls without re-reading prior data", async () => {
    vi.mocked(ptyReadOutput)
      .mockResolvedValueOnce({ text: "start\n", nextOffset: 6 })
      .mockResolvedValueOnce({ text: "mid\n", nextOffset: 10 })
      .mockResolvedValueOnce({ text: "end\n", nextOffset: 14 });

    render(<TerminalModal isOpen ptsName="pts/0" onClose={() => {}} />);

    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(ptyReadOutput).toHaveBeenCalledTimes(3);
    expect(ptyReadOutput).toHaveBeenNthCalledWith(2, "pts/0", 6);
    expect(ptyReadOutput).toHaveBeenNthCalledWith(3, "pts/0", 10);
  });
});
