// A client's own operating board in 3D, drawn from its records (layout.ts):
//   * pieces confirmed by evidence are solid obsidian; pieces the business
//     only described are glass, until evidence confirms them;
//   * each flow travels from piece to piece in step order; a step that exists
//     only in the founder's head glows amber at the founder;
//   * each objective is a glass column filled to its latest measured value,
//     with a ring on the target line. An unmeasured objective stays empty.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { isSoftwareRenderer, lathe, PROFILES, RoundedTile } from "./kit";
import { FOUNDER_KEY, type BoardLayout, type Tile } from "./layout";

const BLUE = new THREE.Color("#7fb2ff");
const AMBER = new THREE.Color("#ffb04a");
const COLUMN_H = 2.2; // the target line sits here
const tileAt = ([x, z]: Tile, y = 0) => new THREE.Vector3(x - 3.5, y, z - 3.5);

export interface ClientBoard {
  highlight(flowId: string | null): void;
  resize(): void;
  dispose(): void;
}

export function createClientBoard(host: HTMLElement, layout: BoardLayout, opts: { reducedMotion: boolean }): ClientBoard {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = "bw-labels";
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#070a10");
  scene.fog = new THREE.Fog("#070a10", 18, 36);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.42;
  scene.add(new THREE.HemisphereLight("#c9d6ff", "#05070b", 0.35));
  const key = new THREE.DirectionalLight("#ffffff", 1.5);
  key.position.set(6, 10, 4);
  scene.add(key);
  const rim = new THREE.PointLight("#7fb2ff", 16, 18, 1.6);
  rim.position.set(-5, 3, -5);
  scene.add(rim);

  // Without a graphics chip, draw only when something changes.
  const still = opts.reducedMotion || isSoftwareRenderer(renderer);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(5.4, 6.6, 7.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.1, -1);
  controls.enableDamping = !still;
  controls.autoRotate = !still;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 7;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.enablePan = false;

  const disposables: Array<{ dispose(): void }> = [envTex, pmrem, controls];
  const mat = <M extends THREE.Material>(m: M) => (disposables.push(m), m);
  const geo = <G extends THREE.BufferGeometry>(g: G) => (disposables.push(g), g);

  // ---------------------------------------------------------------- board
  const dark = mat(new THREE.MeshPhysicalMaterial({ color: "#0b0f16", metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 }));
  const silver = mat(new THREE.MeshPhysicalMaterial({ color: "#6f7885", metalness: 1, roughness: 0.4, clearcoat: 0.5 }));
  const tileGeo = geo(new RoundedTile(0.97, 0.14, 0.97));
  for (let x = 0; x < 8; x++) {
    for (let z = 0; z < 8; z++) {
      const t = new THREE.Mesh(tileGeo, (x + z) % 2 ? silver : dark);
      t.position.copy(tileAt([x, z], -0.07));
      scene.add(t);
    }
  }
  const base = new THREE.Mesh(geo(new THREE.BoxGeometry(8.6, 0.22, 8.6)), mat(new THREE.MeshPhysicalMaterial({ color: "#11151c", metalness: 0.9, roughness: 0.28, clearcoat: 1 })));
  base.position.y = -0.2;
  scene.add(base);

  // ---------------------------------------------------------------- pieces
  const chrome = mat(new THREE.MeshPhysicalMaterial({ color: "#e4e8ee", metalness: 1, roughness: 0.14, clearcoat: 1 }));
  const obsidian = mat(new THREE.MeshPhysicalMaterial({ color: "#161b24", metalness: 0.9, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const glass = mat(new THREE.MeshPhysicalMaterial({ color: "#bcd3ff", metalness: 0, roughness: 0.08, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false }));
  const ghost = mat(new THREE.MeshPhysicalMaterial({ color: "#8a94a3", metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.55 }));
  const edgeMat = mat(new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.45 }));
  const ringMat = mat(new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ringGeo = geo(new THREE.TorusGeometry(0.42, 0.016, 10, 64));
  const shapes = new Map<string, THREE.LatheGeometry>();
  const shapeGeo = (s: string) => shapes.get(s) ?? (shapes.set(s, geo(lathe(PROFILES[s]!))), shapes.get(s)!);

  const tops = new Map<string, THREE.Vector3>();
  for (const p of layout.pieces) {
    const at = tileAt(p.tile);
    const founder = p.key === FOUNDER_KEY;
    const material = founder ? chrome : p.basis === "observed" ? obsidian : p.basis === "stated" ? glass : ghost;
    const m = new THREE.Mesh(shapeGeo(p.shape), material);
    m.position.copy(at);
    if (founder) m.scale.setScalar(1.15);
    scene.add(m);
    if (p.basis === "stated") {
      const edges = new THREE.LineSegments(geo(new THREE.EdgesGeometry(shapeGeo(p.shape), 25)), edgeMat);
      edges.position.copy(at);
      scene.add(edges);
    }
    if (p.basis === "observed") {
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.rotation.x = -Math.PI / 2;
      r.position.copy(at).setY(0.02);
      scene.add(r);
    }
    const h = PROFILES[p.shape]!.at(-1)![1] * (founder ? 1.15 : 1);
    tops.set(p.key, at.clone().setY(h * 0.75));
    const el = document.createElement("div");
    el.className = `bw-label cb-label cb-${p.basis}${founder ? " bw-label-founder" : ""}`;
    el.textContent = p.label;
    if (p.sub) {
      const sub = document.createElement("span");
      sub.textContent = ` · ${p.sub}`;
      sub.className = "cb-sub";
      el.appendChild(sub);
    }
    el.style.opacity = "1";
    const label = new CSS2DObject(el);
    label.position.copy(at).setY(h + 0.3);
    scene.add(label);
  }
  const founderTop = tops.get(FOUNDER_KEY)!;
  const halo = new THREE.Mesh(geo(new THREE.TorusGeometry(0.6, 0.03, 12, 80)), mat(new THREE.MeshBasicMaterial({
    color: layout.founderOnly ? AMBER : BLUE, transparent: true, opacity: layout.founderOnly ? 0.95 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  halo.rotation.x = -Math.PI / 2;
  halo.position.copy(founderTop).setY(0.03);
  scene.add(halo);

  // ---------------------------------------------------------------- flows
  interface Drawn { id: string; material: THREE.MeshBasicMaterial; curve: THREE.CatmullRomCurve3 | null; markers: THREE.Mesh[]; t: number[] }
  const markerGeo = geo(new THREE.SphereGeometry(0.1, 20, 14));
  const pulseGeo = geo(new THREE.SphereGeometry(0.045, 12, 10));
  const pulseMat = mat(new THREE.MeshBasicMaterial({ color: "#dce8ff", toneMapped: false }));
  const pulses: Array<{ flow: Drawn; mesh: THREE.Mesh; k: number }> = [];
  let beadCount = 0;
  const drawn: Drawn[] = layout.flows.map((f, fi) => {
    const pts: THREE.Vector3[] = [];
    const lift = 0.9 + (fi % 4) * 0.28;
    let prev: THREE.Vector3 | null = null;
    for (const n of f.nodes) {
      const p = tops.get(n.pieceKey)!.clone();
      if (prev && prev.distanceTo(p) < 1e-3) continue;
      if (prev) pts.push(prev.clone().lerp(p, 0.5).setY(Math.max(prev.y, p.y) + lift));
      pts.push(p);
      prev = p;
    }
    const material = mat(new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const curve = pts.length >= 2 ? new THREE.CatmullRomCurve3(pts, false, "centripetal") : null;
    if (curve) scene.add(new THREE.Mesh(geo(new THREE.TubeGeometry(curve, Math.max(48, pts.length * 28), 0.022, 8, false)), material));
    // founder-only steps: amber beads stacked over the founder, one per step
    const markers: THREE.Mesh[] = [];
    f.nodes.filter((n) => n.founderOnly).forEach((_, k) => {
      const m = new THREE.Mesh(markerGeo, mat(new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false, transparent: true })));
      const a = beadCount++ * 2.39996; // golden angle: beads never stack on one side
      m.position.copy(founderTop).add(new THREE.Vector3(Math.cos(a) * 0.62, 0.2 + (beadCount % 5) * 0.2, Math.sin(a) * 0.62));
      scene.add(m);
      markers.push(m);
    });
    const d: Drawn = { id: f.id, material, curve, markers, t: [0, 0.33, 0.66] };
    if (curve) d.t.forEach((_, k) => { const mesh = new THREE.Mesh(pulseGeo, pulseMat); scene.add(mesh); pulses.push({ flow: d, mesh, k }); });
    return d;
  });

  // ---------------------------------------------------------------- objectives
  const colGlass = mat(new THREE.MeshPhysicalMaterial({ color: "#cfe0ff", roughness: 0.05, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  const colGeo = geo(new THREE.CylinderGeometry(0.3, 0.3, COLUMN_H * 1.3, 40, 1, true));
  const fillGeo = geo(new THREE.CylinderGeometry(0.26, 0.26, 1, 40));
  const targetGeo = geo(new THREE.TorusGeometry(0.36, 0.018, 10, 64));
  const targetMat = mat(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
  const n = layout.objectives.length;
  layout.objectives.forEach((o, i) => {
    const x = n === 1 ? 0 : -4 + (8 * i) / (n - 1);
    const at = new THREE.Vector3(x, -0.3, -5.3);
    const col = new THREE.Mesh(colGeo, colGlass);
    col.position.copy(at).setY(-0.3 + (COLUMN_H * 1.3) / 2);
    scene.add(col);
    const ring = new THREE.Mesh(targetGeo, targetMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(at).setY(-0.3 + COLUMN_H);
    scene.add(ring);
    if (o.level !== null) {
      const h = Math.max(0.02, Math.min(1.3, o.level)) * COLUMN_H;
      const fill = new THREE.Mesh(fillGeo, mat(new THREE.MeshBasicMaterial({ color: o.met ? BLUE : AMBER, toneMapped: false })));
      fill.scale.y = h;
      fill.position.copy(at).setY(-0.3 + h / 2);
      scene.add(fill);
    }
    const el = document.createElement("div");
    el.className = `bw-label bw-label-objective${o.level === null ? " cb-unmeasured" : ""}`;
    const [title, ...rest] = o.label.split(" · ");
    el.textContent = title ?? o.label;
    const value = document.createElement("span");
    value.className = "cb-value";
    value.textContent = rest.join(" · ");
    el.appendChild(value);
    el.style.opacity = "1";
    const label = new CSS2DObject(el);
    label.position.copy(at).setY(-0.3 + COLUMN_H * 1.3 + 0.3);
    scene.add(label);
  });

  // ---------------------------------------------------------------- render
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let selected: string | null = null;
  let running = true;
  let visible = true;
  let frameId = 0;
  let dirty = true;
  controls.addEventListener("change", () => { dirty = true; });
  const timer = new THREE.Timer();
  timer.connect(document);
  const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; dirty = true; });
  io.observe(host);

  function frame() {
    if (!running) return;
    frameId = requestAnimationFrame(frame);
    if (!visible || (still && !dirty)) return;
    dirty = false;
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    const time = timer.getElapsed();
    controls.update(dt);
    halo.scale.setScalar(1 + (layout.founderOnly && !still ? Math.sin(time * 3) * 0.05 : 0));
    for (const p of pulses) {
      const f = p.flow;
      if (!still) f.t[p.k] = (f.t[p.k]! + dt * 0.12) % 1;
      f.curve!.getPointAt(f.t[p.k]!, p.mesh.position);
      p.mesh.visible = selected === null || selected === f.id;
    }
    composer.render();
    labels.render(scene, camera);
  }

  const board: ClientBoard = {
    highlight(flowId) {
      selected = flowId;
      dirty = true;
      for (const d of drawn) {
        const on = flowId === null || flowId === d.id;
        d.material.opacity = on ? (flowId ? 1 : 0.55) : 0.05;
        d.markers.forEach((m) => ((m.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.12));
      }
    },
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
      dirty = true;
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frameId);
      io.disconnect();
      timer.dispose();
      disposables.forEach((d) => d.dispose());
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
  board.resize();
  frame();
  return board;
}
