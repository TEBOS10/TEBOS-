// The TEBOS board world: a chessboard of a fictional business, rendered in
// real time. Scrolling moves the camera through the seven stages. Work first
// jams at the founder, then TEBOS assesses and maps the board, re-routes the
// flows, connects the pieces, automates what has a rule, gates what needs a
// person and measures the objective.
//
// Illustrative only: no data from any real business is shown here.
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const STAGE_COUNT = 9; // hero + seven stages + outro

const BLUE = new THREE.Color("#7fb2ff");
const AMBER = new THREE.Color("#ffb04a");
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const seg = (p: number, a: number, b: number) => smooth((p - a) / (b - a));

type Profile = Array<[number, number]>;
const PROFILES: Record<string, Profile> = {
  pawn: [[0, 0], [0.34, 0], [0.34, 0.07], [0.26, 0.11], [0.22, 0.16], [0.13, 0.34], [0.11, 0.44], [0.18, 0.48], [0.1, 0.52], [0.16, 0.58], [0.18, 0.66], [0.15, 0.74], [0.08, 0.79], [0, 0.8]],
  rook: [[0, 0], [0.36, 0], [0.36, 0.08], [0.28, 0.12], [0.24, 0.18], [0.2, 0.62], [0.28, 0.66], [0.28, 0.86], [0.2, 0.86], [0.2, 0.8], [0, 0.8]],
  bishop: [[0, 0], [0.34, 0], [0.34, 0.07], [0.26, 0.11], [0.2, 0.18], [0.12, 0.58], [0.2, 0.62], [0.1, 0.66], [0.17, 0.78], [0.14, 0.92], [0.06, 1.0], [0.08, 1.04], [0, 1.08]],
  king: [[0, 0], [0.4, 0], [0.4, 0.08], [0.3, 0.13], [0.24, 0.22], [0.15, 0.78], [0.26, 0.83], [0.14, 0.88], [0.2, 1.05], [0.24, 1.18], [0.12, 1.24], [0, 1.25]],
};

function lathe(profile: Profile) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  g.computeVertexNormals();
  return g;
}

interface Piece { key: string; label: string; kind: keyof typeof PROFILES; tile: [number, number] }

// The fictional business's pieces. The founder stands in the middle of it all.
const PIECES: Piece[] = [
  { key: "founder", label: "Founder", kind: "king", tile: [3, 4] },
  { key: "website", label: "Website · web studio", kind: "rook", tile: [0, 1] },
  { key: "inbox", label: "Inbox", kind: "pawn", tile: [1, 6] },
  { key: "crm", label: "CRM", kind: "bishop", tile: [6, 1] },
  { key: "team", label: "Delivery team", kind: "pawn", tile: [6, 6] },
  { key: "accounts", label: "Accounting", kind: "rook", tile: [7, 4] },
  { key: "client", label: "Client", kind: "bishop", tile: [2, 0] },
];

// How work moves: [from, to]. Before TEBOS, every flow passes through the founder.
const FLOWS: Array<[string, string]> = [
  ["website", "crm"], ["client", "inbox"], ["inbox", "team"], ["crm", "accounts"], ["team", "client"], ["crm", "team"],
];
const PULSES_PER_FLOW = 5;

const tilePos = ([x, z]: [number, number], y = 0) => new THREE.Vector3(x - 3.5, y, z - 3.5);

