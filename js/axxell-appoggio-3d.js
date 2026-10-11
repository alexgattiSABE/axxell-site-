/**
 * Axxell — simbolo "Appoggio" in 3D.
 * Una A in quattro pezzi: gamba sinistra con la punta, traversa (bianche: nel logo piatto sono un
 * unico blocco), gamba destra ciano e una sfera ciano incastonata nella punta, che con la gamba
 * ciano forma una "i" (A + i = Ai).
 * In loop i pezzi si separano con un giro veloce, restano sospesi a lungo (ognuno gira su se
 * stesso), poi si ricompongono con un altro giro veloce: la gamba ciano si aggancia con un lampo e
 * la sfera rientra per ultima. Da composto il logo è frontale, fermo e a colori piatti, identico
 * al logo 2D: nessuna ombra, nessuna fessura.
 *
 * Uso:
 *   import { createAxxellAppoggio3D } from './axxell-appoggio-3d.js';
 *   const logo = createAxxellAppoggio3D(document.getElementById('logo'));
 *   // logo.destroy() quando il contenitore viene rimosso
 *
 * Richiede three >= 0.152 (testato su 0.160.0).
 */
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const DEFAULTS = {
  color: '#FFFFFF',      // gamba sinistra e traversa
  accent: '#38D6E8',     // gamba destra e sfera
  background: null,      // null = trasparente
  period: 10,            // secondi per ciclo
  hold: 0.22,            // frazione del ciclo ferma da composta (frontale)
  apart: 0.38,           // frazione del ciclo con i pezzi separati
  flips: true,           // giri veloci: all'apertura, sui pezzi separati e alla chiusura
  sway: 0.5,             // oscillazione mentre i pezzi sono separati (radianti)
  detach: 1,             // quanto si allontanano i pezzi
  dot: false,            // sfera ciano nella punta (true = A con il pallino)
  depth: 1.1,            // spessore
  fallbackSrc: null,
  maxPixelRatio: 2,
};

// Contorni in unità SVG (viewBox 0 0 100 100), identici al logo piatto. La A va da y=11 a y=84.
const LEFT = [[57.0,17.83],[56.87,16.63],[56.59,15.64],[56.09,14.55],[55.52,13.69],[54.83,12.93],[53.89,12.18],[52.99,11.67],[52.03,11.3],[51.03,11.08],[49.83,11.0],[48.8,11.1],[47.8,11.35],[46.7,11.83],[45.83,12.38],[45.05,13.05],[44.28,13.97],[43.7,14.95],[10.22,84.0],[25.78,84.0],[56.33,20.99],[56.65,20.2],[56.83,19.53],[56.97,18.69]];
const BAR = [[62.91,68.0],[57.09,56.0],[38.02,56.0],[32.2,68.0]];   // si sovrappone di poco alla gamba sinistra: da composta non resta nessuna fessura
const LEG = [[74.22,84.0],[89.78,84.0],[59.54,21.62],[51.78,37.71]];
// sfera ciano nella curva della punta: con la gamba ciano forma una "i" (A + i = Ai)
const APEX = { x: 50, y: 18, r: 5.8 };
const A_CX = 50, A_CY = 47.5;   // centro della A
const S = 0.1;                  // 10 unità SVG = 1 unità 3D

function shapeFrom(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const X = (x - A_CX) * S;
    const Y = (A_CY - y) * S;
    if (i === 0) s.moveTo(X, Y); else s.lineTo(X, Y);
  });
  s.closePath();
  return s;
}

