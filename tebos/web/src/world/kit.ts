// Shapes shared by the TEBOS 3D scenes: chess-piece profiles and board tiles.
import * as THREE from "three";

export type Profile = Array<[number, number]>;
export const PROFILES: Record<string, Profile> = {
  pawn: [[0, 0], [0.34, 0], [0.34, 0.07], [0.26, 0.11], [0.22, 0.16], [0.13, 0.34], [0.11, 0.44], [0.18, 0.48], [0.1, 0.52], [0.16, 0.58], [0.18, 0.66], [0.15, 0.74], [0.08, 0.79], [0, 0.8]],
  rook: [[0, 0], [0.36, 0], [0.36, 0.08], [0.28, 0.12], [0.24, 0.18], [0.2, 0.62], [0.28, 0.66], [0.28, 0.86], [0.2, 0.86], [0.2, 0.8], [0, 0.8]],
  bishop: [[0, 0], [0.34, 0], [0.34, 0.07], [0.26, 0.11], [0.2, 0.18], [0.12, 0.58], [0.2, 0.62], [0.1, 0.66], [0.17, 0.78], [0.14, 0.92], [0.06, 1.0], [0.08, 1.04], [0, 1.08]],
  king: [[0, 0], [0.4, 0], [0.4, 0.08], [0.3, 0.13], [0.24, 0.22], [0.15, 0.78], [0.26, 0.83], [0.14, 0.88], [0.2, 1.05], [0.24, 1.18], [0.12, 1.24], [0, 1.25]],
};

export function lathe(profile: Profile) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  g.computeVertexNormals();
  return g;
}

// A tile with softened edges: a box whose top face is slightly bevelled.
export class RoundedTile extends THREE.ExtrudeGeometry {
  constructor(w: number, h: number, d: number, r = 0.06) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    super(s, { depth: h - 0.02, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 6 });
    this.rotateX(-Math.PI / 2);
    this.translate(0, -h / 2, 0);
  }
}

/** True when WebGL runs on the CPU (no graphics chip): draw sparingly there. */
export function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}