// Camera keyframes, one per stage: [position, target].
const SHOTS: Array<[THREE.Vector3, THREE.Vector3]> = [
  [new THREE.Vector3(8.5, 7.2, 9.5), new THREE.Vector3(-2.4, 0.2, 0.4)], // hero: the founder is the middleware
  [new THREE.Vector3(0.01, 13, 5), new THREE.Vector3(0, 0, 0)], // assess
  [new THREE.Vector3(-7, 5.5, 6.5), new THREE.Vector3(0, 0.4, 0)], // map
  [new THREE.Vector3(4.2, 5.2, 7.4), new THREE.Vector3(-1.2, 0.5, 0.2)], // architect
  [new THREE.Vector3(9, 4.2, -2.5), new THREE.Vector3(0, 0.3, 0)], // integrate
  [new THREE.Vector3(0, 4.6, 10), new THREE.Vector3(0, 0.3, 0)], // automate
  [new THREE.Vector3(-4.5, 2.6, 4.8), new THREE.Vector3(1, 0.8, -0.8)], // govern
  [new THREE.Vector3(0.6, 3.4, 11.5), new THREE.Vector3(-3.4, 1.1, 2.4)], // optimise
  [new THREE.Vector3(0.01, 15, 12), new THREE.Vector3(0, -0.4, 0)], // outro
];