// Niente smussi sugli spigoli: le facce frontali sono piane e i pezzi combaciano senza solchi.
function extrude(points, depth, hole = null) {
  const shape = shapeFrom(points);
  if (hole) {
    const h = new THREE.Path();
    h.absarc((hole.x - A_CX) * S, (A_CY - hole.y) * S, hole.r * S, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);
  return { geo, home: new THREE.Vector3(c.x, c.y, 0) };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function phases(P, hold, apart) {
  const a = hold * P;            // fine pausa da composta
  const b = a + 0.12 * P;        // aperta
  const c = b + apart * P;       // fine pausa da scomposta
  const d = c + 0.09 * P;        // ricomposta (ultimo pezzo + ritardo)
  return { a, b, c, d };
}
function turn(t, t0, t1) {
  if (t <= t0 || t >= t1) return 0;
  return easeInOutQuart((t - t0) / (t1 - t0)) * Math.PI * 2;
}
function amount(t, ph) {
  const { a, b, c, d } = ph;
  if (t < a) return 0;
  if (t < b) return easeInOutCubic((t - a) / (b - a));
  if (t < c) return 1;
  if (t < d) return 1 - easeOutBack(clamp01((t - c) / (d - c)));
  return 0;
}

// Da composto il logo passa a colori piatti, identici al logo 2D: nessuna ombra né riflesso.
function hexToSrgb(hex) {
  const c = new THREE.Color(hex);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, THREE.SRGBColorSpace);
  return new THREE.Vector3(out.r, out.g, out.b);
}
function addFlat(material, hex, flatU) {
  const colorU = { value: hexToSrgb(hex) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlat = flatU;
    shader.uniforms.uFlatColor = colorU;
    shader.fragmentShader = 'uniform float uFlat;\nuniform vec3 uFlatColor;\n' + shader.fragmentShader.replace(
      '#include <colorspace_fragment>',
      '#include <colorspace_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlatColor, uFlat);',
    );
  };
  material.customProgramCacheKey = () => 'axxell-flat';
}

// Crea i quattro pezzi: gamba sinistra con la punta forata, traversa, gamba ciano, sfera.
function buildPieces(o, flatU) {
  const blockMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.color), metalness: 0.1, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2,
  });
  const legMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.accent), emissive: new THREE.Color(o.accent), emissiveIntensity: 0.35,
    metalness: 0.1, roughness: 0.25, clearcoat: 0.5, clearcoatRoughness: 0.2,
  });
  const sphereMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.accent), emissive: new THREE.Color(o.accent), emissiveIntensity: 0.6,
    metalness: 0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  addFlat(blockMat, o.color, flatU);
  addFlat(legMat, o.accent, flatU);
  addFlat(sphereMat, o.accent, flatU);

  const e = o.detach;
  const sphereGeo = new THREE.SphereGeometry(APEX.r * S, 48, 32);
  // delay: in apertura parte dopo, in chiusura rientra dopo (la sfera per ultima)
  const pieces = [
    { ...extrude(LEFT, o.depth, o.dot ? APEX : null), mat: blockMat, delay: 0,
      out: new THREE.Vector3(-1.1, 0.2, -0.9).multiplyScalar(e), rot: new THREE.Euler(-0.15, 0.45, 0.12), axis: new THREE.Vector3(0, 1, 0) },
    { ...extrude(BAR, o.depth), mat: blockMat, delay: 0.07,
      out: new THREE.Vector3(0.3, -1.7, 1.5).multiplyScalar(e), rot: new THREE.Euler(0.9, 0.2, -0.25), axis: new THREE.Vector3(1, 0, 0) },
    { ...extrude(LEG, o.depth), mat: legMat, delay: 0.15,
      out: new THREE.Vector3(1.9, 1.3, 1.6).multiplyScalar(e), rot: new THREE.Euler(0.35, -0.7, -0.4), axis: new THREE.Vector3(0, 0, 1) },
    { geo: sphereGeo, home: new THREE.Vector3((APEX.x - A_CX) * S, (A_CY - APEX.y) * S, 0), mat: sphereMat, delay: 0.24,
      out: new THREE.Vector3(-0.4, 2.4, 2.2).multiplyScalar(e), rot: new THREE.Euler(0, 0, 0), axis: new THREE.Vector3(0, 1, 0) },
  ];
  if (!o.dot) { pieces.pop(); sphereGeo.dispose(); }
  for (const p of pieces) {
    p.mesh = new THREE.Mesh(p.geo, p.mat);
    p.mesh.position.copy(p.home);
    p.target = p.home.clone().add(p.out);
  }
  return { pieces, materials: [blockMat, legMat, sphereMat], legMat };
}

