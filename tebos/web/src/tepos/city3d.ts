// The TEPOS city in 3D (founder, 16 Oct 2026: "it should virtually build my city ... it should move around").
// On opening, every building rises from its blueprint, stage by stage, while the camera flies round the city:
//   blueprint lines are drawn → the foundation is poured → the frame goes up → the walls close in → the lights come on.
// Each building stops where its portal really is, never further:
//   * a built portal finishes, lit;
//   * a portal not built yet stops at its frame, with a crane: under construction;
//   * a portal you can't open stays a blueprint.
// Afterwards the camera keeps drifting round; drag to look around, scroll or pinch to come closer. Every building
// carries a label button that opens its portal, so the city works by keyboard and screen reader too.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { isSoftwareRenderer } from "../world/kit";

export const STAGES = ["Blueprint", "Foundation", "Framing", "Walls", "Lit"] as const;
/** How far a building goes: 1 blueprint only, 3 up to its frame, 5 finished and lit. */
export type FinalStage = 1 | 3 | 5;

export interface CityBuilding {
  key: string;
  name: string;
  shade: string;
  accent: string;
  final: FinalStage;
  status: string;
}

export interface City {
  replay(): void;
  resize(): void;
  dispose(): void;
}

interface Options {
  reducedMotion: boolean;
  onOpen: (key: string, origin: { currentTarget: Element }) => void;
  /** The intro's progress: the stage the city has reached (0–4), and whether it is done. */
  onStage?: (stage: number, done: boolean) => void;
}

// ---------------------------------------------------------------------------------------------- the plans
// Every building is a few boxes (the masses that get a frame, walls and windows) and caps (roofs, domes,
// crenellations) that go on last. Sizes are in metres-ish; one storey is 0.7.
type Box = { w: number; h: number; d: number; x?: number; z?: number; y?: number };
type Cap = { kind: "gable" | "dome" | "pediment" | "crown" | "spire" | "battlements" | "flag"; w: number; d: number; h: number; x?: number; z?: number; y: number };
interface Plan { at: [number, number]; turn: number; boxes: Box[]; caps: Cap[] }

const PLANS: Record<string, Plan> = {
  // the reserve, at the centre: a stepped podium, a hall with columns and a pediment
  capital: { at: [0, 0], turn: 0, boxes: [{ w: 3.6, h: 0.35, d: 2.8 }, { w: 3.1, h: 0.3, d: 2.4, y: 0.35 }, { w: 2.8, h: 2.1, d: 2.0, y: 0.65 }],
    caps: [{ kind: "pediment", w: 3.1, d: 2.3, h: 0.8, y: 2.75 }] },
  // an office tower with a crown
  enterprise: { at: [-4.6, -4.4], turn: 0.5, boxes: [{ w: 2.2, h: 6.3, d: 2.2 }, { w: 1.5, h: 0.9, d: 1.5, y: 6.3 }],
    caps: [{ kind: "crown", w: 1.5, d: 1.5, h: 0.5, y: 7.2 }] },
  // a fortress tower
  irekun: { at: [-6.4, 1.6], turn: -0.3, boxes: [{ w: 2.4, h: 4.2, d: 2.4 }], caps: [{ kind: "battlements", w: 2.4, d: 2.4, h: 0.4, y: 4.2 }, { kind: "flag", w: 0, d: 0, h: 1.4, y: 4.6 }] },
  // a slim trading tower with a spire
  forex: { at: [4.6, -4.4], turn: -0.5, boxes: [{ w: 1.5, h: 7.7, d: 1.5 }], caps: [{ kind: "spire", w: 1.5, d: 1.5, h: 1.4, y: 7.7 }] },
  // a library with a dome
  academics: { at: [6.4, 1.6], turn: 0.3, boxes: [{ w: 3.2, h: 2.1, d: 2.4 }], caps: [{ kind: "dome", w: 1.8, d: 1.8, h: 0.9, y: 2.1 }] },
  // a row of houses
  agent: { at: [0, 6.2], turn: Math.PI, boxes: [-1.5, 0, 1.5].map((x) => ({ w: 1.3, h: 1.4, d: 1.6, x })),
    caps: [-1.5, 0, 1.5].map((x) => ({ kind: "gable" as const, w: 1.45, d: 1.75, h: 0.8, x, y: 1.4 })) },
};
const STOREY = 0.7;

