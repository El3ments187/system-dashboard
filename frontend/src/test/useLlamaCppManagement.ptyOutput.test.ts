import { renderHook, act } from "@testing-library/react";
import { useLlamaCppManagement, composeUpdateCommand, FAIL_MARKER } from "../hooks/useLlamaCppManagement";

vi.mock("../services/api", () => ({
  ptySpawnTerminal: vi.fn(),
  ptyWriteInput: vi.fn(),
  ptyReadOutput: vi.fn(),
  ptyKillTerminal: vi.fn(),
}));

vi.mock("../utils/ansiOutput", () => ({
  extractLatestPercent: vi.fn(),
}));

import {
  ptySpawnTerminal,
  ptyWriteInput,
  ptyReadOutput,
  ptyKillTerminal,
} from "../services/api";
import { extractLatestPercent } from "../utils/ansiOutput";

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(ptySpawnTerminal).mockResolvedValue({ pts_name: "pts/1" });
  vi.mocked(ptyWriteInput).mockResolvedValue(undefined);
  vi.mocked(ptyKillTerminal).mockResolvedValue(undefined);
  vi.mocked(extractLatestPercent).mockReturnValue(null);
  localStorage.clear();
  localStorage.setItem("llama_cpp_dir", "/repo");
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("useLlamaCppManagement ptyReadOutput polling", () => {
  it("accumulates output without duplication across consecutive polls", async () => {
    vi.mocked(ptyReadOutput)
      .mockResolvedValueOnce({ text: "line1\n", nextOffset: 6 })
      .mockResolvedValueOnce({ text: "line2\n", nextOffset: 12 })
      .mockResolvedValueOnce({
        text: "__LLAMA_UPDATE_DONE__\n",
        nextOffset: 33,
      });

    const { result } = renderHook(() => useLlamaCppManagement());

    await act(async () => {
      await result.current.runUpdate();
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateOutput).toBe("line1\n");

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateOutput).toBe("line1\nline2\n");

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateOutput).toBe(
      "line1\nline2\n__LLAMA_UPDATE_DONE__\n",
    );
    expect(result.current.updateState).toBe("done");
    expect(result.current.updateProgress).toBe(100);
  });

  it("passes previous nextOffset to each subsequent poll", async () => {
    vi.mocked(ptyReadOutput)
      .mockResolvedValueOnce({ text: "a", nextOffset: 100 })
      .mockResolvedValueOnce({ text: "b", nextOffset: 200 })
      .mockResolvedValueOnce({
        text: "__LLAMA_UPDATE_DONE__\n",
        nextOffset: 222,
      });

    const { result } = renderHook(() => useLlamaCppManagement());

    await act(async () => {
      await result.current.runUpdate();
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(ptyReadOutput).toHaveBeenNthCalledWith(1, "pts/1", 0);
    expect(ptyReadOutput).toHaveBeenNthCalledWith(2, "pts/1", 100);
    expect(ptyReadOutput).toHaveBeenNthCalledWith(3, "pts/1", 200);
  });

  it("skips state update when poll returns empty text", async () => {
    vi.mocked(ptyReadOutput)
      .mockResolvedValueOnce({ text: "", nextOffset: 0 })
      .mockResolvedValueOnce({ text: "content\n", nextOffset: 8 })
      .mockResolvedValueOnce({
        text: "__LLAMA_UPDATE_DONE__\n",
        nextOffset: 29,
      });

    const { result } = renderHook(() => useLlamaCppManagement());

    await act(async () => {
      await result.current.runUpdate();
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateOutput).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateOutput).toBe("content\n");

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateOutput).toBe(
      "content\n__LLAMA_UPDATE_DONE__\n",
    );
  });

  it("(b-K) pty stream emitting FAIL_MARKER routes to error state, not done", async () => {
    vi.mocked(ptyReadOutput).mockResolvedValueOnce({
      text: `${FAIL_MARKER}\n`,
      nextOffset: FAIL_MARKER.length + 1,
    });

    const { result } = renderHook(() => useLlamaCppManagement());

    await act(async () => {
      await result.current.runUpdate();
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateState).toBe("error");
  });

  it("advances progress from extractLatestPercent before completing at 100", async () => {
    vi.mocked(extractLatestPercent).mockReturnValueOnce(42);
    vi.mocked(ptyReadOutput)
      .mockResolvedValueOnce({ text: "Building... 42%\n", nextOffset: 17 })
      .mockResolvedValueOnce({
        text: "__LLAMA_UPDATE_DONE__\n",
        nextOffset: 38,
      });

    const { result } = renderHook(() => useLlamaCppManagement());

    await act(async () => {
      await result.current.runUpdate();
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateProgress).toBe(42);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.updateProgress).toBe(100);
  });
});

describe("composeUpdateCommand — line-continuation folding (K)", () => {
  it("(a) folds the user's exact confirmed-working script: no stray \\\\ &&, no dangling backslash", () => {
    const userScript =
      "cd ~/Documents/AI/llama.cpp/git/llama.cpp\n" +
      "git pull && \\\n" +
      "rm -rf build && \\\n" +
      "cmake -B build \\\n" +
      "  -DGGML_CUDA=ON \\\n" +
      "  -DCMAKE_BUILD_TYPE=Release \\\n" +
      "  -DCMAKE_CUDA_ARCHITECTURES=120 && \\\n" +
      'cmake --build build --config Release --parallel "$(nproc)"';
    const out = composeUpdateCommand(userScript);
    expect(out, "stray \\ && must not appear").not.toMatch(/\\\s*&&/);
    expect(out, "no dangling backslash").not.toMatch(/\\[^n]/);
    expect(out).toContain(
      "cd ~/Documents/AI/llama.cpp/git/llama.cpp && git pull && rm -rf build && cmake -B build"
    );
  });

  it("(c) pin: plain two-line DEFAULT_UPDATE_SCRIPT composes with && and both sentinel markers", () => {
    const defaultScript =
      "git pull\ncmake --build build --config Release -j$(nproc)";
    const out = composeUpdateCommand(defaultScript);
    expect(out).toContain(
      "git pull && cmake --build build --config Release -j$(nproc)"
    );
    expect(out).toContain('echo "__LLAMA_UPDATE_DONE__"');
    expect(out).toContain(`echo "${FAIL_MARKER}"`);
  });
});
