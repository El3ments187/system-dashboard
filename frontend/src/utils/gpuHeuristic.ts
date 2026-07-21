/**
 * Returns true when the renderer string indicates SOFTWARE rendering
 * (SwiftShader / llvmpipe / softpipe). Chrome falls back to this after a
 * GPU-process crash or under --disable-gpu-compositing. Animated FX
 * (hue-rotate, sheen/flow pans) rasterize entirely on the CPU in this state,
 * so fxSafe must engage to cap memory growth.
 */
export function rendererIsSoftware(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(renderer);
}

/**
 * Returns true when the browser is running under software compositing —
 * either because WebGL is absent (GPU blocked/crashed, real browser) or
 * because the WebGL renderer string identifies a software rasterizer.
 * jsdom has no canvas at all and always returns false.
 *
 * (Renamed from isBadGpuStack: the old name encoded a retracted theory that
 * specific GPU hardware was crash-prone. The crashes were downstream of the
 * since-fixed memory leaks; what this actually detects — and all fxSafe
 * needs — is software rendering.)
 */
export function isSoftwareRendering(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    // No WebGL: a real browser with GPU blocked still has 2D canvas; jsdom has neither.
    if (!gl) return canvas.getContext("2d") != null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return false;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
    return rendererIsSoftware(renderer);
  } catch {
    return false;
  }
}