// ---------------------------------------------------------------------------------------------- timing
const STAGE_SECONDS = 1.15;
const STAGGER = 0.32;
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#2a1a10");
  grad.addColorStop(0.4, "#6b4127");
  grad.addColorStop(0.7, "#c27a45");
  grad.addColorStop(0.85, "#f0b878");
  grad.addColorStop(1, "#8a5330");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createCity(host: HTMLElement, buildings: CityBuilding[], opts: Options): City {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const soft = isSoftwareRenderer(renderer);
  renderer.shadowMap.enabled = !soft;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = "city3d-labels";
  host.appendChild(labels.domElement);

  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ------------------------------------------------------------------------------------------ dusk
  const scene = new THREE.Scene();
  scene.background = keep(skyTexture());
  scene.fog = new THREE.Fog("#8a5636", 34, 95);
  scene.add(new THREE.HemisphereLight("#ffd9a8", "#3a281b", 1.25));
  const sun = new THREE.DirectionalLight("#ffc283", 3.2);
  sun.position.set(14, 9, -10);
  sun.castShadow = !soft;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#8fa3cc", 0.6);
  fill.position.set(-10, 6, 10);
  scene.add(fill);

  // the ground, a ring road round the reserve, and a street to every plot
  const ground = new THREE.Mesh(keep(new THREE.CircleGeometry(60, 64)), keep(new THREE.MeshStandardMaterial({ color: "#3a281b", roughness: 1 })));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const asphalt = keep(new THREE.MeshStandardMaterial({ color: "#2a1d14", roughness: 0.9 }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(3.3, 4.1, 64)), asphalt);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  ring.receiveShadow = true;
  scene.add(ring);
  const lane = keep(new THREE.MeshBasicMaterial({ color: "#c79a5e", transparent: true, opacity: 0.35 }));
  const laneRing = new THREE.Mesh(keep(new THREE.RingGeometry(3.68, 3.72, 64)), lane);
  laneRing.rotation.x = -Math.PI / 2;
  laneRing.position.y = 0.01;
  scene.add(laneRing);

  // the far city: dark blocks on the horizon, a few windows lit
  const far = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), keep(new THREE.MeshStandardMaterial({ color: "#4a3020", roughness: 1 })), 90);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + Math.sin(i * 12.9) * 0.03;
    const r = 38 + ((i * 37) % 12);
    const h = 1.5 + ((i * 53) % 6);
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
      new THREE.Vector3(1.6 + ((i * 7) % 3), h, 1.6 + ((i * 5) % 3)));
    far.setMatrixAt(i, m4);
  }
  scene.add(far);

  // ------------------------------------------------------------------------------------------ materials
  const blueprintMat = keep(new THREE.LineBasicMaterial({ color: "#a9d4ff", transparent: true, opacity: 0.95 }));
  const gridMat = keep(new THREE.LineBasicMaterial({ color: "#a9d4ff", transparent: true, opacity: 0.18 }));
  const concrete = keep(new THREE.MeshStandardMaterial({ color: "#8d8376", roughness: 0.95 }));
  const timber = keep(new THREE.MeshStandardMaterial({ color: "#c8955a", roughness: 0.8 }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: "#d6a23c", roughness: 0.5, metalness: 0.4 }));
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));

  // ------------------------------------------------------------------------------------------ buildings
  interface Built {
    b: CityBuilding;
    group: THREE.Group;
    lines: THREE.LineSegments;
    lineCount: number;
    grid: THREE.LineSegments;
    slab: THREE.Mesh;
    frame: THREE.InstancedMesh;
    frameCount: number;
    walls: THREE.Mesh[];
    caps: THREE.Object3D[];
    windowMat: THREE.MeshStandardMaterial;
    windows: THREE.InstancedMesh;
    glow: THREE.PointLight;
    crane: THREE.Group | null;
    delay: number;
    top: number;
  }

  const capGeometry = (c: Cap): THREE.BufferGeometry => {
    switch (c.kind) {
      case "gable":
      case "pediment": {
        const s = new THREE.Shape();
        s.moveTo(-c.w / 2, 0);
        s.lineTo(c.w / 2, 0);
        s.lineTo(0, c.h);
        s.closePath();
        return new THREE.ExtrudeGeometry(s, { depth: c.d, bevelEnabled: false }).translate(0, 0, -c.d / 2);
      }
      case "dome":
        return new THREE.SphereGeometry(c.w / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, c.h / (c.w / 2), 1);
      case "crown":
        return new THREE.CylinderGeometry(c.w * 0.35, c.w * 0.55, c.h, 4, 1).rotateY(Math.PI / 4).translate(0, c.h / 2, 0);
      case "spire":
        return new THREE.ConeGeometry(c.w * 0.45, c.h, 4).rotateY(Math.PI / 4).translate(0, c.h / 2, 0);
      case "battlements": {
        const parts: THREE.BufferGeometry[] = [];
        const n = 4;
        for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
          const along = -c.w / 2 + (c.w / n) * (i + 0.5);
          parts.push(new THREE.BoxGeometry(c.w / n / 1.8, c.h, 0.25).translate(along, c.h / 2, (side * (c.d - 0.25)) / 2));
          parts.push(new THREE.BoxGeometry(0.25, c.h, c.d / n / 1.8).translate((side * (c.w - 0.25)) / 2, c.h / 2, along));
        }
        return mergeGeometries(parts);
      }
      case "flag":
        return mergeGeometries([new THREE.CylinderGeometry(0.03, 0.03, c.h, 6).translate(0, c.h / 2, 0), new THREE.BoxGeometry(0.55, 0.32, 0.02).translate(0.28, c.h - 0.2, 0)]);
    }
  };

  const built: Built[] = buildings.map((b, i) => {
    const plan = PLANS[b.key] ?? { at: [0, 0] as [number, number], turn: 0, boxes: [{ w: 2, h: 2, d: 2 }], caps: [] };
    const group = new THREE.Group();
    group.position.set(plan.at[0], 0, plan.at[1]);
    group.rotation.y = plan.turn;
    group.userData.key = b.key;
    scene.add(group);

    const wallColour = new THREE.Color(b.shade);
    if (wallColour.getHSL({ h: 0, s: 0, l: 0 }).l < 0.22) wallColour.lerp(new THREE.Color(b.accent), 0.18);
    const wallMat = keep(new THREE.MeshStandardMaterial({ color: wallColour, roughness: 0.75, metalness: 0.05 }));
    const capMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(b.shade).lerp(new THREE.Color(b.accent), 0.35), roughness: 0.6, metalness: 0.15 }));
    const windowMat = keep(new THREE.MeshStandardMaterial({ color: "#2a1d14", emissive: new THREE.Color("#ffc878").lerp(new THREE.Color(b.accent), 0.25), emissiveIntensity: 0, roughness: 0.3 }));

    // footprint, for the slab and the plot's blueprint grid
    const xs = plan.boxes.flatMap((x) => [(x.x ?? 0) - x.w / 2, (x.x ?? 0) + x.w / 2]);
    const zs = plan.boxes.flatMap((x) => [(x.z ?? 0) - x.d / 2, (x.z ?? 0) + x.d / 2]);
    const fw = Math.max(...xs) - Math.min(...xs) + 0.6, fd = Math.max(...zs) - Math.min(...zs) + 0.6;
    const fx = (Math.max(...xs) + Math.min(...xs)) / 2, fz = (Math.max(...zs) + Math.min(...zs)) / 2;

    const gridPts: number[] = [];
    for (let gx = -fw / 2 - 0.4; gx <= fw / 2 + 0.41; gx += 0.4) gridPts.push(fx + gx, 0.02, fz - fd / 2 - 0.4, fx + gx, 0.02, fz + fd / 2 + 0.4);
    for (let gz = -fd / 2 - 0.4; gz <= fd / 2 + 0.41; gz += 0.4) gridPts.push(fx - fw / 2 - 0.4, 0.02, fz + gz, fx + fw / 2 + 0.4, 0.02, fz + gz);
    const grid = new THREE.LineSegments(keep(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3))), gridMat);
    group.add(grid);

    const slab = new THREE.Mesh(keep(new THREE.BoxGeometry(fw, 0.12, fd).translate(0, 0.06, 0)), concrete);
    slab.position.set(fx, 0, fz);
    slab.receiveShadow = true;
    slab.castShadow = true;
    group.add(slab);
    const base = 0.12;

    // blueprint: the outline of everything, drawn line by line
    const linePos: number[] = [];
    const addEdges = (g: THREE.BufferGeometry, at: THREE.Vector3) => {
      const e = new THREE.EdgesGeometry(g, 20);
      const p = e.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) linePos.push(p.getX(k) + at.x, p.getY(k) + at.y, p.getZ(k) + at.z);
      e.dispose();
    };

    // walls and the frame inside them
    const walls: THREE.Mesh[] = [];
    const frameMatrices: THREE.Matrix4[] = [];
    const windowMatrices: THREE.Matrix4[] = [];
    let top = 0;
    for (const box of plan.boxes) {
      const y0 = base + (box.y ?? 0);
      const at = new THREE.Vector3(box.x ?? 0, y0, box.z ?? 0);
      const g = keep(new THREE.BoxGeometry(box.w, box.h, box.d).translate(0, box.h / 2, 0));
      const wall = new THREE.Mesh(g, wallMat);
      wall.position.copy(at);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.userData.key = b.key;
      group.add(wall);
      walls.push(wall);
      addEdges(g, at);
      top = Math.max(top, y0 + box.h);

      // posts every ~0.6 round the perimeter, beams at every storey
      const post = 0.07;
      const nx = Math.max(1, Math.round(box.w / 0.6)), nz = Math.max(1, Math.round(box.d / 0.6));
      const ring: Array<[number, number]> = [];
      for (let k = 0; k <= nx; k++) ring.push([-box.w / 2 + (box.w * k) / nx, -box.d / 2], [-box.w / 2 + (box.w * k) / nx, box.d / 2]);
      for (let k = 1; k < nz; k++) ring.push([-box.w / 2, -box.d / 2 + (box.d * k) / nz], [box.w / 2, -box.d / 2 + (box.d * k) / nz]);
      const floors = Math.max(1, Math.round(box.h / STOREY));
      for (let f = 0; f < floors; f++) {
        const fy = y0 + (box.h * f) / floors, fh = box.h / floors;
        for (const [px, pz] of ring) frameMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(at.x + px, fy + fh / 2, at.z + pz), new THREE.Quaternion(), new THREE.Vector3(post, fh, post)));
        const by = fy + fh;
        for (const s of [-1, 1]) {
          frameMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(at.x, by, at.z + (s * box.d) / 2), new THREE.Quaternion(), new THREE.Vector3(box.w, post, post)));
          frameMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(at.x + (s * box.w) / 2, by, at.z), new THREE.Quaternion(), new THREE.Vector3(post, post, box.d)));
        }
        // windows on all four faces, one row per storey
        if (box.h >= 0.6) {
          const wy = fy + fh * 0.55;
          const cols = (len: number) => Math.max(1, Math.floor(len / 0.55));
          for (const [len, face] of [[box.w, "z"], [box.d, "x"]] as const) {
            const n = cols(len);
            for (let c = 0; c < n; c++) {
              const along = -len / 2 + (len * (c + 0.5)) / n;
              for (const s of [-1, 1]) {
                const pos = face === "z" ? new THREE.Vector3(at.x + along, wy, at.z + s * (box.d / 2 + 0.005)) : new THREE.Vector3(at.x + s * (box.w / 2 + 0.005), wy, at.z + along);
                const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face === "z" ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2));
                windowMatrices.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(0.24, Math.min(0.34, fh * 0.5), 1)));
              }
            }
          }
        }
      }
    }
    // the frame rises bottom-up
    frameMatrices.sort((a, b2) => new THREE.Vector3().setFromMatrixPosition(a).y - new THREE.Vector3().setFromMatrixPosition(b2).y);
    const frame = new THREE.InstancedMesh(unitBox, timber, frameMatrices.length);
    frameMatrices.forEach((m, k) => frame.setMatrixAt(k, m));
    frame.castShadow = true;
    frame.count = 0;
    group.add(frame);

    const windows = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(1, 1)), windowMat, windowMatrices.length);
    windowMatrices.forEach((m, k) => windows.setMatrixAt(k, m));
    windows.visible = false;
    group.add(windows);

    const caps: THREE.Object3D[] = [];
    for (const c of plan.caps) {
      const g = keep(capGeometry(c));
      const at = new THREE.Vector3(c.x ?? 0, base + c.y, c.z ?? 0);
      const m = new THREE.Mesh(g, c.kind === "flag" ? steel : capMat);
      m.position.copy(at);
      m.castShadow = true;
      m.userData.key = b.key;
      group.add(m);
      caps.push(m);
      if (c.kind !== "flag") addEdges(g, at);
      top = Math.max(top, at.y + c.h);
    }

    const lineGeo = keep(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3)));
    const lines = new THREE.LineSegments(lineGeo, blueprintMat.clone());
    keep(lines.material as THREE.Material);
    group.add(lines);

    const glow = new THREE.PointLight(new THREE.Color(b.accent).lerp(new THREE.Color("#ffcf8a"), 0.6), 0, 7, 1.6);
    glow.position.set(fx, top * 0.5, fz + fd / 2 + 1.2);
    group.add(glow);

    // a crane over every building still under construction
    let crane: THREE.Group | null = null;
    if (b.final === 3) {
      crane = new THREE.Group();
      const ch = top + 2.2;
      const mast = new THREE.Mesh(unitBox, steel);
      mast.scale.set(0.16, ch, 0.16);
      mast.position.set(0, ch / 2, 0);
      const jib = new THREE.Mesh(unitBox, steel);
      jib.scale.set(4.2, 0.12, 0.12);
      jib.position.set(1.2, ch, 0);
      const cable = new THREE.Mesh(unitBox, steel);
      cable.scale.set(0.02, 1.4, 0.02);
      cable.position.set(2.8, ch - 0.7, 0);
      const load = new THREE.Mesh(unitBox, timber);
      load.scale.set(0.5, 0.18, 0.18);
      load.position.set(2.8, ch - 1.45, 0);
      crane.add(mast, jib, cable, load);
      crane.position.set(fx - fw / 2 - 0.5, 0, fz - fd / 2 - 0.5);
      crane.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      crane.visible = false;
      group.add(crane);
    }

    // the label: a real button, so the city opens by keyboard and screen reader too
    const el = document.createElement("button");
    el.type = "button";
    el.className = `city3d-label ${b.final === 5 ? "built" : b.final === 3 ? "unbuilt" : "locked"}`;
    el.dataset.testid = `building-${b.key}`;
    el.setAttribute("aria-label", `${b.name}: ${b.status}`);
    el.innerHTML = `<span class="city3d-name"></span><span class="city3d-status"></span>`;
    (el.firstChild as HTMLElement).textContent = b.name;
    (el.lastChild as HTMLElement).textContent = b.status;
    el.style.setProperty("--accent", b.accent);
    el.addEventListener("click", (e) => opts.onOpen(b.key, { currentTarget: e.currentTarget as Element }));
    const label = new CSS2DObject(el);
    label.position.set(fx, top + (crane ? 2.6 : 0.6), fz);
    group.add(label);

    return { b, group, lines, lineCount: linePos.length / 3, grid, slab, frame, frameCount: frameMatrices.length, walls, caps, windowMat, windows, glow, crane, delay: i * STAGGER, top };
  });

  // ------------------------------------------------------------------------------------------ the build
  // p runs from 0 to the building's final stage: 0–1 blueprint, 1–2 foundation, 2–3 frame, 3–4 walls, 4–5 lit
  function apply(x: Built, p: number) {
    const s = (k: number) => clamp01(p - k);
    const bp = s(0), fo = s(1), fr = s(2), wa = s(3), li = s(4);
    x.lines.geometry.setDrawRange(0, Math.floor(x.lineCount * ease(bp) / 2) * 2);
    (x.lines.material as THREE.LineBasicMaterial).opacity = 0.95 * (1 - 0.85 * ease(wa));
    x.grid.visible = bp > 0 && wa < 1;
    x.slab.visible = fo > 0;
    x.slab.scale.set(1, Math.max(0.001, ease(fo)), 1);
    x.frame.count = Math.floor(x.frameCount * ease(fr));
    x.frame.visible = fr > 0 && wa < 1;
    for (const w of x.walls) {
      w.visible = wa > 0;
      w.scale.y = Math.max(0.001, ease(wa));
    }
    for (const c of x.caps) {
      c.visible = li > 0;
      c.scale.setScalar(Math.max(0.001, ease(li * 1.6)));
    }
    x.windows.visible = li > 0;
    x.windowMat.emissiveIntensity = 1.5 * ease(li);
    x.glow.intensity = 9 * ease(li);
    if (x.crane) x.crane.visible = fr > 0;
  }

  const finished = built.map((x) => x.delay + x.b.final * STAGE_SECONDS);
  const total = Math.max(...finished);
  // the intro's clock runs on drawn frames: it starts when the first frame is drawn, and a slow frame
  // counts as at most 1/20 s, so a slow device still sees every stage instead of only the end
  let clock = 0;
  let last = 0;
  let lastStage = -1;
  let done = false;
  function progressAt(seconds: number) {
    let stage = 0;
    for (const x of built) {
      const p = Math.min(x.b.final, Math.max(0, (seconds - x.delay) / STAGE_SECONDS));
      apply(x, p);
      stage = Math.max(stage, Math.min(4, Math.floor(p)));
    }
    return stage;
  }

  // ------------------------------------------------------------------------------------------ the camera
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, 0.6);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 48;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.enablePan = false;
  controls.autoRotateSpeed = 0.45;
  controls.enabled = false;
  disposables.push(controls);
  // the fly-in: from high and wide, sweeping round and down to the city's front
  const fly = (t: number) => {
    const k = ease(t);
    // a portrait screen stands further back, so the whole city fits across it
    const back = camera.aspect < 0.9 ? 1.55 : 1;
    const angle = -2.4 + 2.15 * k, radius = (34 - 11.5 * k) * back, height = (22 - 11.5 * k) * back;
    camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    camera.lookAt(controls.target);
  };
  let userMoved = false;
  controls.addEventListener("start", () => { userMoved = true; controls.autoRotate = false; });

  // clicking a building opens its portal (a drag to look around doesn't)
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(built.flatMap((x) => [...x.walls, ...x.caps]), false)[0];
    const key = hit?.object.userData.key as string | undefined;
    const label = key ? host.querySelector<HTMLElement>(`[data-testid="building-${key}"]`) : null;
    if (key && label) opts.onOpen(key, { currentTarget: label });
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // ------------------------------------------------------------------------------------------ the loop
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
  io.observe(host);
  let raf = 0;
  const still = opts.reducedMotion;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const now = performance.now();
    if (last) clock += Math.min(0.05, (now - last) / 1000);
    last = now;
    const seconds = still ? total : clock;
    if (!done) {
      const stage = progressAt(seconds);
      if (!userMoved) fly(clamp01(seconds / (total + 0.8)));
      const nowDone = seconds >= total;
      if (stage !== lastStage || nowDone) {
        lastStage = stage;
        opts.onStage?.(stage, nowDone);
      }
      if (nowDone) {
        done = true;
        controls.enabled = true;
        controls.autoRotate = !still && !userMoved;
      }
    }
    if (done || userMoved) controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    labels.setSize(w, h);
    camera.aspect = w / h;
    // on a narrow screen, stand further back so the whole city fits
    camera.fov = w / h < 0.9 ? 50 : 42;
    camera.updateProjectionMatrix();
  }
  resize();
  fly(still ? 1 : 0);
  // let a drag work during the fly-in too: hand the camera over at once
  controls.enabled = true;
  frame();

  return {
    replay() {
      clock = 0;
      last = 0;
      done = false;
      lastStage = -1;
      userMoved = false;
      controls.autoRotate = false;
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      for (const d of disposables) d.dispose();
      for (const x of built) { x.frame.dispose(); x.windows.dispose(); }
      far.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // non-indexed position + normal only: enough for the small caps
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const p of flat) n += p.getAttribute("position").count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of flat) {
    pos.set(p.getAttribute("position").array as Float32Array, o * 3);
    nor.set(p.getAttribute("normal").array as Float32Array, o * 3);
    o += p.getAttribute("position").count;
  }
  for (const p of [...parts, ...flat]) p.dispose();
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)).setAttribute("normal", new THREE.BufferAttribute(nor, 3));
}
