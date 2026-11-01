// The hero's object, modelled in code (ADR 0016): a bunch of grapes where every grape is a camera lens. Each lens is
// a black barrel with knurled rings and a coated glass front element that catches a muted aubergine reflection, set
// in the shape of a bunch (wide shoulders, narrowing to a point) on a curled stem with a single leaf.
// Built from primitives so it needs no download; deterministic, so every visit shows the same bunch.
import * as THREE from "three";

/** Lens positions for a bunch: rings that narrow downward, offset so lenses nest like grapes. */
export function bunchLayout(rows = 7): Array<{ pos: THREE.Vector3; r: number }> {
  const out: Array<{ pos: THREE.Vector3; r: number }> = [];
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1);
    // widest just below the stem, then narrowing to a pair of grapes at the tip
    const ringR = row === rows - 1 ? 0.13 : 0.92 * Math.pow(1 - t, 0.8) * (t < 0.2 ? 0.82 + t : 1);
    const count = row === rows - 1 ? 2 : Math.max(3, Math.round(2 + ringR * 6.5));
    const y = 0.95 - t * 2.05;
    const lensR = 0.27 - 0.06 * t;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + row * 0.55;
      const wobble = 0.04 * Math.sin(row * 3.1 + i * 1.7);
      out.push({ pos: new THREE.Vector3(Math.cos(a) * (ringR + wobble), y + wobble, Math.sin(a) * (ringR + wobble)), r: lensR });
    }
  }
  return out;
}

export function grapeLensCluster(): THREE.Group {
  const group = new THREE.Group();
  const barrel = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, metalness: 0.55, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const ring = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, metalness: 0.8, roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a0910, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02,
    iridescence: 0.85, iridescenceIOR: 1.6, iridescenceThicknessRange: [260, 520], sheen: 0.4, sheenColor: new THREE.Color(0x6b5478),
  });
  const inner = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.6 });

  for (const { pos, r } of bunchLayout()) {
    const lens = new THREE.Group();
    const depth = r * 0.95;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, depth, 48, 1), barrel);
    body.rotation.x = Math.PI / 2;
    lens.add(body);
    // knurled focus ring and a thin chrome edge
    const grip = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.08, 10, 48), ring);
    grip.position.z = -depth * 0.12;
    lens.add(grip);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.045, 10, 48), ring);
    lip.position.z = depth / 2;
    lens.add(lip);
    // the front element: a shallow dome of coated glass over a dark inner barrel
    const well = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 48), inner);
    well.position.z = depth / 2 - 0.004;
    lens.add(well);
    const front = new THREE.Mesh(new THREE.SphereGeometry(r * 0.84, 48, 24, 0, Math.PI * 2, 0, Math.PI / 5), glass);
    front.rotation.x = Math.PI / 2;
    front.position.z = depth / 2 - r * 0.62;
    lens.add(front);
    lens.position.copy(pos);
    // face outward from the bunch's spine at the lens's own height, tipped down a little like hanging fruit
    const out = pos.clone().sub(new THREE.Vector3(0, pos.y + 0.28, 0)).normalize();
    lens.lookAt(pos.clone().add(out));
    group.add(lens);
  }

  // the stem: a curled tube, and one leaf
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.75 });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.95, 0), new THREE.Vector3(0.05, 1.3, 0.05), new THREE.Vector3(-0.1, 1.6, 0), new THREE.Vector3(0.12, 1.85, -0.05),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.045, 12, false), stemMat));
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.35, 0.12, 0.62, 0.42, 0.7, 0.78);
  leafShape.bezierCurveTo(0.38, 0.7, 0.1, 0.45, 0, 0);
  const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(leafShape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }),
    new THREE.MeshPhysicalMaterial({ color: 0x3a2c42, roughness: 0.45, clearcoat: 0.4, sheen: 0.6, sheenColor: new THREE.Color(0x6b5478) }));
  leaf.position.set(0.02, 1.45, 0.02);
  leaf.rotation.set(-0.3, 0.4, -0.5);
  group.add(leaf);

  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return group;
}
