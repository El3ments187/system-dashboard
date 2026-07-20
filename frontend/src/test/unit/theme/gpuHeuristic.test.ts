import { describe, it, expect } from "vitest";
import { rendererIsBadStack, rendererIsSoftware, isBadGpuStack } from "../../../utils/gpuHeuristic";

describe("rendererIsBadStack", () => {
  it("returns true for ANGLE + NVIDIA RTX 5090", () => {
    expect(
      rendererIsBadStack("ANGLE (NVIDIA, GeForce RTX 5090, OpenGL 4.6.0)"),
    ).toBe(true);
  });

  it("returns true for ANGLE + NVIDIA RTX 5080", () => {
    expect(
      rendererIsBadStack("ANGLE (NVIDIA, NVIDIA GeForce RTX 5080, OpenGL 4.6.0)"),
    ).toBe(true);
  });

  it("returns true for NVIDIA RTX 5070 ... ANGLE order", () => {
    expect(
      rendererIsBadStack("NVIDIA GeForce RTX 5070 (ANGLE Direct3D11)"),
    ).toBe(true);
  });

  it("returns false for RTX 4090 (Ada, not Blackwell)", () => {
    expect(
      rendererIsBadStack("ANGLE (NVIDIA, GeForce RTX 4090, OpenGL 4.6.0)"),
    ).toBe(false);
  });

  it("returns false for RTX 3090 (Ampere)", () => {
    expect(
      rendererIsBadStack("ANGLE (NVIDIA, GeForce RTX 3090, OpenGL 4.6.0)"),
    ).toBe(false);
  });

  it("returns false for AMD GPU", () => {
    expect(
      rendererIsBadStack("ANGLE (AMD, Radeon RX 7900 XTX, OpenGL 4.6.0)"),
    ).toBe(false);
  });

  it("returns false for Intel GPU", () => {
    expect(
      rendererIsBadStack("ANGLE (Intel, Intel UHD Graphics 770, OpenGL 4.6.0)"),
    ).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(rendererIsBadStack("")).toBe(false);
  });
});

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

describe("isBadGpuStack", () => {
  it("returns false in jsdom (no WebGL context available)", () => {
    // jsdom does not implement WebGL; isBadGpuStack must not throw and must return false
    expect(isBadGpuStack()).toBe(false);
  });
});