const LAST_DELAY = 0.24;
const lastDelay = (pieces) => Math.max(...pieces.map((p) => p.delay));

// Posa di tutti i pezzi al tempo t (secondi dentro il ciclo); restituisce il fattore "piatto".
function posePieces(t, o, ph, pieces, legMat, flipGroup, extra) {
  const P = o.period;
  pieces.forEach((p, i) => {
    const tp = (((t - p.delay) % P) + P) % P;
    const k = amount(tp, ph);
    const kk = Math.max(0, k);
    p.mesh.position.lerpVectors(p.home, p.target, k);
    p.mesh.position.x += Math.sin(t * 0.9 + i * 2.1) * 0.1 * kk;
    p.mesh.position.y += Math.cos(t * 1.1 + i * 1.3) * 0.1 * kk;
    p.mesh.position.z += Math.sin(t * 1.3 + i * 1.7) * 0.12 * kk;
    p.mesh.rotation.set(p.rot.x * k, p.rot.y * k, p.rot.z * k);
    if (o.flips) {
      const w = (ph.c - ph.b) * 0.18;
      extra.setFromAxisAngle(p.axis, turn(tp, ph.b + w, ph.c - w) * (i % 2 ? -1 : 1));
      p.mesh.quaternion.multiply(extra);
    }
  });
  // lampo sulla gamba ciano quando si aggancia
  const snapLeg = ph.d + pieces[2].delay;
  legMat.emissiveIntensity = 0.35 + (t >= snapLeg ? 1.1 * Math.exp(-(t - snapLeg) * 5) : 0);

  let rx = 0, ry = 0;
  if (o.flips) {
    ry += turn(t, ph.a, ph.b + 0.06 * P);
    rx += turn(t, ph.c - 0.03 * P, ph.d);
  }
  if (t > ph.b && t < ph.c) {
    const u = (t - ph.b) / (ph.c - ph.b);
    ry += Math.sin(Math.PI * 2 * u) * o.sway;
    rx += Math.sin(Math.PI * u) * o.sway * 0.5;
  }
  flipGroup.rotation.set(rx, ry, 0);

  // fattore piatto: 1 da composto e fermo, 0 in movimento
  const done = ph.d + lastDelay(pieces) + 0.08;
  if (t >= done) return smooth(done, done + 0.25, t);
  return 1 - smooth(ph.a - 0.3, ph.a, t);
}

export function createAxxellAppoggio3D(container, options = {}) {
  if (!container) throw new Error('createAxxellAppoggio3D: contenitore mancante');
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
  const rim = new THREE.DirectionalLight(new THREE.Color(o.accent), 1.5);
  rim.position.set(-8, -4, -6);
  scene.add(key, rim);

  const flatU = { value: 1 };
  const { pieces, materials, legMat } = buildPieces(o, flatU);
  const flipGroup = new THREE.Group();
  scene.add(flipGroup);
  pieces.forEach((p) => flipGroup.add(p.mesh));
  const extra = new THREE.Quaternion();
  const ph = phases(o.period, o.hold, o.apart);

  let elapsed = 0;
  let last = performance.now();
  let visible = true;
  let pageVisible = !document.hidden;
  let paused = false;
  let running = false;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;
    const t = elapsed % o.period;
    flatU.value = posePieces(t, o, ph, pieces, legMat, flipGroup, extra);
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
    camera.position.set(0, 0, 25 / Math.min(1, camera.aspect));
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
      pieces.forEach((p) => p.geo.dispose());
      materials.forEach((m) => m.dispose());
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
