/**
 * Axxell — logo animato per la barra superiore del sito.
 * La A in 3D (gamba sinistra con la punta, traversa, gamba ciano e sfera ciano nella punta) arriva
 * scomposta, si ricompone con un giro veloce e si ferma in vista frontale a colori piatti, identica
 * al logo 2D (nessuna ombra, nessuna fessura). Quando l'ultimo pezzo, la sfera, è al suo posto,
 * la scritta XXELL compare accanto sfumando: il risultato è il logotipo AXXELL.
 *
 * Modalità:
 *   'once'  (default) l'animazione parte all'apertura della pagina, poi il logo resta fermo;
 *           passando il mouse sopra si ripete (replayOnHover).
 *   'loop'  ciclo continuo: la scritta sparisce prima di ogni scomposizione e ricompare dopo.
 *
 * Uso:
 *   import { createAxxellHeaderLogo } from './axxell-header-logo.js';
 *   const logo = createAxxellHeaderLogo(document.getElementById('header-logo'));
 *   // il contenitore deve avere un'altezza (es. 26px): la larghezza si calcola da sola
 *
 * Richiede three >= 0.152 (testato su 0.160.0).
 */
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const DEFAULTS = {
  mode: 'once',          // 'once' | 'loop'
  replayOnHover: true,   // in 'once', ripete l'animazione al passaggio del mouse
  color: '#FFFFFF',      // A e scritta
  accent: '#38D6E8',     // gamba destra e sfera
  period: 8,             // secondi per ciclo completo
  hold: 0.2,             // frazione del ciclo ferma da composta
  apart: 0.3,            // frazione del ciclo con i pezzi separati
  detach: 0.7,           // quanto si allontanano i pezzi
  sway: 0.35,            // oscillazione da separati
  flips: true,           // giri veloci
  overscan: 3.6,         // area di disegno attorno alla A, in multipli dell'altezza del logo
  dot: false,            // sfera ciano nella punta (true = A con il pallino)
  depth: 1.1,
  label: 'Axxell',
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

// Logotipo piatto (fallback) e lettere XXELL, più basse della A (y 30–84).
const A_BLOCK_PATH = 'M56.99 17.66 L56.83 16.47 L56.53 15.48 L56.09 14.55 L55.52 13.69 L54.83 12.93 L53.89 12.18 L52.84 11.6 L51.87 11.25 L50.86 11.05 L49.83 11.0 L48.63 11.13 L47.64 11.41 L46.7 11.83 L45.83 12.38 L45.05 13.05 L44.28 13.97 L43.7 14.95 L10.22 84.0 L25.78 84.0 L33.54 68.0 L62.91 68.0 L57.09 56.0 L39.36 56.0 L56.33 20.99 L56.65 20.2 L56.87 19.37 L56.98 18.51Z';
const A_LEG_PATH = 'M74.22 84.0 L89.78 84.0 L59.54 21.62 L51.78 37.71Z';
const LETTERS = ["M109.21 84.00 L120.00 67.82 L130.79 84.00 L145.21 84.00 L127.21 57.00 L145.21 30.00 L130.79 30.00 L120.00 46.18 L109.21 30.00 L94.79 30.00 L112.79 57.00 L94.79 84.00Z", "M168.21 84.00 L179.00 67.82 L189.79 84.00 L204.21 84.00 L186.21 57.00 L204.21 30.00 L189.79 30.00 L179.00 46.18 L168.21 30.00 L153.79 30.00 L171.79 57.00 L153.79 84.00Z", "M253.00 30.00 L225.00 30.00 L213.00 30.00 L213.00 41.00 L213.00 51.50 L213.00 62.50 L213.00 73.00 L213.00 84.00 L225.00 84.00 L253.00 84.00 L253.00 73.00 L225.00 73.00 L225.00 62.50 L248.00 62.50 L248.00 51.50 L225.00 51.50 L225.00 41.00 L253.00 41.00Z", "M274.00 30.00 L262.00 30.00 L262.00 73.00 L262.00 84.00 L274.00 84.00 L298.00 84.00 L298.00 73.00 L274.00 73.00Z", "M319.00 30.00 L307.00 30.00 L307.00 73.00 L307.00 84.00 L319.00 84.00 L343.00 84.00 L343.00 73.00 L319.00 73.00Z"];
const VB_X = 10.22, VB_Y = 11, VB_W = 343 - 10.22, VB_H = 73;

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

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export function createAxxellHeaderLogo(container, options = {}) {
  if (!container) throw new Error('createAxxellHeaderLogo: contenitore mancante');
  const o = { ...DEFAULTS, ...options };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', o.label);
  wrap.style.cssText = `position:relative;height:100%;aspect-ratio:${VB_W}/${VB_H};overflow:visible;display:block`;
  container.appendChild(wrap);

  const svg = svgEl('svg', { viewBox: `${VB_X} ${VB_Y} ${VB_W} ${VB_H}`, width: '100%', height: '100%', 'aria-hidden': 'true' });
  svg.style.cssText = 'position:absolute;inset:0;overflow:visible;display:block';
  const flatA = svgEl('g', {});
  flatA.appendChild(svgEl('path', { d: A_BLOCK_PATH, fill: o.color }));
  flatA.appendChild(svgEl('path', { d: A_LEG_PATH, fill: o.accent }));
  if (o.dot) flatA.appendChild(svgEl('circle', { cx: APEX.x, cy: APEX.y, r: APEX.r, fill: o.accent }));
  svg.appendChild(flatA);
  const letters = LETTERS.map((d) => {
    const g = svgEl('g', {});
    g.appendChild(svgEl('path', { d, fill: o.color }));
    svg.appendChild(g);
    return g;
  });
  wrap.appendChild(svg);

  // dissolvenza della scritta, una lettera dopo l'altra (Web Animations API)
  const anims = [];
  const setWord = (show, instant = false) => {
    letters.forEach((g, i) => {
      if (anims[i]) anims[i].cancel();
      const from = parseFloat(getComputedStyle(g).opacity) || 0;
      const to = show ? 1 : 0;
      g.style.opacity = String(to);
      if (instant || !g.animate || from === to) return;
      anims[i] = g.animate([{ opacity: from }, { opacity: to }], {
        duration: show ? 1200 : 450,
        delay: show ? i * 150 : (letters.length - 1 - i) * 50,
        easing: 'ease-in-out',
        fill: 'backwards',
      });
    });
  };

  let renderer = null;
  if (!reduceMotion) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      renderer = null;
    }
  }
  if (!renderer) {
    setWord(true, true);
    return { replay() {}, setPaused() {}, destroy() { wrap.remove(); } };
  }

  flatA.style.display = 'none';
  setWord(false, true);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;pointer-events:none;display:block;z-index:1';
  wrap.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 8, 12);
  const rim = new THREE.DirectionalLight(new THREE.Color(o.accent), 1.2);
  rim.position.set(-8, -4, -6);
  scene.add(key, rim);

  const flatU = { value: 0 };
  const { pieces, materials, legMat } = buildPieces(o, flatU);
  const flipGroup = new THREE.Group();
  scene.add(flipGroup);
  pieces.forEach((p) => flipGroup.add(p.mesh));
  const extra = new THREE.Quaternion();
  const ph = phases(o.period, o.hold, o.apart);
  const doneAt = ph.d + lastDelay(pieces) + 0.08;   // anche l'ultimo pezzo è al suo posto

  // vt = posizione nel ciclo; in 'once' parte già scomposto e si ferma a logo composto
  let vt = o.mode === 'loop' ? 0 : ph.b + (ph.c - ph.b) * 0.55;
  let endAt = o.mode === 'loop' ? Infinity : doneAt + 0.5;
  let wordShown = false;
  let last = performance.now();
  let running = false;
  let visible = true;
  let pageVisible = !document.hidden;
  let paused = false;

  function pose(time) {
    const t = ((time % o.period) + o.period) % o.period;
    flatU.value = posePieces(t, o, ph, pieces, legMat, flipGroup, extra);
    // la scritta compare a logo completo e sparisce prima della scomposizione successiva
    const show = t >= doneAt || t < ph.a - 0.3;
    if (show !== wordShown) { wordShown = show; setWord(show); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    vt = Math.min(vt + dt, endAt);
    pose(vt);
    renderer.render(scene, camera);
    if (vt >= endAt) stop();
  }
  function start() {
    if (running || !visible || !pageVisible || paused || vt >= endAt) return;
    last = performance.now();
    renderer.setAnimationLoop(frame);
    running = true;
  }
  function stop() {
    if (!running) return;
    renderer.setAnimationLoop(null);
    running = false;
  }

  function layout() {
    const H = wrap.clientHeight || 1;
    const u = H / VB_H;                 // pixel per unità SVG
    const side = Math.round(H * o.overscan);
    const cx = (A_CX - VB_X) * u;
    const cy = (A_CY - VB_Y) * u;
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    canvas.style.left = `${cx - side / 2}px`;
    canvas.style.top = `${cy - side / 2}px`;
    renderer.setSize(side, side, false);
    // camera a una distanza tale che, da frontale, la A coincida in scala con la scritta piatta
    const front = o.depth / 2;
    const visibleUnits = side / (10 * u);
    camera.aspect = 1;
    camera.position.set(0, 0, front + visibleUnits / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    pose(vt);
    renderer.render(scene, camera);
  }

  const ro = new ResizeObserver(layout);
  ro.observe(wrap);
  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) start(); else stop();
  });
  io.observe(wrap);
  const onVisibility = () => {
    pageVisible = !document.hidden;
    if (pageVisible) start(); else stop();
  };
  document.addEventListener('visibilitychange', onVisibility);

  function replay() {
    if (o.mode === 'loop' || running) return;
    vt = 0;
    endAt = doneAt + 0.5;   // un ciclo intero: composto → scomposto → ricomposto
    start();
  }
  const onEnter = () => replay();
  if (o.mode === 'once' && o.replayOnHover) wrap.addEventListener('pointerenter', onEnter);

  layout();
  start();

  return {
    replay,
    setPaused(value) {
      paused = !!value;
      if (paused) stop(); else start();
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      wrap.removeEventListener('pointerenter', onEnter);
      anims.forEach((an) => an && an.cancel());
      pieces.forEach((p) => p.geo.dispose());
      materials.forEach((m) => m.dispose());
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      wrap.remove();
    },
  };
}
