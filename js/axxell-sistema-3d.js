/**
 * Axxell — simbolo "Sistema" in 3D.
 * Quattro moduli e un nucleo che ruotano, si scompongono e si ricompongono in loop.
 *
 * Uso:
 *   import { createAxxellSistema3D } from './axxell-sistema-3d.js';
 *   const logo = createAxxellSistema3D(document.getElementById('logo'), { accent: '#38D6E8' });
 *   // logo.destroy() quando il contenitore viene rimosso
 *
 * Richiede three >= 0.152 (testato su 0.160.0).
 */
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

// Geometria presa dal file SVG (viewBox 0 0 100 100): centro, larghezza, altezza, raggio angoli.
const S = 0.1; // 10 unità SVG = 1 unità 3D
const MODULES = [
  { cx: 38, cy: 23, w: 48, h: 18, r: 6, flip: 'x', z: 1.6 },  // in alto
  { cx: 77, cy: 38, w: 18, h: 48, r: 6, flip: 'y', z: -1.3 }, // a destra
  { cx: 62, cy: 77, w: 48, h: 18, r: 6, flip: 'x', z: 1.4 },  // in basso
  { cx: 23, cy: 62, w: 18, h: 48, r: 6, flip: 'y', z: -1.6 }, // a sinistra
];
const CORE = { cx: 50, cy: 50, w: 18, h: 18, r: 4 };

const DEFAULTS = {
  color: '#FFFFFF',      // moduli
  accent: '#38D6E8',     // nucleo
  background: null,      // null = trasparente, altrimenti un colore CSS
  period: 7,             // secondi per un ciclo completo (unito → scomposto → unito)
  spin: 0.55,            // rotazione orizzontale, attorno all'asse verticale (rad/s)
  spinX: 0.35,           // rotazione verticale, attorno all'asse orizzontale (rad/s); 0 = solo orizzontale
  explode: 2.4,          // quanto si allontanano i moduli
  depth: 0.9,            // spessore dei pezzi
  pointerTilt: true,     // leggera inclinazione che segue il mouse
  fallbackSrc: null,     // immagine da mostrare se WebGL non è disponibile
  maxPixelRatio: 2,
  glow: 1,              // forza della luce propria del nucleo (sul chiaro conviene meno, sennò sbianca)
};

function roundedRectShape(w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function pieceGeometry(spec, depth) {
  const bevel = 0.07;
  const shape = roundedRectShape(
    spec.w * S - bevel * 2,
    spec.h * S - bevel * 2,
    Math.max(0.01, spec.r * S - bevel),
  );
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 24,
  });
  geo.center();
  return geo;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// 0 = logo composto, 1 = scomposto. t in secondi dentro il ciclo.
function explodeAmount(t, P) {
  const a = 0.28 * P; // fine pausa iniziale
  const b = 0.45 * P; // scomposto
  const c = 0.6 * P;  // inizio ricomposizione
  const d = 0.8 * P;  // ricomposto
  if (t < a) return 0;
  if (t < b) return easeInOutCubic((t - a) / (b - a));
  if (t < c) return 1;
  if (t < d) return 1 - easeOutBack(clamp01((t - c) / (d - c)));
  return 0;
}

