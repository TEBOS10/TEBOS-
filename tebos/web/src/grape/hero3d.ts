// Grape Studios' hero (ADR 0016): one modelled object, made for Grape Studios: a cluster of grapes where every grape
// is a black camera lens. It turns slowly on a dark studio set under a softbox, with a muted aubergine rim light and,
// every few seconds, the soft pulse of a camera flash. The pointer tilts the camera a little. The model was generated
// in code (grapeModel.ts); phones, reduced motion and computers without a
// graphics chip get a still render of the same object instead.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { grapeLensCluster } from "./grapeModel";

export interface HeroOptions { /** A GLB to show instead of the modelled bunch, if one is supplied and loads. */ model?: string; onReady?: () => void; onError?: () => void }

export function mountHero(host: HTMLElement, opts: HeroOptions): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.4, 6);

  // the studio: a softbox above and to the side, a muted aubergine rim behind, a floor that catches a reflection
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const softbox = new THREE.SpotLight(0xffffff, 60, 20, Math.PI / 6, 0.8, 1.6);
  softbox.position.set(2.5, 4.5, 3);
  softbox.castShadow = true;
  softbox.shadow.mapSize.set(1024, 1024);
  softbox.shadow.radius = 6;
  scene.add(softbox);
  const rim = new THREE.PointLight(0x6b5478, 22, 12, 2); // the pinch of aubergine, kept low
  rim.position.set(-2.6, 1.2, -2.2);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-3, 1, 4);
  scene.add(fill);
  const flash = new THREE.PointLight(0xffffff, 0, 10, 2); // the camera flash
  flash.position.set(0.4, 0.6, 3.2);
  scene.add(flash);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x010101, roughness: 0.9, metalness: 0, envMapIntensity: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.15;
  floor.receiveShadow = true;
  scene.add(floor);

  const stage = new THREE.Group();
  scene.add(stage);
  const place = (model: THREE.Object3D) => {
    // centre it and fit it to about two units tall
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = 2.1 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    model.position.sub(centre.multiplyScalar(scale));
    stage.add(model);
    opts.onReady?.();
  };
  // the bunch is modelled in code (grapeModel.ts); a supplied GLB replaces it only if it loads
  const modelled = () => place(grapeLensCluster());
  if (!opts.model) modelled();
  else new GLTFLoader().load(opts.model, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const s = mat as THREE.MeshStandardMaterial;
        if ("roughness" in s) { s.roughness = Math.min(s.roughness ?? 0.5, 0.35); s.envMapIntensity = 1.2; }
      }
    });
    place(model);
  }, undefined, modelled);

  const pointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => pointer.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
  window.addEventListener("pointermove", onPointer, { passive: true });

  let lookX = 0;
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / Math.max(1, h);
    camera.position.z = w / h < 1 ? 8.5 : 6;
    // on a wide screen the object stands to the right of the words
    lookX = w / h > 1.2 ? -1.3 : 0;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let raf = 0, last = performance.now(), visible = true, flashAt = performance.now() + 3500;
  const io = new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); });
  io.observe(host);
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stage.rotation.y += dt * 0.28;
    stage.position.y = Math.sin(now / 1800) * 0.05;
    // a soft flash every six to eight seconds: a quick rise, a slower fade
    const since = (now - flashAt) / 1000;
    flash.intensity = since > 0 && since < 0.6 ? 40 * Math.exp(-since * 9) : 0;
    if (since > 0.6) flashAt = now + 6000 + Math.random() * 2000;
    camera.position.x += (pointer.x * 0.8 - camera.position.x) * 0.04;
    camera.position.y += (0.4 - pointer.y * 0.5 - camera.position.y) * 0.04;
    camera.lookAt(lookX, 0, 0);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onPointer);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) { for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose(); mat.dispose(); }
    });
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
