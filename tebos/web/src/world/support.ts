// Whether to draw the 3D scenes. They need a graphics chip: on a CPU-only
// WebGL renderer (virtual machines, old PCs, headless browsers) setting a
// scene up can block the page for seconds, so those visitors get the plain
// version. `?force3d` in the address draws them anyway (used by tests).
export type WebglSupport = "hardware" | "software" | "none";

let cached: WebglSupport | null = null;

export function webglSupport(): WebglSupport {
  if (cached) return cached;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return (cached = "none");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    cached = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) ? "software" : "hardware";
  } catch {
    cached = "none";
  }
  return cached;
}

export function use3d(opts: { allowReducedMotion?: boolean } = {}): boolean {
  if (typeof window === "undefined") return false;
  if (!opts.allowReducedMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const support = webglSupport();
  if (support === "none") return false;
  return support === "hardware" || new URLSearchParams(window.location.search).has("force3d");
}