export interface BoardWorld {
  setProgress(p: number): void;
  resize(): void;
  dispose(): void;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createBoardWorld(host: HTMLElement, opts: { reducedMotion: boolean; snap?: boolean }): BoardWorld {
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = "bw-labels";
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#05070b");
  scene.fog = new THREE.Fog("#05070b", 16, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 38, 1, 0.1, 100);
  camera.position.copy(SHOTS[0]![0]);
  const lookAt = SHOTS[0]![1].clone();

  // light: a cool key, a soft rim, and the environment's reflections
  scene.add(new THREE.HemisphereLight("#c9d6ff", "#05070b", 0.35));
  const key = new THREE.DirectionalLight("#ffffff", 1.6);
  key.position.set(6, 10, 4);
  scene.add(key);
  const rim = new THREE.PointLight("#7fb2ff", 18, 18, 1.6);
  rim.position.set(-5, 3, -5);
  scene.add(rim);

  const disposables: Array<{ dispose(): void }> = [envTex, pmrem];
  const mat = <M extends THREE.Material>(m: M) => (disposables.push(m), m);
  const geo = <G extends THREE.BufferGeometry>(g: G) => (disposables.push(g), g);

  // ---------------------------------------------------------------- the board
  const board = new THREE.Group();
  scene.add(board);
  const dark = mat(new THREE.MeshPhysicalMaterial({ color: "#0b0f16", metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 }));
  const silver = mat(new THREE.MeshPhysicalMaterial({ color: "#7d8795", metalness: 1, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  const tileGeo = geo(new RoundedTile(0.97, 0.14, 0.97));
  for (let x = 0; x < 8; x++) {
    for (let z = 0; z < 8; z++) {
      const t = new THREE.Mesh(tileGeo, (x + z) % 2 ? silver : dark);
      t.position.copy(tilePos([x, z], -0.07));
      board.add(t);
    }
  }
  const rimFrame = new THREE.Mesh(geo(new THREE.BoxGeometry(8.6, 0.22, 8.6)), mat(new THREE.MeshPhysicalMaterial({ color: "#11151c", metalness: 0.9, roughness: 0.28, clearcoat: 1 })));
  rimFrame.position.y = -0.2;
  board.add(rimFrame);
  const floor = new THREE.Mesh(geo(new THREE.CircleGeometry(40, 64)), mat(new THREE.MeshStandardMaterial({ color: "#06080d", metalness: 0.9, roughness: 0.45 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.32;
  scene.add(floor);

  // the map: tile edges light up once the board is mapped
  const gridMat = mat(new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0 }));
  const gridPts: number[] = [];
  for (let i = 0; i <= 8; i++) {
    gridPts.push(i - 4, 0.005, -4, i - 4, 0.005, 4, -4, 0.005, i - 4, 4, 0.005, i - 4);
  }
  const grid = new THREE.LineSegments(geo(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3))), gridMat);
  scene.add(grid);

  // ---------------------------------------------------------------- pieces
  const chrome = mat(new THREE.MeshPhysicalMaterial({ color: "#e4e8ee", metalness: 1, roughness: 0.14, clearcoat: 1 }));
  const obsidian = mat(new THREE.MeshPhysicalMaterial({ color: "#161b24", metalness: 0.9, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const pieceTop = new Map<string, THREE.Vector3>();
  const labelEls: HTMLElement[] = [];
  const ringMat = mat(new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ringGeo = geo(new THREE.TorusGeometry(0.44, 0.018, 12, 64));
  const rings: THREE.Mesh[] = [];
  for (const p of PIECES) {
    const g = geo(lathe(PROFILES[p.kind]!));
    const m = new THREE.Mesh(g, p.key === "founder" ? chrome : obsidian);
    const at = tilePos(p.tile, 0);
    m.position.copy(at);
    if (p.key === "founder") {
      m.scale.setScalar(1.15);
      const cross = new THREE.Mesh(geo(new THREE.BoxGeometry(0.06, 0.26, 0.06)), chrome);
      cross.position.y = 1.36;
      const bar = new THREE.Mesh(geo(new THREE.BoxGeometry(0.2, 0.06, 0.06)), chrome);
      bar.position.y = 1.38;
      m.add(cross, bar);
    }
    board.add(m);
    const height = (PROFILES[p.kind]!.at(-1)![1]) * (p.key === "founder" ? 1.15 : 1);
    pieceTop.set(p.key, at.clone().setY(height * 0.72));
    if (p.key !== "founder") {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(at).setY(0.02);
      scene.add(ring);
      rings.push(ring);
    }
    const el = document.createElement("div");
    el.className = `bw-label${p.key === "founder" ? " bw-label-founder" : ""}`;
    el.textContent = p.label;
    const lbl = new CSS2DObject(el);
    lbl.position.copy(at).setY(height * (p.key === "founder" ? 1.15 : 1) + 0.35);
    scene.add(lbl);
    labelEls.push(el);
  }
  const founder = pieceTop.get("founder")!;
  const halo = new THREE.Mesh(geo(new THREE.TorusGeometry(0.62, 0.03, 12, 80)), mat(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
  halo.rotation.x = -Math.PI / 2;
  halo.position.copy(founder).setY(0.03);
  scene.add(halo);

  // ---------------------------------------------------------------- flows
  interface Flow { line: THREE.Line; via: THREE.Vector3[]; direct: THREE.Vector3[]; curve: THREE.CatmullRomCurve3; t: number[] }
  const flowMat = mat(new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flows: Flow[] = FLOWS.map(([a, b], i) => {
    const A = pieceTop.get(a)!, B = pieceTop.get(b)!;
    const mid = A.clone().lerp(B, 0.5);
    const lift = 1.1 + (i % 3) * 0.35;
    const via = [A.clone(), A.clone().lerp(founder, 0.5).setY(lift + 0.5), founder.clone().setY(founder.y + 0.55), founder.clone().lerp(B, 0.5).setY(lift + 0.5), B.clone()];
    const direct = [A.clone(), A.clone().lerp(mid, 0.5).setY(lift), mid.clone().setY(lift + 0.35), mid.clone().lerp(B, 0.5).setY(lift), B.clone()];
    const curve = new THREE.CatmullRomCurve3(via.map((v) => v.clone()), false, "centripetal");
    const line = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(curve.getPoints(90))), flowMat);
    scene.add(line);
    return { line, via, direct, curve, t: Array.from({ length: PULSES_PER_FLOW }, (_, k) => k / PULSES_PER_FLOW) };
  });
  const pulseMat = mat(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
  const pulses = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.045, 16, 12)), pulseMat, FLOWS.length * PULSES_PER_FLOW);
  pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pulses);

  // the scan: a sheet of light sweeping the board
  const scanMat = mat(new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const scan = new THREE.Mesh(geo(new THREE.PlaneGeometry(8.4, 1.6)), scanMat);
  scan.rotation.y = Math.PI / 2;
  scene.add(scan);

  // the gate: consequential moves pass a person's approval
  const gateAt = flows[3]!.direct[2]!.clone();
  const gate = new THREE.Mesh(geo(new THREE.TorusGeometry(0.5, 0.035, 16, 96)), mat(new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
  gate.position.copy(gateAt);
  const dir = flows[3]!.direct[3]!.clone().sub(flows[3]!.direct[1]!).normalize();
  gate.lookAt(gateAt.clone().add(dir));
  scene.add(gate);
  const gateEl = document.createElement("div");
  gateEl.className = "bw-label bw-label-gate";
  gateEl.textContent = "Approved by a person";
  const gateLabel = new CSS2DObject(gateEl);
  gateLabel.position.copy(gateAt).setY(gateAt.y + 0.8);
  scene.add(gateLabel);

  // the objective: a glass column filling toward its target
  const objAt = new THREE.Vector3(-5.2, 0, 4.6);
  const column = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.34, 0.34, 2.6, 48, 1, true)), mat(new THREE.MeshPhysicalMaterial({ color: "#cfe0ff", metalness: 0, roughness: 0.05, transparent: true, opacity: 0.1, side: THREE.DoubleSide })));
  column.position.copy(objAt).setY(1.3 - 0.3);
  scene.add(column);
  const fillMat = mat(new THREE.MeshBasicMaterial({ color: BLUE, toneMapped: false }));
  const fill = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.3, 0.3, 1, 48)), fillMat);
  fill.position.copy(objAt);
  scene.add(fill);
  const targetRing = new THREE.Mesh(geo(new THREE.TorusGeometry(0.4, 0.02, 12, 64)), mat(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })));
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.copy(objAt).setY(-0.3 + 2.6 * 0.8);
  scene.add(targetRing);
  const objEl = document.createElement("div");
  objEl.className = "bw-label bw-label-objective";
  const objLabel = new CSS2DObject(objEl);
  objLabel.position.copy(objAt).setY(2.75);
  scene.add(objLabel);

  // ---------------------------------------------------------------- post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------------------------------------------------------------- loop
  let target = 0; // scroll progress, 0..STAGE_COUNT-1
  let progress = 0;
  const pointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => pointer.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
  window.addEventListener("pointermove", onPointer, { passive: true });

  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const timer = new THREE.Timer();
  timer.connect(document);
  let frameId = 0;
  let lastArchitect = -1;
  let running = true;

  function shot(p: number) {
    const i = Math.min(SHOTS.length - 2, Math.floor(p));
    const f = smooth(p - i);
    desiredPos.lerpVectors(SHOTS[i]![0], SHOTS[i + 1]![0], f);
    desiredLook.lerpVectors(SHOTS[i]![1], SHOTS[i + 1]![1], f);
    if (mobile) desiredPos.multiplyScalar(1.28);
  }

  function frame() {
    if (!running) return;
    frameId = requestAnimationFrame(frame);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    const time = timer.getElapsed();
    const follow = opts.reducedMotion || opts.snap;
    progress += (target - progress) * (follow ? 1 : 1 - Math.exp(-dt * 3.2));
    const p = progress;

    // camera
    shot(p);
    if (!opts.reducedMotion) {
      desiredPos.x += Math.sin(time * 0.18) * 0.25 + pointer.x * 0.9;
      desiredPos.y += pointer.y * -0.5;
    }
    camera.position.lerp(desiredPos, follow ? 1 : 1 - Math.exp(-dt * 4));
    lookAt.lerp(desiredLook, follow ? 1 : 1 - Math.exp(-dt * 4));
    camera.lookAt(lookAt);

    // stage values
    const scanning = seg(p, 0.55, 0.9) * (1 - seg(p, 1.45, 1.8));
    const mapped = seg(p, 1.55, 2.1);
    const architect = seg(p, 2.5, 3.3);
    const integrate = seg(p, 3.5, 4.1);
    const automate = seg(p, 4.5, 5.1);
    const govern = seg(p, 5.5, 6.1);
    const optimise = seg(p, 6.3, 6.95);

    scan.position.set(THREE.MathUtils.lerp(-4.5, 4.5, clamp01((p - 0.6) / 1.1)), 0.8, 0);
    scanMat.opacity = 0.22 * scanning;
    gridMat.opacity = 0.35 * mapped;
    labelEls.forEach((el, i) => { el.style.opacity = String(i === 0 ? Math.max(0.9 * (1 - seg(p, 0.4, 0.8)), mapped) : mapped); });
    halo.material.opacity = 0.85 * (1 - architect) + 0.08;
    (halo.material as THREE.MeshBasicMaterial).color.copy(AMBER).lerp(BLUE, architect);
    halo.scale.setScalar(1 + Math.sin(time * 3) * 0.04 * (1 - architect));
    ringMat.opacity = 0.9 * integrate;
    rings.forEach((r, i) => r.scale.setScalar(1 + Math.sin(time * 2 + i) * 0.05 * integrate));
    (gate.material as THREE.MeshBasicMaterial).opacity = govern;
    gate.scale.setScalar(0.6 + 0.4 * govern);
    gateEl.style.opacity = String(govern * (1 - seg(p, 7.4, 7.9)));
    const level = 0.3 + 0.55 * optimise; // share of the column
    fill.scale.y = 2.6 * level;
    fill.position.y = -0.3 + (2.6 * level) / 2;
    const met = level >= 0.8;
    fillMat.color.copy(met ? BLUE : AMBER).lerp(BLUE, met ? 1 : optimise * 0.6);
    objEl.textContent = met ? "Objective met · measured" : "Objective · measured, not typed";
    objEl.style.opacity = String(Math.max(seg(p, 6.2, 6.6), 0));
    flowMat.color.copy(AMBER).lerp(BLUE, architect);
    flowMat.opacity = 0.35 + 0.35 * integrate;

    // flows morph from "through the founder" to direct, and carry work
    const visible = 2 + Math.round(3 * automate);
    const speed = 0.08 + 0.22 * automate;
    col.copy(AMBER).lerp(BLUE, architect);
    const reshape = Math.abs(architect - lastArchitect) > 1e-4;
    lastArchitect = architect;
    flows.forEach((f, fi) => {
      if (reshape) {
        f.curve.points.forEach((pt, k) => pt.lerpVectors(f.via[k]!, f.direct[k]!, architect));
        f.curve.updateArcLengths();
        (f.line.geometry as THREE.BufferGeometry).setFromPoints(f.curve.getPoints(90));
      }
      f.t.forEach((t, k) => {
        // before TEBOS, work queues at the founder
        const jam = (1 - architect) * Math.exp(-((t - 0.5) ** 2) / 0.006);
        const next = opts.reducedMotion ? t : (t + dt * speed * (1 - 0.85 * jam)) % 1;
        f.t[k] = next;
        const on = k < visible;
        f.curve.getPointAt(next, tmp);
        const s = on ? 1 + 0.6 * jam : 0;
        m4.makeScale(s, s, s).setPosition(tmp);
        pulses.setMatrixAt(fi * PULSES_PER_FLOW + k, m4);
        pulses.setColorAt(fi * PULSES_PER_FLOW + k, col);
      });
    });
    pulses.instanceMatrix.needsUpdate = true;
    if (pulses.instanceColor) pulses.instanceColor.needsUpdate = true;
    board.rotation.y = opts.reducedMotion ? 0 : Math.sin(time * 0.1) * 0.02;

    composer.render();
    labels.render(scene, camera);
  }

  const world: BoardWorld = {
    setProgress(p) { target = Math.max(0, Math.min(STAGE_COUNT - 1, p)); },
    resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      labels.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frameId);
      timer.dispose();
      window.removeEventListener("pointermove", onPointer);
      disposables.forEach((d) => d.dispose());
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
  world.resize();
  frame();
  return world;
}

// A tile with softened edges: a box whose top face is slightly bevelled.
class RoundedTile extends THREE.ExtrudeGeometry {
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
