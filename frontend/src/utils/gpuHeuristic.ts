/**
 * Returns true when the renderer string matches the known-bad stack:
 * NVIDIA Blackwell (RTX 50xx) + Chrome ANGLE backend (driver 595, Chrome 150).
 * Exported separately from isBadGpuStack so tests can exercise the regex
 * without needing a real WebGL context.
 */
export function rendererIsBadStack(renderer: string): boolean {
  return (
    /ANGLE.*NVIDIA.*RTX\s*5\d{3}/i.test(renderer) ||
    /NVIDIA.*RTX\s*5\d{3}.*ANGLE/i.test(renderer)
  );
}

/** Probes the live WebGL renderer and returns true for the known-bad GPU stack. */
export function isBadGpuStack(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext(
        "experimental-webgl",
      ) as WebGLRenderingContext | null);
    if (!gl) return false;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return false;
    const renderer = gl.getParameter(
      ext.UNMASKED_RENDERER_WEBGL,
    ) as string;
    return rendererIsBadStack(renderer);
  } catch {
    return false;
  }
}
