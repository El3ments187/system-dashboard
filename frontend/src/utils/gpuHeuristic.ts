/**
 * Kept as a named export so existing tests and callers remain valid.
 * No longer used by isBadGpuStack: the underlying memory leaks it guarded
 * against are fixed, so pre-emptively disabling FX for RTX 5xxx hardware
 * is no longer warranted.
 */
export function rendererIsBadStack(renderer: string): boolean {
  return (
    /ANGLE.*NVIDIA.*RTX\s*5\d{3}/i.test(renderer) ||
    /NVIDIA.*RTX\s*5\d{3}.*ANGLE/i.test(renderer)
  );
}

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
 */
export function isBadGpuStack(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext(
        "experimental-webgl",
      ) as WebGLRenderingContext | null);
    // No WebGL: a real browser with GPU blocked still has 2D canvas; jsdom has neither.
    if (!gl) return canvas.getContext("2d") != null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return false;
    const renderer = gl.getParameter(
      ext.UNMASKED_RENDERER_WEBGL,
    ) as string;
    return rendererIsSoftware(renderer);
  } catch {
    return false;
  }
}