export function createAxxellSistema3D(container, options = {}) {
  if (!container) throw new Error('createAxxellSistema3D: contenitore mancante');
  const o = { ...DEFAULTS, ...options };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    if (o.fallbackSrc) {
      const img = document.createElement('img');
      img.src = o.fallbackSrc;
      img.alt = 'Axxell';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
      container.appendChild(img);
      return { destroy: () => img.remove(), setPaused: () => {} };
    }
    throw err;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (o.background) renderer.setClearColor(o.background, 1);
  else renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(5, 8, 10);
  const rim = new THREE.DirectionalLight(new THREE.Color(o.accent), 1.6);
  rim.position.set(-8, -4, -6);
  scene.add(key, rim);

  const moduleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.color),
    metalness: 0.15,
    roughness: 0.28,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.accent),
    emissive: new THREE.Color(o.accent),
    emissiveIntensity: 0.8 * o.glow,
    metalness: 0,
    roughness: 0.2,
  });

  // tiltGroup segue il mouse, group ruota su due assi
  const tiltGroup = new THREE.Group();
  scene.add(tiltGroup);
  const group = new THREE.Group();
  tiltGroup.add(group);

  group.rotation.x = -0.18;

  const geometries = [];
  const pieces = MODULES.map((spec, i) => {
    const geo = pieceGeometry(spec, o.depth);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, moduleMat);
    const home = new THREE.Vector3((spec.cx - 50) * S, (50 - spec.cy) * S, 0);
    const dir = new THREE.Vector3(home.x, home.y, 0).normalize();
    const out = home.clone().addScaledVector(dir, o.explode);
    out.z = spec.z;
    const spinTo = new THREE.Euler(
      spec.flip === 'x' ? Math.PI : 0.25,
      spec.flip === 'y' ? Math.PI : -0.25,
      i % 2 === 0 ? 0.35 : -0.35,
    );
    mesh.position.copy(home);
    group.add(mesh);
    return { mesh, home, out, spinTo, index: i };
  });

  const coreGeo = pieceGeometry(CORE, o.depth);
  geometries.push(coreGeo);
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // Stato
  let elapsed = 0;
  let last = performance.now();
  let visible = true;
  let pageVisible = !document.hidden;
  let paused = false;
  let running = false;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

  function pose(time, dt) {
    const P = o.period;
    let kSum = 0;
    for (const p of pieces) {
      const tp = (((time - p.index * 0.09) % P) + P) % P;
      const k = explodeAmount(tp, P);
      kSum += Math.max(0, k);
      p.mesh.position.lerpVectors(p.home, p.out, k);
      p.mesh.position.z += Math.sin(time * 1.3 + p.index * 1.7) * 0.15 * Math.max(0, k);
      p.mesh.rotation.set(p.spinTo.x * k, p.spinTo.y * k, p.spinTo.z * k);
    }
    const kAvg = kSum / pieces.length;
    const together = 1 - kAvg;
    core.rotation.set(0, 0, kAvg * Math.PI * 0.5);
    core.scale.setScalar(1 + 0.05 * Math.sin(time * 3) * together);
    coreMat.emissiveIntensity = (0.45 + 0.55 * together) * o.glow;

    group.rotation.y += dt * o.spin;
    group.rotation.x += dt * o.spinX;
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 4);
    tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 4);
    tiltGroup.rotation.x = tilt.y * 0.25;
    tiltGroup.rotation.z = tilt.x * -0.12;
  }

  function staticPose() {
    for (const p of pieces) {
      p.mesh.position.copy(p.home);
      p.mesh.rotation.set(0, 0, 0);
    }
    core.rotation.set(0, 0, 0);
    core.scale.setScalar(1);
    tiltGroup.rotation.set(0, 0, 0);
    group.rotation.set(-0.18, -0.5, 0);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;
    pose(elapsed, dt);
    renderer.render(scene, camera);
  }

  function updateLoop() {
    const shouldRun = !reduceMotion && visible && pageVisible && !paused;
    if (shouldRun && !running) {
      last = performance.now();
      renderer.setAnimationLoop(frame);
      running = true;
    } else if (!shouldRun && running) {
      renderer.setAnimationLoop(null);
      running = false;
    }
  }

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, 23 / Math.min(1, camera.aspect));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (!running) renderer.render(scene, camera);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    updateLoop();
  });
  io.observe(container);

  const onVisibility = () => {
    pageVisible = !document.hidden;
    updateLoop();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onPointer = (e) => {
    tilt.tx = (e.clientX / window.innerWidth) * 2 - 1;
    tilt.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (o.pointerTilt && !reduceMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  if (reduceMotion) staticPose();
  resize();
  updateLoop();

  return {
    setPaused(value) {
      paused = !!value;
      updateLoop();
    },
    destroy() {
      renderer.setAnimationLoop(null);
      running = false;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      geometries.forEach((g) => g.dispose());
      moduleMat.dispose();
      coreMat.dispose();
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
