// The structure: glass and brushed-steel modules drift in from scattered positions and lock into one architecture,
// lit like a studio product shot. TEBOS's idea shown rather than told: a business that runs on structure. Purely
// decorative: it shows no data, clients or results. Only drawn on a graphics chip, without reduced motion
// (see support.ts); everyone else sees the CSS light behind the same panel.
import {
  ACESFilmicToneMapping, AmbientLight, CanvasTexture, Color, DirectionalLight, FogExp2, Group, MathUtils, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Scene,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

interface Module {
  mesh: Mesh;
  home: Vector3;
  from: Vector3;
  spin: Vector3;
  delay: number;
  lift: number;
}

// A stepped tower of modules, wider at the base: the architecture the pieces settle into.
function layout(): Array<{ pos: Vector3; glass: boolean; size: [number, number, number] }> {
  const out: Array<{ pos: Vector3; glass: boolean; size: [number, number, number] }> = [];
  const tiers = [
    { n: 3, y: 0, s: 1.15 },
    { n: 2, y: 1.2, s: 1.05 },
    { n: 2, y: 2.3, s: 0.9 },
    { n: 1, y: 3.3, s: 0.85 },
  ];
  let k = 0;
  for (const t of tiers) {
    const off = ((t.n - 1) * t.s) / 2;
    for (let x = 0; x < t.n; x++) {
      for (let z = 0; z < t.n; z++) {
        const glass = (x + z + k) % 3 === 0;
        const h = glass ? t.s * 0.96 : t.s * 0.96;
        out.push({ pos: new Vector3(x * t.s - off, t.y + h / 2, z * t.s - off), glass, size: [t.s * 0.96, h, t.s * 0.96] });
      }
    }
    k++;
  }
  return out;
}

// A soft round shadow under the structure, painted once.
function shadowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, "rgba(0,0,0,0.75)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new CanvasTexture(c);
}

export function mountStructure(host: HTMLElement, opts: { onReady?: () => void } = {}): () => void {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.fog = new FogExp2(new Color("#060607"), 0.045);
  const pmrem = new PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.55;

  const camera = new PerspectiveCamera(32, 1, 0.1, 100);

  scene.add(new AmbientLight(0xbfc8ff, 0.12));
  const key = new DirectionalLight(0xfff4e8, 2.4);
  key.position.set(5, 8, 6);
  scene.add(key);
  const rim = new PointLight(0x7fa8ff, 40, 30, 2);
  rim.position.set(-6, 4, -5);
  scene.add(rim);
  const under = new PointLight(0xd7c9ff, 12, 12, 2);
  under.position.set(2, 0.5, 4);
  scene.add(under);

  const steel = new MeshPhysicalMaterial({ color: new Color("#a9afba"), metalness: 1, roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.25 });
  const dark = new MeshPhysicalMaterial({ color: new Color("#1a1c21"), metalness: 0.85, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const glass = new MeshPhysicalMaterial({
    color: new Color("#dfe7ff"), metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.8, ior: 1.45,
    attenuationColor: new Color("#9fb7ff"), attenuationDistance: 2.5, clearcoat: 1, clearcoatRoughness: 0.05,
  });

  const structure = new Group();
  scene.add(structure);

  const modules: Module[] = layout().map((m, i) => {
    const geo = new RoundedBoxGeometry(m.size[0], m.size[1], m.size[2], 4, 0.06);
    const mat = m.glass ? glass : i % 4 === 1 ? dark : steel;
    const mesh = new Mesh(geo, mat);
    // each piece starts scattered, turned, and settles into place in turn
    const dir = new Vector3(Math.sin(i * 2.4) * 1, 0.4 + ((i * 7) % 5) / 6, Math.cos(i * 2.4) * 1).normalize();
    const from = m.pos.clone().add(dir.multiplyScalar(6 + (i % 5)));
    mesh.position.copy(from);
    structure.add(mesh);
    return { mesh, home: m.pos, from, spin: new Vector3((i % 3) - 1, ((i + 1) % 3) - 1, ((i + 2) % 3) - 1).multiplyScalar(1.6), delay: 0.25 + i * 0.12, lift: 0 };
  });

  const floor = new Mesh(new PlaneGeometry(9, 9), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // the cursor tilts the view a little
  const pointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  let wide = true;
  const look = new Vector3(0, 0.2, 0);
  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole structure in view on narrow screens
    // wide screens: the structure stands to the right of the words; narrow ones: lower down, behind them
    wide = w / h > 1.25;
    structure.position.set(wide ? 5.2 : 0, wide ? -1.9 : -5.4, 0);
    floor.position.set(structure.position.x, structure.position.y, 0);
    look.set(wide ? 2.2 : 0, wide ? 0.1 : -1.2, 0);
    camera.position.set(0, 3.2, wide ? 13 : 16);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
  io.observe(host);

  const ease = (t: number) => 1 - Math.pow(1 - MathUtils.clamp(t, 0, 1), 4);
  const start = performance.now();
  let raf = 0;
  let ready = false;
  let nextShift = 9;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = (now - start) / 1000;

    for (const m of modules) {
      const p = ease((t - m.delay) / 2.6);
      m.mesh.position.lerpVectors(m.from, m.home, p);
      m.mesh.position.y += m.lift;
      m.mesh.rotation.set(m.spin.x * (1 - p), m.spin.y * (1 - p), m.spin.z * (1 - p));
      m.lift *= 0.94;
    }
    // now and then a piece lifts out and locks back in: the structure keeps adapting
    if (t > nextShift) {
      const m = modules[Math.floor((t * 7) % modules.length)]!;
      m.lift = 0.7;
      nextShift = t + 4.5;
    }

    structure.rotation.y = t * 0.08 + pointer.x * 0.25;
    camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.03;
    camera.position.y += (3.2 - pointer.y * 0.8 - camera.position.y) * 0.03;
    camera.lookAt(look);
    rim.intensity = 36 + Math.sin(t * 0.6) * 8;

    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      opts.onReady?.();
    }
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onPointer);
    for (const m of modules) m.mesh.geometry.dispose();
    steel.dispose();
    dark.dispose();
    glass.dispose();
    floor.geometry.dispose();
    (floor.material as MeshBasicMaterial).map?.dispose();
    (floor.material as MeshBasicMaterial).dispose();
    envTarget.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
