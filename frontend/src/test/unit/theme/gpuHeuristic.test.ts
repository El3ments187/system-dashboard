import { describe, it, expect } from "vitest";
import {
  rendererIsSoftware,
  isSoftwareRendering,
} from "../../../utils/gpuHeuristic";

describe("rendererIsSoftware", () => {
  it("returns true for SwiftShader", () => {
    expect(
      rendererIsSoftware(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      ),
    ).toBe(true);
  });

  it("returns true for llvmpipe", () => {
    expect(rendererIsSoftware("llvmpipe (LLVM 15.0.6, 256 bits)")).toBe(true);
  });

  it("returns true for softpipe", () => {
    expect(rendererIsSoftware("softpipe")).toBe(true);
  });

  it("returns true for 'software rasterizer'", () => {
    expect(rendererIsSoftware("Chromium Software Rasterizer")).toBe(true);
  });

  it("returns false for a real hardware GPU", () => {
    expect(
      rendererIsSoftware(
        "ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5070 Ti/PCIe/SSE2, OpenGL 4.5.0)",
      ),
    ).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(rendererIsSoftware("")).toBe(false);
  });
});

describe("isSoftwareRendering", () => {
  it("returns false in jsdom (no WebGL context available)", () => {
    // jsdom implements neither WebGL nor 2D canvas; must not throw, must return false
    expect(isSoftwareRendering()).toBe(false);
  });
});
