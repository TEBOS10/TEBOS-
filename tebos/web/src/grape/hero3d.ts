// Grape Studios' hero (ADR 0016): a black, glossy GP coin turning slowly in the dark, with the studio's own photographs
// orbiting it like prints on a light table, lit by a single purple rim light. The pointer tilts the camera a little.
// Loaded after the page; phones, reduced motion and computers without a graphics chip get the still version instead.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export interface HeroOptions { photos: string[]; logo: string; onReady?: () => void }

export function mountHero(host: HTMLElement, opts: HeroOptions): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.6, 9.5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0x8b55d6, 60, 20, 2); // the pinch of purple
  rim.position.set(-3.5, 1.5, -2.5);
  scene.add(rim);
  const rim2 = new THREE.PointLight(0x8b55d6, 25, 14, 2);
  rim2.position.set(3.5, -1.8, -1.5);
  scene.add(rim2);

  const loader = new THREE.TextureLoader();
  const disposables: Array<{ dispose(): void }> = [env, pmrem];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // the coin: black lacquer, the GP mark on its face
  const coin = new THREE.Group();
  scene.add(coin);
  const body = new THREE.Mesh(track(new THREE.CylinderGeometry(1.25, 1.25, 0.22, 96)),
    track(new THREE.MeshPhysicalMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 })));
  body.rotation.x = Math.PI / 2;
  coin.add(body);
  const faceTex = track(loader.load(opts.logo));
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = track(new THREE.MeshPhysicalMaterial({ map: faceTex, metalness: 0.2, roughness: 0.3, clearcoat: 1, transparent: true }));
  for (const side of [1, -1]) {
    const face = new THREE.Mesh(track(new THREE.CircleGeometry(1.24, 96)), faceMat);
    face.position.z = 0.111 * side;
    if (side < 0) face.rotation.y = Math.PI;
    coin.add(face);
  }

  // the prints: the studio's photographs on a tilted orbit
  const ring = new THREE.Group();
  ring.rotation.x = -0.32;
  ring.rotation.z = 0.08;
  scene.add(ring);
  const radius = 3.4;
  const prints: THREE.Mesh[] = [];
  let loaded = 0;
  opts.photos.forEach((src, i) => {
    const tex = track(loader.load(src, (t) => {
      const img = t.image as HTMLImageElement;
      const aspect = img.width / img.height;
      prints[i]!.scale.set(aspect, 1, 1);
      loaded++;
      if (loaded === opts.photos.length) opts.onReady?.();
    }));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 1.5)), track(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })));
    const a = (i / opts.photos.length) * Math.PI * 2;
    m.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    ring.add(m);
    prints.push(m);
  });

  const pointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => pointer.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
  window.addEventListener("pointermove", onPointer, { passive: true });

  // on a wide screen the scene sits to the right of the words; on a narrow one it is centred above them
  let lookX = 0;
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / Math.max(1, h);
    // keep the whole ring in frame on narrow screens
    camera.position.z = w / h < 1 ? 13 : 9.5;
    lookX = w / h > 1.2 ? -3 : 0;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let raf = 0, last = performance.now(), visible = true;
  const io = new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); });
  io.observe(host);
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    coin.rotation.y += dt * 0.35;
    coin.position.y = Math.sin(now / 1600) * 0.06;
    ring.rotation.y -= dt * 0.12;
    // each print turns to face the camera as it passes, like someone holding it up
    for (const p of prints) p.lookAt(camera.position.x, p.getWorldPosition(new THREE.Vector3()).y, camera.position.z);
    camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.04;
    camera.position.y += (0.6 - pointer.y * 0.8 - camera.position.y) * 0.04;
    camera.lookAt(lookX, 0, 0);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onPointer);
    for (const d of disposables) d.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
