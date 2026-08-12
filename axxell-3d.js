/**
 * Axxell — scene 3D innestate nel sito esistente.
 *
 * Portate dal template a React (react-three-fiber + react-spring) a three.js
 * vanilla, per stare dentro un sito che è un unico file HTML.
 *
 * ## Perché è un modulo ES
 * Il sito carica three **r128** come script globale (`window.THREE`) e ci
 * disegna già la sfera dell'hero, le mani e lo sky. Queste scene sono scritte
 * per **r185**, che nel frattempo ha rifatto la gestione del colore (da r152 lo
 * spazio di output è sRGB) — aggiornare il globale vorrebbe dire rimettere alla
 * prova tutto ciò che già funziona.
 *
 * Caricando r185 come modulo ES con un import map, le due versioni convivono:
 * quella a modulo non finisce in nessuna variabile globale e non tocca r128.
 *
 * ## Cosa NON è stato portato
 * L'orologio di scroll. Nell'originale è un timeline a quattro tracce che
 * trasforma l'orb in galassia e poi in cervello lungo tre schermate. Qui le
 * scene sono ferme a progresso 0, quindi restano nella loro forma — ma **vive**:
 * il movimento ambientale nasce dal rumore che scorre con `uTime` negli shader,
 * non dallo scroll, e la reattività al puntatore è un sistema a parte.
 */

import * as THREE from "three";

/* ─── Configurazione art direction ──────────────────────────────────────────
   I colori sono i token del sito: --cyan #00d4ff e --green #00e8a2, cioè le
   stesse due tinte del gradiente `.hl`. L'originale era menta/indaco.
   Si ri-tinta da qui: mai toccando gli shader. */

export const ORB_CONFIG = {
  colorTop: "#00e8a2",
  colorBottom: "#00d4ff",
  colorEdge: "#0077b3",
  deform: 0.135,
  brightness: 1.24,
  opacity: 1,
  spin: 0.17,
  tilt: 0.39,
  pointerRadius: 1.76,
  oilBulge: 0.46,
  oilRipple: 0.34,
  oilDrag: 0.95,
  rippleFreq: 11,
  rippleSpeed: 4,
  iridescence: 0.6,
  radius: 1,
};

/* ─── Parametri adattivi ────────────────────────────────────────────────────
   Le sprite di punti sono limitate dal fill rate: il costo scala con
   conteggio × dimensione² × dpr². Dimezzare uno dei tre vale più di qualsiasi
   ottimizzazione sulla CPU. */

/*
   I conteggi sono più alti dell'originale, e si può: là le tre scene vivevano
   TUTTE nella stessa pagina, contendendosi lo stesso frame. Qui ognuna sta su
   una pagina diversa e ne è visibile una sola per volta, quindi il budget che
   là andava diviso in tre qui è tutto suo.
   `galaxyW`/`galaxyH` sono la tassellatura del reticolo di semi: ne discende
   direttamente il numero di stelle. */

const TIERS = [
  { max: Infinity, count: 34000, size: 28, dpr: 2, pointer: true, brain: 170000, galaxyW: 190, galaxyH: 480 },
  { max: 1440, count: 26000, size: 27, dpr: 2, pointer: true, brain: 130000, galaxyW: 160, galaxyH: 400 },
  { max: 1024, count: 14000, size: 24, dpr: 1.5, pointer: false, brain: 70000, galaxyW: 110, galaxyH: 280 },
  { max: 640, count: 8000, size: 21, dpr: 2, pointer: false, brain: 34000, galaxyW: 118, galaxyH: 290 },
];

/* ─── Configurazione del cervello (sezione ATLAS) ───────────────────────────
   Stesso gradiente dell'orb — ciano in basso, verde in alto — così le due
   scene si leggono come lo stesso sistema. */

export const BRAIN_CONFIG = {
  colorCool: "#00d4ff",
  colorWarm: "#00e8a2",
  colorEdge: "#0077b3",
  colorCenter: "#000000",
  colorSynapse: "#eafff8",
  colorDeep: "#02040e",
  colorCursor: "#7df9ff",
  centerRadius: 0.37,
  centerFalloff: 4,
  size: 0.067,
  synapseRate: 0.1,
  flowSpeed: 2.3,
  flowAmount: 0.025,
  glow: 1.4,
  depthDarkness: 1,
  radius: 1.15,
  /** Rotazione a riposo: mostra il profilo laterale. */
  baseRotationY: -1.309 - 1.5708,
  /** Radianti di cui il cervello si orienta verso il cursore. */
  cursorTilt: 0.22,
  /**
   * Oscillazione attorno alla posa di profilo, in radianti, e sua velocità.
   *
   * Non una rotazione continua: girando su se stesso il cervello passa quasi
   * tutto il tempo in angolazioni da cui si legge come una massa informe. Qui
   * ondeggia attorno al profilo laterale, che è la posa in cui si riconosce.
   */
  /** Radianti al secondo del giro completo. 0.55 = un giro ogni ~11 s. */
  spinSpeed: 0.55,
};

export const BRAIN_MESH_URL = "./assets/brain/brain-mesh.bin";

const paramsFor = (width) => {
  let result = TIERS[0];
  for (const tier of TIERS) if (width <= tier.max) result = tier;
  return result;
};

/* ─── Colore ────────────────────────────────────────────────────────────────
   Il renderer produce sRGB, quindi il pass finale codifica lineare → sRGB.
   I colori degli shader devono perciò essere LINEARI: caricare i byte grezzi
   dell'esadecimale li farebbe codificare due volte, e il risultato sbiadisce. */

const hexToLinear = (hex) => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/* ─── Dimensionamento ───────────────────────────────────────────────────────
   Va osservato, non calcolato una volta sola: il sito è un router a pagine e
   quelle non attive stanno in `display:none`. Una scena montata mentre la sua
   pagina è nascosta legge `clientWidth` = 0, ripiega su un fallback e poi il
   CSS le stira la canvas — che è esattamente come il cervello era venuto
   schiacciato. Il ResizeObserver rimisura appena la pagina diventa visibile. */

const attachResize = (canvas, apply) => {
  const measure = () => {
    const parent = canvas.parentElement;
    const width = parent?.clientWidth || 0;
    // Larghezza 0 = pagina ancora nascosta: non misurare, riproveremo.
    if (width > 0) apply(width, parent.clientHeight || 0);
  };

  const observer = new ResizeObserver(measure);
  if (canvas.parentElement) observer.observe(canvas.parentElement);
  window.addEventListener("resize", measure);
  measure();

  const detach = () => {
    observer.disconnect();
    window.removeEventListener("resize", measure);
  };
  detach.measure = measure;
  return detach;
};


/* ─── Rigenerazione legata al ROUTER ────────────────────────────────────────
   NON all'IntersectionObserver.

   L'osservatore di intersezione raggruppa le notifiche: se una pagina viene
   nascosta e rimostrata dentro lo stesso lotto, non ne consegna nessuna —
   misurato, con navigazione istantanea l'elenco delle notifiche e' vuoto. Il
   confronto "prima era nascosto, ora e' visibile" non scatta mai e la scena
   resta gia' formata.

   La visibilita' di pagina qui non e' un'inferenza: il router aggiunge e toglie
   la classe `active` sul contenitore `.page`. Osservare quell'attributo e'
   deterministico e sincrono col cambio pagina. L'intersezione resta, ma solo
   per non disegnare quando si e' fuori schermo. */

const onPageEnter = (canvas, onEnter, pageSelector) => {
  // `pageSelector` serve quando la canvas vive FUORI dal contenitore che il
  // router nasconde — vedi la galassia della home.
  const page = pageSelector
    ? document.querySelector(pageSelector)
    : canvas.closest(".page");
  if (!page) return () => {};

  let attiva = page.classList.contains("active");
  const observer = new MutationObserver(() => {
    const ora = page.classList.contains("active");
    if (ora && !attiva) onEnter();
    attiva = ora;
  });
  observer.observe(page, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};

/* ─── Rumore simplex 3D (Ashima) ────────────────────────────────────────────*/

const SNOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }`;

/* ─── Shader dell'orb ───────────────────────────────────────────────────────
   Sfera di Fibonacci spostata lungo le normali da due ottave di simplex. Il
   colore è dipinto in spazio VISTA, così il gradiente resta fisso allo schermo
   mentre la sfera ruota sotto.

   `uOut` (dissolvenza) e `uCore` (foro passante) restano a 0: erano pilotati
   dallo scroll. Le uniform restano perché lo shader è portato verbatim. */

const ORB_VERT = /* glsl */ `
  uniform float uTime, uSize, uPR, uDeform, uOut, uAssemble, uCore;
  uniform vec3  uCentre, uCamLocal, uCursor, uCursorVel;
  uniform float uEnergy, uPointerRadius, uOilBulge, uOilRipple, uOilDrag;
  uniform float uRippleFreq, uRippleSpeed;
  uniform float uFadeNear, uFadeFar;

  attribute vec3 aRandom;
  varying float vAlpha, vLit, vVert, vSide, vOil, vEdgeFade;

  ${SNOISE}

  void main(){
    vec3 p = position;

    float n1 = snoise(p * 1.6 + vec3(0.0, uTime * 0.18, 0.0));
    float n2 = snoise(p * 3.3 - vec3(uTime * 0.12));
    float disp = n1 * 0.72 + n2 * 0.28;
    vec3 pos = p * (1.0 + uDeform * disp);

    float lit = smoothstep(-0.25, 0.5, disp);
    vLit = lit;

    vec3 axis = normalize(uCamLocal);
    float axial = dot(pos, axis);
    float radial = length(pos - axis * axial);
    float bore = mix(0.36, 0.56, uCore) * (1.0 + disp * 0.55);
    float hole = smoothstep(bore, bore + 0.10, radial);

    // Ingresso: i punti arrivano dalla camera e si radunano sulla sfera.
    float delay = (aRandom.z + 0.5) * 0.55;
    float t = clamp((uAssemble - delay) / (1.0 - delay), 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - t, 3.0);
    vec3 spawn = uCamLocal * 0.92 + vec3(aRandom.x * 1.9, -1.7 + aRandom.y * 1.3, 0.0);
    pos = mix(spawn, pos, ease);
    float assembleFade = ease;

    // Dissolvenza radiale. In fase di ingresso i punti nascono sparsi vicino
    // alla camera e coprono tutta la canvas: senza questa sfumatura vengono
    // tagliati di netto dal bordo del riquadro, e si vede un rettangolo di
    // polvere invece di particelle che arrivano dal buio.
    vEdgeFade = 1.0 - smoothstep(uFadeNear, uFadeFar, length(pos));

    float out2 = uOut * uOut;
    vec3 flow = normalize(p + aRandom * 0.4);
    float sheet = snoise(p * 1.9 + vec3(uTime * 0.25));
    float ripple = sin(length(p) * 6.0 - uTime * 1.6 + sheet * 3.0);
    pos += flow * (out2 * (9.0 + sheet * 5.0 + ripple * 1.6));
    pos += vec3(sheet, ripple, sheet * ripple) * uOut * 0.55;

    // Olio: disturbo viscoso fisso in spazio MONDO (non ruota con la sfera).
    vec4 wpos = modelMatrix * vec4(pos, 1.0);
    vec3 wN = normalize(wpos.xyz - uCentre);
    float ang = acos(clamp(dot(wN, normalize(uCursor)), -1.0, 1.0));
    float fall = smoothstep(uPointerRadius, 0.0, ang);
    float bulge = fall * fall;
    float oilRipple = sin(ang * uRippleFreq - uTime * uRippleSpeed) * fall;
    float oil = (bulge * uOilBulge + oilRipple * uOilRipple) * uEnergy;
    wpos.xyz += wN * oil;
    wpos.xyz += uCursorVel * fall * uOilDrag * uEnergy;
    vOil = (bulge + max(oilRipple, 0.0) * 0.5) * uEnergy;

    vec4 mv = viewMatrix * wpos;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPR * (1.0 / max(0.1, -mv.z));

    vVert = mv.y;
    vSide = abs(mv.x);

    float depth = pos.z * 0.5 + 0.5;
    float outFade = 1.0 - smoothstep(0.0, 0.92, uOut);

    // Soglie minime su alpha e colore: il blend è additivo, ma su fondo quasi
    // nero un punto che collassa rivela il fondo e si legge come una macchia.
    vAlpha = hole * (0.28 + 0.32 * depth) * (0.38 + 0.72 * lit) * outFade * assembleFade;
  }`;

const ORB_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColTop, uColBottom, uColEdge;
  uniform float uBrightness, uOpacity, uAppear, uIri;
  varying float vAlpha, vLit, vVert, vSide, vOil, vEdgeFade;

  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    soft = soft * soft * 1.2;
    float core = smoothstep(0.13, 0.0, d);

    float vt = clamp(vVert * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uColBottom, uColTop, vt);
    col = mix(col, uColEdge, smoothstep(0.72, 1.15, vSide));

    col *= (0.78 + 0.42 * vLit);
    col += smoothstep(0.6, 1.0, vLit) * core * vec3(0.45);

    float cap = smoothstep(0.55, 1.05, abs(vVert));
    col += col * cap * 1.1;
    float capA = 1.0 + 0.6 * cap;

    float oilMask = clamp(vOil, 0.0, 1.0);
    vec3 iri = 0.5 + 0.5 * cos(6.2831853 * (vOil * 2.4 + abs(vVert) * 0.3 + vec3(0.0, 0.33, 0.67)));
    col = mix(col, iri, oilMask * uIri);
    col += oilMask * 0.3;

    col *= uBrightness;
    gl_FragColor = vec4(col, soft * vAlpha * capA * uOpacity * uAppear * vEdgeFade * (1.0 + oilMask * 0.5));
  }`;

/* ─── Puntatore "a olio" ────────────────────────────────────────────────────
   Proietta il cursore sulla sfera per trovare la direzione di contatto, la
   insegue con ritardo (viscosità) e accumula un'energia che cresce col
   movimento e decade piano, così la superficie continua a fluire e poi si
   posa. Una factory, non un hook: viene fatta avanzare dal loop di frame. */

const createOilPointer = (radius) => {
  const smooth = new THREE.Vector3(0, 0, radius);
  const prev = new THREE.Vector3(0, 0, radius);
  const velocity = new THREE.Vector3();
  const rawVel = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const originToCentre = new THREE.Vector3();
  const target = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const state = { energy: 0, idle: 0 };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  return {
    cursor: smooth,
    velocity,
    get energy() {
      return state.energy;
    },
    step(camera, pointerNdc, centre, enabled, delta) {
      // Easing indipendente dal frame rate: `base` è la frazione chiusa in
      // 1/60 s, così la sensazione è identica a 60, 45 o 30 fps.
      const ease = (base) => 1 - Math.pow(1 - base, delta * 60);

      pointer.lerp(pointerNdc, ease(0.11));
      target.copy(smooth);

      if (enabled) {
        ndc.set(pointer.x, pointer.y, 0.5).unproject(camera);
        dir.copy(ndc).sub(camera.position).normalize();
        originToCentre.copy(camera.position).sub(centre);

        const b = 2 * dir.dot(originToCentre);
        const c = originToCentre.lengthSq() - radius * radius;
        const disc = b * b - 4 * c;

        if (disc >= 0) {
          target.copy(originToCentre).addScaledVector(dir, (-b - Math.sqrt(disc)) / 2);
        } else {
          const tc = Math.max(0, -dir.dot(originToCentre));
          target.copy(originToCentre).addScaledVector(dir, tc).normalize().multiplyScalar(radius);
        }
      }

      prev.copy(smooth);
      smooth.lerp(target, ease(0.1));

      // Solo smear tangenziale: la componente radiale viene tolta.
      rawVel.subVectors(smooth, prev).multiplyScalar(2.5);
      radial.copy(smooth).normalize();
      rawVel.addScaledVector(radial, -rawVel.dot(radial));
      if (rawVel.length() > 0.6) rawVel.setLength(0.6);
      velocity.lerp(rawVel, ease(0.16));

      const speed = smooth.distanceTo(prev);
      const drive = clamp(speed * 8, 0, 1);
      if (drive > state.energy) state.energy += (drive - state.energy) * ease(0.08);
      else state.energy *= Math.pow(0.97, delta * 60);

      state.idle = speed < 0.0005 ? state.idle + delta : 0;
      if (!enabled || state.idle > 2.5) state.energy *= Math.pow(0.9, delta * 60);
    },
  };
};

/* ─── Geometria: sfera di Fibonacci ─────────────────────────────────────────*/

const buildOrbGeometry = (count, radius) => {
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    positions[i * 3] = Math.cos(th) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(th) * r * radius;
    randoms[i * 3] = Math.random() - 0.5;
    randoms[i * 3 + 1] = Math.random() - 0.5;
    randoms[i * 3 + 2] = Math.random() - 0.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 3));
  return geometry;
};

/* ─── Montaggio ─────────────────────────────────────────────────────────────*/

/**
 * Monta l'orb su una canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ config?: object, cameraZ?: number }} [options]
 * @returns {{ destroy: () => void }}
 */
export const mountOrb = (canvas, options = {}) => {
  const config = { ...ORB_CONFIG, ...(options.config || {}) };
  const tier = paramsFor(window.innerWidth);
  /*
     Conteggio e dimensione delle sprite erano tarati su una canvas a tutto
     schermo. In un riquadro piccolo la stessa densità impasta: le sprite si
     sovrappongono, il blend additivo le somma e la forma perde i bordi invece
     di risolversi in particelle. `density` abbassa il conteggio; la dimensione
     viene riscalata sul lato reale della canvas, dentro attachResize.
  */
  const count = Math.round(tier.count * (options.density ?? 1));
  const baseSize = config.pointSize ?? tier.size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false, // MSAA non fa nulla su sprite additive: sono già morbide.
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = options.cameraZ ?? 3.8;

  const uniforms = {
    uTime: { value: 0 },
    uPR: { value: renderer.getPixelRatio() },
    uSize: { value: baseSize },
    uDeform: { value: config.deform },
    uOut: { value: 0 },
    uAssemble: { value: 0 },
    uCore: { value: 0 },
    uCentre: { value: new THREE.Vector3() },
    uCamLocal: { value: new THREE.Vector3(0, 0, 1) },
    uColTop: { value: hexToLinear(config.colorTop) },
    uColBottom: { value: hexToLinear(config.colorBottom) },
    uColEdge: { value: hexToLinear(config.colorEdge) },
    uBrightness: { value: config.brightness },
    uOpacity: { value: config.opacity },
    uAppear: { value: 1 },
    uCursor: { value: new THREE.Vector3(0, 0, config.radius) },
    uCursorVel: { value: new THREE.Vector3() },
    uEnergy: { value: 0 },
    uPointerRadius: { value: config.pointerRadius },
    uOilBulge: { value: config.oilBulge },
    uOilRipple: { value: config.oilRipple },
    uOilDrag: { value: config.oilDrag },
    uRippleFreq: { value: config.rippleFreq },
    uRippleSpeed: { value: config.rippleSpeed },
    uIri: { value: config.iridescence },
    uFadeNear: { value: config.fadeNear ?? 1.7 },
    uFadeFar: { value: config.fadeFar ?? 3.1 },
  };

  const points = new THREE.Points(
    buildOrbGeometry(count, config.radius),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: ORB_VERT,
      fragmentShader: ORB_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);

  const oil = createOilPointer(config.radius);
  const centre = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  const pointerNdc = new THREE.Vector2();
  const clock = new THREE.Clock();

  const onPointerMove = (event) => {
    pointerNdc.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
  };
  if (tier.pointer) window.addEventListener("pointermove", onPointerMove, { passive: true });

  /**
   * La canvas non ha dimensioni proprie nel markup: le assegnava lo script
   * della vecchia sfera, un quadrato ricavato dal contenitore. Stessa regola qui.
   */
  const detachResize = attachResize(canvas, (width, height) => {
    const side = Math.min(width, height || 600, options.maxSize ?? 620);
    canvas.style.width = side + "px";
    canvas.style.height = side + "px";
    renderer.setSize(side, side, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    uniforms.uPR.value = renderer.getPixelRatio();
    // 900 px è il lato per cui la dimensione originale era pensata: sotto,
    // le sprite rimpiccioliscono in proporzione e la sfera resta granulosa.
    uniforms.uSize.value = baseSize * Math.min(1, side / 900);
  });

  // Ingresso: rampa 0→1 in 2900 ms, easeOutCubic. Nell'originale è una molla di
  // react-spring; qui basta la stessa curva su un tempo.
  const INTRO_MS = 2200;
  let introStart = null;
  let raf = null;
  let stopped = false;

  // Non disegnare quando la canvas non è in viewport: la home del sito è un
  // router a pagine, e l'hero resta nel DOM anche quando non è quella attiva.
  let onScreen = true;
  /*
     Si riforma a OGNI ingresso in pagina, non solo al primo.
     Il sito e' un router: si entra e si esce dalle pagine di continuo, e una
     scena che si assembla una volta sola la ritroveresti gia' fatta al
     rientro. Azzerare l'orologio sul passaggio nascosto -> visibile fa
     ripartire la formazione ogni volta.
  */
  const observer = new IntersectionObserver(
    ([entry]) => { onScreen = entry.isIntersecting; },
    { threshold: 0 },
  );
  observer.observe(canvas);
  const detachPage = onPageEnter(canvas, () => {
  /*
     `onScreen = true` esplicito, senza aspettare l'IntersectionObserver.
     Quando il router attiva la pagina la visibilita' e' un fatto noto: restare
     in attesa della notifica di intersezione — che e' raggruppata e puo'
     arrivare con ritardo — lasciava il ciclo di disegno bloccato sul vecchio
     valore `false`, e la scena compariva secondi dopo il click.
  */
    onScreen = true;
    /*
       Ricostruzione del livello grafico all'ingresso in pagina.

       Quando l'antenato va in `display:none` WebKit scarta il livello di
       composizione della canvas. Al ritorno la scena continua a renderizzare —
       uniform, camera e contatore dei frame risultano identici al caso
       funzionante, verificato con una sonda — ma il browser non compone piu'
       nulla e lo schermo resta vuoto o mostra un residuo.

       Due passaggi: rileggere le misure (il buffer di disegno) e forzare un
       ricalcolo del layout sulla canvas, che obbliga WebKit a ricreare il
       livello. Solo la rimisura non bastava.
    */
    canvas.style.display = "none";
    void canvas.offsetHeight;
    canvas.style.display = "block";
    // La rimisura va fatta DOPO che il browser ha rifatto il layout. Chiamata
    // qui dentro girerebbe nel microtask del MutationObserver, con il
    // contenitore ancora alle vecchie dimensioni (o a zero).
    requestAnimationFrame(() => detachResize.measure());
    introStart = null;
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (stopped || !onScreen || document.hidden) return;

    if (introStart === null) introStart = now;
    const t = Math.min(1, (now - introStart) / INTRO_MS);
    // Stessa ragione della galassia: la cubica faceva atterrare i punti troppo
    // presto perche' la formazione si leggesse come tale.
    uniforms.uAssemble.value = reduceMotion.matches ? 1 : t * t * (3 - 2 * t);

    const delta = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();
    uniforms.uTime.value = reduceMotion.matches ? 0 : time;

    if (!reduceMotion.matches) {
      points.rotation.y = time * config.spin;
      points.rotation.x = Math.sin(time * 0.1) * config.tilt;
    }

    // La camera nello spazio dei punti. Il foro e l'origine di spawn sono
    // entrambi in spazio oggetto e i punti ruotano, quindi va ricalcolata dopo
    // la rotazione — e serve una matrice mondo fresca.
    points.updateMatrixWorld();
    camLocal.copy(camera.position);
    points.worldToLocal(camLocal);
    uniforms.uCamLocal.value.copy(camLocal);
    uniforms.uCentre.value.copy(centre);

    oil.step(camera, pointerNdc, centre, tier.pointer && !reduceMotion.matches, delta);
    uniforms.uCursor.value.copy(oil.cursor);
    uniforms.uCursorVel.value.copy(oil.velocity);
    uniforms.uEnergy.value = oil.energy;

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      detachPage();
      detachResize();
      window.removeEventListener("pointermove", onPointerMove);
      points.geometry.dispose();
      points.material.dispose();
      renderer.dispose();
    },
  };
};

/* ─── Cervello: shader ──────────────────────────────────────────────────────
   Superficie campionata da una mesh, ~90k punti additivi: tinta verticale
   freddo→caldo, interno scuro, bordo luminoso, lampi di sinapsi bianchi e uno
   scintillio di flusso tangenziale continuo. Portati verbatim.

   `uExplode` fa anche da animazione di ingresso: a 1 i punti sono dispersi
   lungo la loro direzione radiale, a 0 riposano sulla superficie. */

const BRAIN_VERT = /* glsl */ `
  attribute float aSeed; attribute float aOcclusion; attribute vec3 aNormal;
  uniform float iTime; uniform float iResolutionY; uniform float uSize; uniform float uSynapseRate;
  uniform float uCenterRadius; uniform float uFlowSpeed; uniform float uFlowAmount;
  uniform vec3 uHighlightPos; uniform float uHighlightRadius; uniform float uHighlightStrength;
  uniform float uExplode; uniform float uExplodeDist; uniform float uSwirl;
  uniform float uFadeNear; uniform float uFadeFar;
  uniform vec2 uMouse; uniform float uCursor; uniform float uAspect; uniform float uCursorRadius;
  varying float vSeed; varying float vSynapse; varying float vHemi; varying float vDepth;
  varying float vFrontness; varying float vCenterness; varying float vOcclusion; varying float vHighlight;
  varying float vFar; varying float vCursor; varying vec3 vWorldPos; varying float vAssemble; varying float vEdgeFade;
  void main() {
    vSeed = aSeed; vOcclusion = aOcclusion;
    vec3 p = position; vWorldPos = p; vHemi = step(0.0, p.x);
    vHighlight = (1.0 - smoothstep(0.0, uHighlightRadius, distance(position, uHighlightPos))) * uHighlightStrength;
    vec3 focalDir = normalize(uHighlightPos + vec3(1e-5));
    float align = dot(normalize(position + vec3(1e-5)), focalDir);
    vFar = smoothstep(0.55, -0.35, align);
    vec3 rad = normalize(p + vec3(1e-5));
    float breathe = sin(iTime * 1.6 + aSeed * 6.0) * 0.012;
    p += rad * breathe;
    vec3 nrm = normalize(aNormal + vec3(1e-5));
    vec3 ref = abs(nrm.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tA = normalize(cross(nrm, ref));
    vec3 tB = cross(nrm, tA);
    float ph = iTime * uFlowSpeed + aSeed * 6.2831;
    vec3 loopDir = tA * cos(ph) + tB * sin(ph);
    p += loopDir * uFlowAmount;
    // Formazione a SCIA, come le stelle della galassia: ogni punto arriva da
    // lontano lungo la propria direzione e con il proprio ritardo. Senza il
    // ritardo si muovono tutti insieme, e si legge una massa che si contrae —
    // non particelle che convergono.
    vec3 exDir = normalize(rad + vec3(sin(aSeed * 41.0), cos(aSeed * 57.0), sin(aSeed * 73.0)) * 0.45);
    float assembleT = 1.0 - uExplode;
    float delay = aSeed * 0.55;
    float at = clamp((assembleT - delay) / (1.0 - delay), 0.0, 1.0);
    float aEase = 1.0 - pow(1.0 - at, 3.0);
    vAssemble = aEase;

    // Rientro a SPIRALE, non in linea retta. L'offset che riporta il punto sulla
    // superficie viene ruotato attorno all'asse verticale di un angolo che
    // decresce con l'avanzamento: il punto descrive una curva e non un raggio.
    // uSwirl è quanto ampia è la curva, il termine su aSeed la sfasa per punto
    // così le scie non collassano tutte sullo stesso arco.
    // (Niente backtick nei commenti qui dentro: questo è un template literal,
    // e un backtick lo chiuderebbe a metà shader.)
    float swirlAng = (1.0 - aEase) * uSwirl + aSeed * 2.4;
    float cs = cos(swirlAng);
    float sn = sin(swirlAng);
    vec3 off = exDir * (1.0 - aEase) * uExplodeDist;
    off = vec3(off.x * cs - off.z * sn, off.y, off.x * sn + off.z * cs);
    p += off;

    // Dissolvenza radiale. Senza, la nube in arrivo e' piu' larga della canvas
    // e viene tagliata di netto dal suo bordo: si vede un rettangolo di
    // polvere invece di particelle che arrivano dal buio. Qui i punti lontani
    // dal centro sfumano da soli, prima di incontrare quel bordo.
    vEdgeFade = 1.0 - smoothstep(uFadeNear, uFadeFar, length(p));
    float period = mix(3.0, 9.0, aSeed);
    float firePhase = aSeed * period;
    float ft = mod(iTime + firePhase, period);
    float fire = pow(clamp(1.0 - ft / 0.4, 0.0, 1.0), 2.5);
    if (aSeed > uSynapseRate) fire = 0.0;
    vSynapse = fire;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 centerMv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float rel = centerMv.z - mv.z;
    vFrontness = clamp(rel * 0.6 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
    vec4 centerClip = projectionMatrix * centerMv;
    vec2 centerNDC = centerClip.xy / max(0.0001, centerClip.w);
    vec2 pNDC = gl_Position.xy / max(0.0001, gl_Position.w);
    float screenDist = length(pNDC - centerNDC);
    vCenterness = 1.0 - clamp(screenDist / max(0.05, uCenterRadius), 0.0, 1.0);
    vec2 dMouse = pNDC - uMouse; dMouse.x *= uAspect;
    vCursor = (1.0 - smoothstep(0.0, uCursorRadius, length(dMouse))) * uCursor;
    float baseSize = uSize * (iResolutionY / 720.0) * (200.0 / -mv.z);
    gl_PointSize = baseSize * (1.0 + fire * 0.8 + vHighlight * 1.8 + vCursor * 1.3);
    vDepth = -mv.z;
  }`;

const BRAIN_FRAG = /* glsl */ `
  uniform vec3 uCool; uniform vec3 uWarm; uniform vec3 uEdgeColor; uniform vec3 uCenterColor;
  uniform float uCenterFalloff; uniform vec3 uSynapse; uniform float iAlpha; uniform float uGlow;
  uniform float uDepthDarkness; uniform vec3 uDeepColor; uniform float uOcclusionStrength;
  uniform vec3 uHighlightColor; uniform float uHighlightStrength; uniform float uFocusFadeStrength;
  uniform float uIsolateStrength; uniform float uExplode; uniform vec3 uCursorColor;
  varying float vSeed; varying float vSynapse; varying float vHemi; varying float vDepth;
  varying float vFrontness; varying float vCenterness; varying float vOcclusion; varying float vHighlight;
  varying float vFar; varying float vCursor; varying vec3 vWorldPos; varying float vAssemble; varying float vEdgeFade;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p);
    if (r > 0.5) discard;
    float core = pow(smoothstep(0.5, 0.0, r), 2.2);
    float t = pow(vCenterness, max(0.05, uCenterFalloff));
    float vt = clamp(smoothstep(-0.7, 0.9, vWorldPos.y) + vSeed * 0.12, 0.0, 1.0);
    vec3 grad = mix(uCool, uWarm, vt);
    vec3 base = mix(grad, uCenterColor, t);
    base = mix(base, uEdgeColor, (1.0 - t) * 0.18);
    base = mix(base, uDeepColor, clamp(vOcclusion * uOcclusionStrength, 0.0, 1.0));
    vec3 col = base + uSynapse * vSynapse * 2.0;
    col = mix(col, uHighlightColor, vHighlight * 0.5);
    col += uHighlightColor * vHighlight * 0.7;
    float nonFocus = (1.0 - vHighlight) * uHighlightStrength;
    col = mix(col, uDeepColor, nonFocus * uIsolateStrength);
    float depthMul = mix(1.0 - uDepthDarkness, 1.0, vFrontness);
    col *= depthMul;
    float alphaOut = core * iAlpha * mix(1.0 - uDepthDarkness * 0.7, 1.0, vFrontness);
    alphaOut *= 1.0 + vHighlight * 0.8;
    float focusDim = 1.0 - uHighlightStrength * uFocusFadeStrength * vFar;
    col *= focusDim; alphaOut *= focusDim;
    col += uCursorColor * vCursor * 0.8;
    alphaOut += vCursor * core * 0.32;
    // I punti ancora in viaggio restano fiochi e si accendono quando atterrano.
    alphaOut *= mix(0.42, 1.0, vAssemble) * vEdgeFade;
    gl_FragColor = vec4(col * uGlow, alphaOut);
  }`;

/* ─── Cervello: mesh e campionamento ────────────────────────────────────────
   Il contenitore `VBRN` è una mesh indicizzata da 43 KB, già centrata sul
   proprio baricentro di superficie e scalata a raggio unitario: le posizioni
   sono frazioni intere a 16 bit del raggio. */

const BRAIN_MAGIC = 0x4e524256;
const decodeBrainMesh = (buffer) => {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== BRAIN_MAGIC) throw new Error("mesh cervello: magic non valido");
  const vertexCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);
  const quantised = new Int16Array(buffer, 16, vertexCount * 3);
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = quantised[i] / 32767;
  const indexBase = 16 + vertexCount * 3 * 2;
  const indices = new Uint16Array(buffer.slice(indexBase, indexBase + indexCount * 2));
  return { positions, indices };
};

/**
 * Campionamento della superficie pesato per area, con normali geometriche.
 * L'area cumulata serve a che un'estrazione uniforme peschi un triangolo in
 * proporzione alla superficie che occupa — altrimenti i grappoli di triangoli
 * piccoli vengono sovracampionati e la nuvola si aggruma.
 */
const buildBrainGeometry = (mesh, count, radius) => {
  const { positions: verts, indices } = mesh;
  const triangleCount = indices.length / 3;

  const cdf = new Float32Array(triangleCount);
  let total = 0;
  for (let t = 0; t < triangleCount; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * 0.5;
    cdf[t] = total;
  }
  for (let t = 0; t < triangleCount; t++) cdf[t] /= total;

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const occlusion = new Float32Array(count);

  for (let s = 0; s < count; s++) {
    const pick = Math.random();
    let lo = 0, hi = triangleCount - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < pick) lo = mid + 1; else hi = mid; }

    const a = indices[lo * 3] * 3, b = indices[lo * 3 + 1] * 3, c = indices[lo * 3 + 2] * 3;
    // Punto baricentrico uniforme: la metà lontana del quadrato viene ripiegata
    // sulla diagonale, così la coppia cade dentro il triangolo e non nel quadrato.
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;

    positions[s * 3] = (w * verts[a] + u * verts[b] + v * verts[c]) * radius;
    positions[s * 3 + 1] = (w * verts[a + 1] + u * verts[b + 1] + v * verts[c + 1]) * radius;
    positions[s * 3 + 2] = (w * verts[a + 2] + u * verts[b + 2] + v * verts[c + 2]) * radius;

    const e1x = verts[b] - verts[a], e1y = verts[b + 1] - verts[a + 1], e1z = verts[b + 2] - verts[a + 2];
    const e2x = verts[c] - verts[a], e2y = verts[c + 1] - verts[a + 1], e2z = verts[c + 2] - verts[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[s * 3] = nx / len; normals[s * 3 + 1] = ny / len; normals[s * 3 + 2] = nz / len;
    seeds[s] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aOcclusion", new THREE.BufferAttribute(occlusion, 1));
  return geometry;
};

/**
 * Monta il cervello su una canvas. Asincrono: la mesh va scaricata.
 *
 * Si assembla la prima volta che entra in viewport, non al caricamento della
 * pagina — nel sito è dentro la pagina ATLAS, che spesso non è quella aperta.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{ destroy: () => void }>}
 */
export const mountBrain = async (canvas, options = {}) => {
  const config = { ...BRAIN_CONFIG, ...(options.config || {}) };
  const tier = paramsFor(window.innerWidth);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const response = await fetch(options.url || BRAIN_MESH_URL);
  if (!response.ok) throw new Error(`mesh cervello: HTTP ${response.status}`);
  const mesh = decodeBrainMesh(await response.arrayBuffer());

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = options.cameraZ ?? 4.2;

  const uniforms = {
    iTime: { value: 0 },
    iAlpha: { value: 0 },
    iResolutionY: { value: 720 },
    uCool: { value: hexToLinear(config.colorCool) },
    uWarm: { value: hexToLinear(config.colorWarm) },
    uEdgeColor: { value: hexToLinear(config.colorEdge) },
    uCenterColor: { value: hexToLinear(config.colorCenter) },
    uSynapse: { value: hexToLinear(config.colorSynapse) },
    uDeepColor: { value: hexToLinear(config.colorDeep) },
    uCursorColor: { value: hexToLinear(config.colorCursor) },
    uHighlightColor: { value: hexToLinear("#2563eb") },
    uCenterRadius: { value: config.centerRadius },
    uCenterFalloff: { value: config.centerFalloff },
    uSize: { value: config.size },
    uSynapseRate: { value: config.synapseRate },
    uFlowSpeed: { value: config.flowSpeed },
    uFlowAmount: { value: config.flowAmount },
    uGlow: { value: config.glow },
    uDepthDarkness: { value: config.depthDarkness },
    uOcclusionStrength: { value: 0 },
    uHighlightPos: { value: new THREE.Vector3() },
    uHighlightRadius: { value: 0.6 },
    uHighlightStrength: { value: 0 },
    uFocusFadeStrength: { value: 0.55 },
    uIsolateStrength: { value: 0.88 },
    uExplode: { value: 1 },
    uExplodeDist: { value: 2.8 },
    uSwirl: { value: 4.2 },
    uFadeNear: { value: 1.5 },
    uFadeFar: { value: 2.7 },
    uMouse: { value: new THREE.Vector2(-10, -10) },
    uCursor: { value: tier.pointer ? 1 : 0 },
    uAspect: { value: 1 },
    uCursorRadius: { value: 0.1 },
  };

  const points = new THREE.Points(
    buildBrainGeometry(mesh, tier.brain, config.radius),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: BRAIN_VERT,
      fragmentShader: BRAIN_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  points.rotation.y = config.baseRotationY;
  scene.add(points);

  /*
     Due vettori, non uno.

     `pointerNdc` parte a (-10, -10): è la SENTINELLA che dice allo shader
     "nessun cursore", così l'evidenziazione non si accende da sola. Usarlo
     anche per l'inclinazione era un errore — dava `rotation.x = -10 × 0.22`,
     cioè −2,2 rad (−126°): il cervello nasceva coricato di traverso e si
     raddrizzava solo quando il mouse passava sopra la canvas.

     `tilt` è separato, parte da zero e si muove solo su un movimento reale del
     puntatore. Così la posa iniziale è quella progettata: profilo laterale.
  */
  const pointerNdc = new THREE.Vector2(-10, -10);
  const tilt = new THREE.Vector2(0, 0);
  const tiltTarget = new THREE.Vector2(0, 0);

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointerNdc.set(nx, ny);
    // Fuori dalla canvas l'inclinazione si riporta a zero invece di seguire
    // valori che crescono senza limite man mano che il cursore si allontana.
    const inside = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    tiltTarget.set(inside ? nx : 0, inside ? ny : 0);
  };
  if (tier.pointer) window.addEventListener("pointermove", onPointerMove, { passive: true });

  const detachResize = attachResize(canvas, (width) => {
    // Rapporto vicino al quadrato: il cervello è un volume, e in una fascia
    // bassa e larga veniva tagliato sopra e sotto — l'effetto "schiacciato".
    const height = Math.round(
      Math.min(width * (options.ratio ?? 0.78), options.maxHeight ?? 620),
    );
    canvas.style.width = "100%";
    canvas.style.height = height + "px";
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    uniforms.iResolutionY.value = height * renderer.getPixelRatio();
    uniforms.uAspect.value = camera.aspect;
  });

  // Si assembla alla prima entrata in viewport, e disegna solo mentre è visibile.
  let onScreen = false;
  let assembleStart = null;
  let spinAngle = 0;
  /*
     Si riforma a OGNI ingresso nella pagina, non solo al primo.
     Il sito è un router: si entra e si esce da ATLAS di continuo, e una scena
     che si assembla una volta sola la vedresti formarsi soltanto la prima
     volta in assoluto. Azzerare l'orologio sul passaggio nascosto → visibile
     fa ripartire la scia ogni volta che apri la pagina.
  */
  const observer = new IntersectionObserver(
    ([entry]) => { onScreen = entry.isIntersecting; },
    { threshold: 0.05 },
  );
  observer.observe(canvas);
  const detachPage = onPageEnter(canvas, () => {
  /*
     `onScreen = true` esplicito, senza aspettare l'IntersectionObserver.
     Quando il router attiva la pagina la visibilita' e' un fatto noto: restare
     in attesa della notifica di intersezione — che e' raggruppata e puo'
     arrivare con ritardo — lasciava il ciclo di disegno bloccato sul vecchio
     valore `false`, e la scena compariva secondi dopo il click.
  */
    onScreen = true;
    /*
       Ricostruzione del livello grafico all'ingresso in pagina.

       Quando l'antenato va in `display:none` WebKit scarta il livello di
       composizione della canvas. Al ritorno la scena continua a renderizzare —
       uniform, camera e contatore dei frame risultano identici al caso
       funzionante, verificato con una sonda — ma il browser non compone piu'
       nulla e lo schermo resta vuoto o mostra un residuo.

       Due passaggi: rileggere le misure (il buffer di disegno) e forzare un
       ricalcolo del layout sulla canvas, che obbliga WebKit a ricreare il
       livello. Solo la rimisura non bastava.
    */
    canvas.style.display = "none";
    void canvas.offsetHeight;
    canvas.style.display = "block";
    // La rimisura va fatta DOPO che il browser ha rifatto il layout. Chiamata
    // qui dentro girerebbe nel microtask del MutationObserver, con il
    // contenitore ancora alle vecchie dimensioni (o a zero).
    requestAnimationFrame(() => detachResize.measure());
    assembleStart = null;
    spinAngle = 0;
  });

  const ASSEMBLE_MS = 2300;
  const clock = new THREE.Clock();
  let raf = null;
  let stopped = false;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (stopped || document.hidden) return;
    if (!onScreen) return;

    if (assembleStart === null) assembleStart = now;
    const t = Math.min(1, (now - assembleStart) / ASSEMBLE_MS);
    // Smoothstep, non ease-out cubica: quest'ultima è tutta caricata all'inizio
    // (all'85% del percorso a metà tempo), e la scia atterrava prima che
    // l'occhio la leggesse. Questa distribuisce il moto e chiude posandosi.
    const eased = t * t * (3 - 2 * t);
    uniforms.uExplode.value = reduceMotion.matches ? 0 : 1 - eased;
    // Sale quasi subito: la scia è il soggetto, non un preambolo da nascondere.
    uniforms.iAlpha.value = reduceMotion.matches ? 1 : Math.min(1, t * 6.0);

    const delta = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();
    uniforms.iTime.value = reduceMotion.matches ? 0 : time;
    uniforms.uMouse.value.copy(pointerNdc);

    if (!reduceMotion.matches) {
      /*
         Giro pieno a 360 gradi, non un'oscillazione — e l'angolo si ACCUMULA
         pesato sull'avanzamento della formazione, non sul tempo assoluto.
         Con il tempo assoluto, quando il cervello finisce di formarsi (3,8 s)
         avrebbe gia' ruotato di oltre 2 radianti: non lo vedresti mai nella
         posa di profilo per cui baseRotationY e' calibrato. Cosi' invece si
         chiude di profilo e da li' comincia a girare.
      */
      spinAngle += delta * config.spinSpeed * eased;
      points.rotation.y = config.baseRotationY + spinAngle;
      // Si orienta appena verso il cursore, così reagisce senza inseguirlo.
      tilt.lerp(tiltTarget, 1 - Math.pow(1 - 0.06, delta * 60));
      points.rotation.x = tilt.y * config.cursorTilt;
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      detachPage();
      detachResize();
      window.removeEventListener("pointermove", onPointerMove);
      points.geometry.dispose();
      points.material.dispose();
      renderer.dispose();
    },
  };
};

/* ─── Galassia (home) ───────────────────────────────────────────────────────
   Spirale a due bracci più un rigonfiamento centrale 3D, entrambi ricavati da
   hash per-vertice delle posizioni di una sfera: la geometria è solo un
   reticolo di semi, non viene mai disegnata come sfera. I bracci ruotano col
   tempo, quindi la scena è viva senza bisogno dello scroll. */

export const GALAXY_CONFIG = {
  // Ciano al centro, verde ai bracci: lo stesso gradiente delle altre due scene.
  colorCore: "#00d4ff",
  colorEdge: "#00e8a2",
  opacity: 0.55,
  pointSize: 6.5,
  brightness: 1.18,
  armSpin: 0.4,
  tilt: -0.5,
  scale: 0.18,
  // Più vicina dell'originale (48): là il disco divideva l'inquadratura con
  // l'orb e il cervello, qui ha il riquadro tutto per sé e può riempirlo.
  cameraZ: 39,
  parallax: 4,
  pointerRadius: 5,
  pointerStrength: 2,
  /** Da quanto lontano arrivano le stelle e da che parte. */
  spawnSpread: 26,
  spawnBiasX: -110,
};

const GALAXY_VERT = /* glsl */ `
  uniform float uTime, uSize, uArmSpin, uScale, uBlow, uAssemble;
  uniform vec3  uColEdge, uColCore, uCursor;
  uniform float uRepelRadius, uRepelStrength, uActivity;
  uniform float uSpawnSpread;
  uniform vec3 uSpawnBias;
  uniform float uEdgeStart;
  varying float vFade;
  varying vec3  vColor;
  varying float vEdge;

  void main() {
    float gRnd1 = fract(sin(dot(position.xyz, vec3(12.989, 78.233, 45.164))) * 43758.545);
    float gRnd2 = fract(sin(dot(position.xyz, vec3(93.989, 67.345, 54.256))) * 24634.634);
    float gRnd3 = fract(sin(dot(position.xyz, vec3(43.332, 11.235, 89.234))) * 56475.234);
    float gRnd4 = fract(sin(dot(position.xyz, vec3(75.321, 32.123, 23.456))) * 35432.123);

    float galaxyR = pow(gRnd1, 2.0) * 60.0 + pow(gRnd2, 3.0) * 30.0;
    float swirl = pow(galaxyR, 1.1) * 0.08;
    float armIndex = floor(gRnd2 * 2.0);
    float baseAngle = armIndex * 3.14159265;
    float uniformTheta = gRnd3 * 2.0 - 1.0;
    float dTheta = pow(uniformTheta, 5.0) * 3.14159;
    float theta = baseAngle + swirl + dTheta + uTime * uArmSpin;

    float gx = galaxyR * cos(theta);
    float gz = galaxyR * sin(theta);
    float gyDisc = pow(gRnd4 * 2.0 - 1.0, 3.0) * 1.5;
    vec3 basePos = vec3(gx, gyDisc, gz);

    float bulgeStrength = smoothstep(25.0, 0.0, galaxyR);
    float gRnd5 = fract(sin(gRnd1 * 44.44 + gRnd2) * 555.55);
    float gRnd6 = fract(sin(gRnd3 * 66.66 + gRnd4) * 777.77);
    float gRnd7 = fract(sin(gRnd5 * 88.88 + gRnd6) * 999.99);
    float phi = acos(gRnd5 * 2.0 - 1.0);
    float thetaS = gRnd6 * 6.2831853 + uTime * (uArmSpin * 2.0);
    float rS = pow(gRnd7, 2.0) * 18.0;
    vec3 bulge = vec3(rS * sin(phi) * cos(thetaS), rS * cos(phi), rS * sin(phi) * sin(thetaS));

    vec3 galaxyPos = mix(basePos, bulge, bulgeStrength);
    vec3 blowDir = normalize(vec3(gRnd1, gRnd2, gRnd3) - 0.5 + 0.0001);

    // Ingresso: ogni stella arriva da lontano lungo il proprio vettore, con il
    // proprio ritardo, così il disco si raduna da polvere alla deriva.
    float delay = gRnd4 * 0.62;
    float at = clamp((1.0 - uAssemble - delay) / (1.0 - delay), 0.0, 1.0);
    float aEase = 1.0 - pow(1.0 - at, 3.0);
    /*
       Origine delle stelle. Prima era un guscio di raggio 70 CENTRATO sulla
       galassia: due conseguenze indesiderate, una volta spostato il disco a
       destra. Le stelle nascevano tutt'intorno al disco, quindi a destra; e a
       70 unita' erano fuori inquadratura, quindi per il primo mezzo secondo la
       sezione sembrava vuota.

       Ora il guscio e' piu' stretto e traslato a SINISTRA (uSpawnBias): le
       stelle entrano dal margine sinistro, attraversano la colonna del titolo
       e si raccolgono nel disco a destra.
    */
    /*
       SCIA, non blocco.

       Prima ogni stella nasceva alla STESSA distanza a sinistra: la nuvola
       aveva la forma del disco finale, solo traslata, e si spostava tutta
       insieme — si leggeva come un blocco che scivola, non come una scia.

       Qui la distanza di partenza cresce col ritardo del singolo punto: chi
       arriva per ultimo nasce molto piu' lontano. Il risultato e' una coda che
       si allunga fuori dal margine sinistro, con la testa che raggiunge il
       disco mentre il resto e' ancora in viaggio.

       La dispersione trasversale si stringe con la distanza, cosi' la coda e'
       un flusso affusolato e non un tubo di spessore costante.
    */
    float scia = 0.30 + delay * 2.6;
    vec3 spawn = galaxyPos
      + blowDir * uSpawnSpread * (1.0 - delay * 0.55)
      + uSpawnBias * scia
      + vec3(0.0, (gRnd3 - 0.5) * 22.0 * (1.0 - delay * 0.5), 0.0);
    galaxyPos = mix(spawn, galaxyPos, aEase);
    galaxyPos += blowDir * uBlow * 90.0;

    vec3 finalPos = galaxyPos * uScale;
    vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);

    vec3 toP = modelPosition.xyz - uCursor;
    float cd = length(toP);
    float fall = smoothstep(uRepelRadius, 0.0, cd);
    modelPosition.xyz += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * uActivity;
    vec4 mvPosition = viewMatrix * modelPosition;

    float coreMix = smoothstep(80.0, 0.0, galaxyR);
    vColor = mix(uColEdge, uColCore, clamp(coreMix, 0.0, 1.0));

    float isOrb = step(0.98, fract(gRnd1 * 77.77));
    float starSize = mix(1.0, 3.0, isOrb);
    vFade = mix(0.7, 1.0, isOrb);

    gl_PointSize = uSize * starSize * (10.0 / -mvPosition.z);
    gl_PointSize = max(gl_PointSize, 1.5);
    gl_Position = projectionMatrix * mvPosition;

    /*
       Dissolvenza sui bordi della canvas, in spazio schermo.

       La scia in arrivo e' piu' larga del riquadro e veniva tagliata di netto
       dal suo bordo: su desktop il taglio cade fuori dalla finestra e non si
       nota, su mobile la canvas e' alta un terzo di schermo e il rettangolo
       nero si vede in mezzo alla pagina. Qui le stelle si spengono prima di
       arrivare al bordo, su tutti e quattro i lati.
    */
    vec2 ndc = gl_Position.xy / max(0.0001, gl_Position.w);
    vEdge = (1.0 - smoothstep(uEdgeStart, 1.0, abs(ndc.y)))
          * (1.0 - smoothstep(uEdgeStart, 1.0, abs(ndc.x)));
  }`;

const GALAXY_FRAG = /* glsl */ `
  uniform float uOpacity, uBrightness, uAppear, uFade;
  varying float vFade;
  varying vec3  vColor;
  varying float vEdge;
  void main() {
    vec2 xy = gl_PointCoord - 0.5;
    float ll = length(xy);
    if (ll > 0.5) discard;
    float a = smoothstep(0.5, 0.1, ll);
    gl_FragColor = vec4(vColor * uBrightness, vFade * a * uOpacity * uAppear * uFade * vEdge);
  }`;


/* ─── Costellazione di fondo (dietro la galassia) ───────────────────────────
   Un guscio di stelle fisse, disegnato PRIMA del disco e senza inclinazione:
   e' il cielo, non fa parte della galassia e non ruota con lei. Restano
   bianche appena virate al ciano — se le colorassi come i bracci, il fondo
   tornerebbe a leggersi blu invece che nero. */

const STARS_VERT = /* glsl */ `
  attribute float aMag;
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  varying float vMag;
  void main() {
    // Scintillio lento e sfasato per stella: senza, il cielo pulsa tutto
    // insieme e si legge come un lampeggio invece che come stelle.
    float twinkle = 0.72 + 0.28 * sin(uTime * 0.7 + aPhase * 6.2831);
    vMag = aMag * twinkle;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aMag * (300.0 / -mv.z);
  }`;

const STARS_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vMag;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(uColor, soft * soft * vMag);
  }`;

/** Guscio di stelle a distanza fissa, densita' proporzionale alla fascia. */
const buildStarfield = (count, radius) => {
  const positions = new Float32Array(count * 3);
  const mags = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Distribuzione uniforme sulla sfera: cos(phi) va estratto uniformemente,
    // altrimenti le stelle si addensano ai poli.
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const sr = Math.sqrt(Math.max(0, 1 - u * u));
    const dist = radius * (0.85 + Math.random() * 0.3);
    positions[i * 3] = Math.cos(theta) * sr * dist;
    positions[i * 3 + 1] = u * dist;
    positions[i * 3 + 2] = Math.sin(theta) * sr * dist;
    // Poche stelle luminose, molte deboli: una distribuzione piatta fa un
    // cielo finto, tutto della stessa intensita'.
    mags[i] = Math.pow(Math.random(), 2.6) * 0.9 + 0.1;
    phases[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aMag", new THREE.BufferAttribute(mags, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  return geometry;
};

/**
 * Monta la galassia su una canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ destroy: () => void }}
 */
export const mountGalaxy = (canvas, options = {}) => {
  const config = { ...GALAXY_CONFIG, ...(options.config || {}) };
  const tier = paramsFor(window.innerWidth);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.z = options.cameraZ ?? config.cameraZ;

  /**
   * `SphereGeometry` è indicizzata, e `THREE.Points` rispetta l'indice: ogni
   * vertice è referenziato ~6 volte dalla lista dei triangoli, quindi la sfera
   * disegnerebbe ~6× le sprite per le stesse stelle, impilate una sull'altra.
   * Togliendo l'indice ogni stella viene disegnata una volta sola — e poiché il
   * blend additivo è lineare, si recupera l'immagine originale scalando
   * l'opacità per il fattore di duplicazione.
   */
  const geometry = new THREE.SphereGeometry(4.2, tier.galaxyW, tier.galaxyH);
  const vertices = geometry.attributes.position.count;
  const duplicates = geometry.index ? geometry.index.count / vertices : 1;
  geometry.setIndex(null);

  const uniforms = {
    uTime: { value: 0 },
    uAppear: { value: 0 },
    uFade: { value: 1 },
    uBlow: { value: 0 },
    uAssemble: { value: 1 },
    uColEdge: { value: hexToLinear(config.colorEdge) },
    uColCore: { value: hexToLinear(config.colorCore) },
    uOpacity: { value: config.opacity * duplicates },
    uSize: { value: config.pointSize },
    uBrightness: { value: config.brightness },
    uArmSpin: { value: config.armSpin },
    uScale: { value: config.scale },
    uCursor: { value: new THREE.Vector3() },
    uRepelRadius: { value: config.pointerRadius },
    uRepelStrength: { value: config.pointerStrength },
    uActivity: { value: 0 },
    // In unita' locali della galassia: uScale (0.18) le porta in unita' mondo,
    // quindi -110 sono circa 20 unita' a sinistra del centro del disco.
    uSpawnSpread: { value: config.spawnSpread ?? 26 },
    uSpawnBias: { value: new THREE.Vector3(config.spawnBiasX ?? -110, 0, 0) },
    uEdgeStart: { value: 0.82 },
  };

  const group = new THREE.Group();
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: GALAXY_VERT,
      fragmentShader: GALAXY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  group.add(points);
  group.rotation.x = -config.tilt;
  scene.add(group);

  // Il cielo: fuori dal gruppo inclinato, cosi' non ruota con il disco.
  const starGeometry = buildStarfield(Math.round(tier.brain / 90), 150);
  const starUniforms = {
    uTime: { value: 0 },
    uSize: { value: 2.8 },
    uColor: { value: hexToLinear("#cfe9ff") },
  };
  const stars = new THREE.Points(
    starGeometry,
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: STARS_VERT,
      fragmentShader: STARS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  stars.frustumCulled = false;
  scene.add(stars);

  const pointerNdc = new THREE.Vector2();
  const cursor = new THREE.Vector3();
  const cursorTarget = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  let activity = 0;

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  if (tier.pointer) window.addEventListener("pointermove", onPointerMove, { passive: true });

  const detachResize = attachResize(canvas, (width, parentHeight) => {
    if (options.fill) {
      /*
         Modalita' a tutta sezione: la canvas riempie il contenitore invece di
         essere un quadrato. Serve perche' le particelle nascano fuori campo a
         sinistra e attraversino la colonna del titolo prima di raccogliersi.

         Il disco resta inquadrato a destra spostando la CAMERA a sinistra, non
         il gruppo: cosi' il centro di rotazione, la spirale e la proiezione del
         cursore restano coerenti fra loro. L'offset e' una frazione della
         semi-larghezza visibile, quindi tiene su qualsiasi formato.
      */
      /*
         Guardia sull'altezza. Misurata durante un cambio pagina puo' arrivare
         quasi a zero: l'aspetto schizzerebbe a valori enormi e l'offset di
         camera — che e' proporzionale all'aspetto — spingerebbe la galassia
         fuori inquadratura, lasciando in vista solo un bordo. Sotto una soglia
         plausibile si ripiega su una proporzione fissa.
      */
      const misurata = parentHeight || 0;
      const height = misurata > 120 ? misurata : Math.round(width * 0.62);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      // Su schermo stretto il disco va CENTRATO: l'offset laterale, pensato per
      // lasciare spazio alla colonna del titolo, qui lo spingerebbe mezzo fuori
      // inquadratura. La soglia e' la stessa a cui il sito passa a una colonna.
      const frac = width < 700 ? 0 : (options.offsetXFrac ?? 0);
      camera.position.x = -frac * halfHeight * camera.aspect;

      // Su schermo stretto il disco va avvicinato, altrimenti resta un
      // francobollo in mezzo al nero: il riquadro e' un terzo di quello
      // desktop, ma la distanza di camera era la stessa.
      camera.position.z = width < 700 ? (options.cameraZMobile ?? 19.5) : (options.cameraZ ?? config.cameraZ);
      camera.updateProjectionMatrix();

      /*
         Sprite piu' fini su schermo stretto.

         Nello shader la dimensione scala con l'inverso della distanza di
         camera: avvicinandola da 39 a 26 le stelle sono cresciute di circa
         mezzo. Senza compensare si ottengono pochi punti grossi invece di una
         polvere fitta, cioe' l'opposto di cio' che serve su un piccolo schermo.
      */
      // 0.36 = il vecchio 0.48 diviso 26/19.5: avvicinando la camera le sprite
      // crescerebbero della stessa proporzione, e tornerebbero grosse.
      uniforms.uSize.value = config.pointSize * (width < 700 ? 0.36 : 1);
      // Su mobile la sfumatura parte prima: il riquadro e' corto e il bordo
      // cade dentro la pagina, non fuori dalla finestra.
      uniforms.uEdgeStart.value = width < 700 ? 0.55 : 0.82;
      return;
    }

    const side = Math.min(width, parentHeight || width, options.maxSize ?? 680);
    canvas.style.width = side + "px";
    canvas.style.height = side + "px";
    renderer.setSize(side, side, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  });

  let onScreen = true;
  /*
     Si riforma a OGNI ingresso in pagina, non solo al primo.
     Il sito e' un router: si entra e si esce dalle pagine di continuo, e una
     scena che si assembla una volta sola la ritroveresti gia' fatta al
     rientro. Azzerare l'orologio sul passaggio nascosto -> visibile fa
     ripartire la formazione ogni volta.
  */
  const observer = new IntersectionObserver(
    ([entry]) => { onScreen = entry.isIntersecting; },
    { threshold: 0 },
  );
  observer.observe(canvas);
  const detachPage = onPageEnter(canvas, () => {
  /*
     `onScreen = true` esplicito, senza aspettare l'IntersectionObserver.
     Quando il router attiva la pagina la visibilita' e' un fatto noto: restare
     in attesa della notifica di intersezione — che e' raggruppata e puo'
     arrivare con ritardo — lasciava il ciclo di disegno bloccato sul vecchio
     valore `false`, e la scena compariva secondi dopo il click.
  */
    onScreen = true;
    /*
       Ricostruzione del livello grafico all'ingresso in pagina.

       Quando l'antenato va in `display:none` WebKit scarta il livello di
       composizione della canvas. Al ritorno la scena continua a renderizzare —
       uniform, camera e contatore dei frame risultano identici al caso
       funzionante, verificato con una sonda — ma il browser non compone piu'
       nulla e lo schermo resta vuoto o mostra un residuo.

       Due passaggi: rileggere le misure (il buffer di disegno) e forzare un
       ricalcolo del layout sulla canvas, che obbliga WebKit a ricreare il
       livello. Solo la rimisura non bastava.
    */
    canvas.style.display = "none";
    void canvas.offsetHeight;
    canvas.style.display = "block";
    // La rimisura va fatta DOPO che il browser ha rifatto il layout. Chiamata
    // qui dentro girerebbe nel microtask del MutationObserver, con il
    // contenitore ancora alle vecchie dimensioni (o a zero).
    requestAnimationFrame(() => detachResize.measure());
    assembleStart = null;
  }, options.pageSelector);

  const ASSEMBLE_MS = 2400;
  const clock = new THREE.Clock();
  let assembleStart = null;
  let raf = null;
  let stopped = false;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (stopped || !onScreen || document.hidden) return;

    if (assembleStart === null) assembleStart = now;
    const t = Math.min(1, (now - assembleStart) / ASSEMBLE_MS);
    // Smoothstep, non ease-out cubica. La cubica e' tutta caricata all'inizio:
    // a un terzo del tempo era gia' al 76%, e la formazione si leggeva come un
    // lampo — al rientro in pagina sembrava che la galassia fosse gia' fatta.
    const eased = t * t * (3 - 2 * t);
    // `uAssemble` va da 1 (disperso) a 0 (radunato) — vedi lo shader.
    uniforms.uAssemble.value = reduceMotion.matches ? 0 : 1 - eased;
    // Sale quasi subito. Prima seguiva la curva di assemblaggio: con le stelle
    // che partono a 70 unita' dal centro, per il primo secondo non c'era nulla
    // di visibile — la galassia sembrava partire in ritardo.
    // Piena entro il 10% del percorso: le stelle in viaggio devono essere
    // visibili subito, altrimenti il primo mezzo secondo sembra vuoto.
    uniforms.uAppear.value = reduceMotion.matches ? 1 : Math.min(1, t * 10.0);

    const delta = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value = reduceMotion.matches ? 0 : clock.getElapsedTime();
    starUniforms.uTime.value = uniforms.uTime.value;

    group.rotation.z = tier.pointer ? pointerNdc.x * 0.12 : 0;

    // Vuoto sotto il cursore: il puntatore proiettato sul piano z = 0.
    cursorTarget.set(0, 0, 0);
    if (tier.pointer && !reduceMotion.matches) {
      ndc.set(pointerNdc.x, pointerNdc.y, 0.5).unproject(camera);
      rayDir.copy(ndc).sub(camera.position).normalize();
      if (Math.abs(rayDir.z) > 1e-4) {
        const k = -camera.position.z / rayDir.z;
        if (k > 0 && Number.isFinite(k)) cursorTarget.copy(camera.position).addScaledVector(rayDir, k);
      }
    }
    cursor.lerp(cursorTarget, 0.12);
    uniforms.uCursor.value.copy(cursor);

    const wanted = tier.pointer && !reduceMotion.matches ? 1 : 0;
    activity += (wanted - activity) * Math.min(1, delta * 4);
    uniforms.uActivity.value = activity;

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      detachPage();
      detachResize();
      window.removeEventListener("pointermove", onPointerMove);
      geometry.dispose();
      points.material.dispose();
      starGeometry.dispose();
      stars.material.dispose();
      renderer.dispose();
    },
  };
};

/* ═══════════════════════════════════════════════════════════════════════════
   SISTEMA — sfera di particelle con lune in orbita (pagina Servizi)

   Non è l'orb di SABE: quello è una superficie a olio, deformata dal rumore e
   forata lungo l'asse della camera. Qui serve un GUSCIO di punti — una sfera
   piena e granulosa che si legge tutta, con il lato lontano più fioco — e dei
   corpi che le girano intorno lasciando una scia sull'orbita.
   ═══════════════════════════════════════════════════════════════════════════*/

export const SYSTEM_CONFIG = {
  /** Punte luminose, corpo del guscio, lembo: dal bianco al verde del sito. */
  colorHot: "#dcf7ff",
  colorBody: "#00d4ff",
  colorRim: "#00e8a2",

  radius: 1,
  /** Distanza di camera: la stessa scala dei render di SABE e ATLAS, dove la
      forma riempie il riquadro invece di starci in mezzo. */
  cameraZ: 3.5,
  cameraZMobile: 3.2,
  /** Spessore del guscio: senza, la sfera si legge come una griglia. */
  shellJitter: 0.045,
  /** Rotazione su sé stessa, radianti al secondo. Lenta: la scena deve
      respirare, non girare. */
  spin: 0.055,
  /** Ondulazione della superficie e sua velocità — il "vivo" della sfera. */
  wobble: 0.05,
  wobbleSpeed: 0.1,
  /** Quanto restano visibili i punti sul lato lontano. */
  backFade: 0.46,

  /*
     Taratura presa dal cervello di ATLAS: tantissime particelle, ciascuna
     minuta. È quella densità a dare una superficie continua invece di una
     manciata di punti grossi.
  */
  pointSize: 9,
  brightness: 1.5,
  opacity: 1,

  /*
     Corpi in orbita. I primi due condividono il piano e stanno agli antipodi:
     è la diagonale che attraversa la scena. Il terzo gira più stretto e più
     veloce, e passa davanti alla sfera.
  */
  bodies: [
    { a: 1.3, b: 1.3, tiltX: -0.32, tiltZ: 0.5, speed: 0.72, phase: 0.9, radius: 0.14, trailSpan: 2.4 },
    { a: 1.3, b: 1.3, tiltX: -0.32, tiltZ: 0.5, speed: 0.72, phase: 4.04, radius: 0.11, trailSpan: 2.1 },
    { a: 1.13, b: 1.08, tiltX: 0.5, tiltZ: -0.3, speed: 1.05, phase: 2.2, radius: 0.08, trailSpan: 1.7 },
  ],
  /** Dimensione delle sprite dei corpi e delle scie. */
  bodySize: 10,
  trailSize: 7,
};

const SPHERE_VERT = /* glsl */ `
  uniform float uTime, uSize, uPR, uAssemble, uWobble, uWobbleSpeed, uBackFade, uRadius;
  uniform vec3  uColHot, uColBody, uColRim;

  attribute vec3  aRnd;
  attribute float aMag;

  varying vec3  vColor;
  varying float vAlpha;
  varying float vEdge;

  ${SNOISE}

  void main(){
    vec3 p = position;

    // Respiro della superficie: un solo strato di rumore, lento. Due strati
    // come sull'orb di SABE farebbero increspature — qui serve una sfera che
    // ondeggia appena, non un liquido.
    float n = snoise(p * 1.7 + vec3(0.0, uTime * uWobbleSpeed, 0.0));
    vec3 pos = p * (1.0 + uWobble * n);

    // Ingresso: i punti arrivano da fuori campo lungo la loro direzione
    // radiale e si posano sul guscio, scaglionati.
    float delay = (aRnd.z + 0.5) * 0.5;
    float t = clamp((uAssemble - delay) / max(0.0001, 1.0 - delay), 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - t, 3.0);
    vec3 spawn = pos * 2.1 + aRnd * 0.9;
    pos = mix(spawn, pos, ease);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 centro = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    /*
       Profondità dentro il guscio. In spazio vista la camera guarda lungo -z,
       quindi un punto con z maggiore del centro sta davanti. Il lato lontano
       resta visibile ma si spegne: è ciò che fa leggere il volume invece di un
       disco pieno di puntini.
    */
    float rel = (mv.z - centro.z) / uRadius;
    float fronte = smoothstep(-1.0, 1.0, rel);
    vAlpha = mix(uBackFade, 1.0, fronte) * ease * aMag;

    // Tinta: verde sul lembo, ciano sul corpo, punte quasi bianche dove le
    // particelle sono più luminose. Stesso gradiente delle altre scene.
    float lembo = 1.0 - abs(rel);
    vec3 col = mix(uColBody, uColRim, lembo * 0.78);
    vColor = mix(col, uColHot, smoothstep(0.72, 1.0, aMag));

    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPR * (0.45 + aMag * 0.75) * (1.0 / max(0.35, -mv.z));

    // Dissolvenza sui quattro lati: senza, il bordo del buffer taglia le
    // particelle di netto e in pagina compare un riquadro.
    vec2 ndc = gl_Position.xy / max(0.0001, gl_Position.w);
    float largo = (1.0 - smoothstep(0.3, 0.95, abs(ndc.x)))
                * (1.0 - smoothstep(0.3, 0.95, abs(ndc.y)));
    float stretto = (1.0 - smoothstep(0.82, 1.0, abs(ndc.x)))
                  * (1.0 - smoothstep(0.82, 1.0, abs(ndc.y)));
    vEdge = mix(largo, stretto, smoothstep(0.72, 1.0, uAssemble));
  }`;

const SPHERE_FRAG = /* glsl */ `
  uniform float uOpacity, uBrightness;
  varying vec3  vColor;
  varying float vAlpha;
  varying float vEdge;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float soft = 1.0 - smoothstep(0.3, 0.5, r);
    gl_FragColor = vec4(vColor * uBrightness, soft * vAlpha * uOpacity * vEdge);
  }`;

/** Guscio di Fibonacci: distribuzione uniforme, senza le file ai poli che
    darebbe una griglia sferica. */
const buildShellGeometry = (count, radius, jitter) => {
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count * 3);
  const mags = new Float32Array(count);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    // Spessore: il guscio non è una buccia matematica, ha una profondità.
    const dist = radius * (1 + (Math.random() - 0.5) * 2 * jitter);
    positions[i * 3] = Math.cos(th) * r * dist;
    positions[i * 3 + 1] = y * dist;
    positions[i * 3 + 2] = Math.sin(th) * r * dist;
    randoms[i * 3] = Math.random() - 0.5;
    randoms[i * 3 + 1] = Math.random() - 0.5;
    randoms[i * 3 + 2] = Math.random() - 0.5;
    // Poche particelle molto luminose, molte deboli: una distribuzione piatta
    // dà una palla uniforme, senza il brillio della polvere.
    mags[i] = Math.pow(Math.random(), 1.5) * 0.78 + 0.22;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aRnd", new THREE.BufferAttribute(randoms, 3));
  geometry.setAttribute("aMag", new THREE.BufferAttribute(mags, 1));
  return geometry;
};

/* ─── Corpi in orbita e loro scia ───────────────────────────────────────────
   La scia non è l'anello dell'orbita: è la porzione di percorso appena
   attraversata, che sfuma dietro il corpo. Vive nello shader — l'angolo del
   corpo è una uniform e ogni particella sta indietro di un suo delta — così
   non c'è nulla da riscrivere sulla CPU a ogni frame. */

const BODY_VERT = /* glsl */ `
  uniform float uTime, uSize, uPR, uAppear, uAngle, uA, uB, uSpan, uBodyR;
  uniform float uIsTrail;

  attribute vec3  aRnd;
  attribute float aMag;
  attribute float aDelta;   // quanto sta indietro rispetto al corpo, in radianti

  varying float vAlpha;
  varying float vEdge;

  void main(){
    // Il corpo sta sull'ellisse, la scia lungo l'arco che lo precede.
    float ang = uAngle - aDelta;
    vec3 centro = vec3(cos(ang) * uA, 0.0, sin(ang) * uB);

    // La scia si allarga allontanandosi dal corpo: si sfilaccia, non è un tubo.
    float coda = uSpan > 0.0 ? aDelta / uSpan : 0.0;
    // Sottile: la scia deve leggersi come una traccia sul percorso, non come
    // una nuvola che si sfilaccia. Si allarga appena verso la coda.
    vec3 sparso = aRnd * uBodyR * mix(0.3, 0.75, coda);
    vec3 pos = centro + mix(aRnd * uBodyR, sparso, uIsTrail);

    // La coda si spegne allontanandosi. Il corpo no: uIsTrail lo esclude.
    float fade = mix(1.0, pow(1.0 - coda, 1.05), uIsTrail);
    float twinkle = 0.78 + 0.22 * sin(uTime * 1.3 + aMag * 21.0);
    vAlpha = aMag * fade * twinkle * uAppear;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPR * (0.5 + aMag * 0.7) * (1.0 / max(0.35, -mv.z));

    // Dissolvenza sui quattro lati: senza, il bordo del buffer taglia le
    // particelle di netto e in pagina compare un riquadro.
    vec2 ndc = gl_Position.xy / max(0.0001, gl_Position.w);
    float largo = (1.0 - smoothstep(0.3, 0.95, abs(ndc.x)))
                * (1.0 - smoothstep(0.3, 0.95, abs(ndc.y)));
    float stretto = (1.0 - smoothstep(0.82, 1.0, abs(ndc.x)))
                  * (1.0 - smoothstep(0.82, 1.0, abs(ndc.y)));
    vEdge = mix(largo, stretto, smoothstep(0.72, 1.0, uAppear));
  }`;

const BODY_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity, uDim;
  varying float vAlpha;
  varying float vEdge;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float soft = 1.0 - smoothstep(0.28, 0.5, r);
    gl_FragColor = vec4(uColor, soft * vAlpha * uOpacity * uDim * vEdge);
  }`;

/** Nuvola per un corpo o per la sua scia. `span` a 0 = corpo compatto. */
const buildBodyGeometry = (count, span) => {
  const randoms = new Float32Array(count * 3);
  const mags = new Float32Array(count);
  const deltas = new Float32Array(count);
  const positions = new Float32Array(count * 3); // richiesto da three, non usato

  for (let i = 0; i < count; i++) {
    // Gaussiana grezza (somma di uniformi): concentra al centro, e per il
    // corpo è ciò che lo fa leggere come una sfera invece che come un dado.
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    randoms[i * 3] = g();
    randoms[i * 3 + 1] = g();
    randoms[i * 3 + 2] = g();
    mags[i] = Math.pow(Math.random(), 1.7) * 0.8 + 0.2;
    // Più particelle vicino al corpo che in fondo alla coda.
    deltas[i] = span > 0 ? Math.pow(Math.random(), 1.6) * span : 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aRnd", new THREE.BufferAttribute(randoms, 3));
  geometry.setAttribute("aMag", new THREE.BufferAttribute(mags, 1));
  geometry.setAttribute("aDelta", new THREE.BufferAttribute(deltas, 1));
  return geometry;
};

/**
 * Monta la sfera di particelle con i corpi in orbita (pagina Servizi).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ config?: object, cameraZ?: number, density?: number }} [options]
 * @returns {{ destroy: () => void }}
 */
export const mountSystem = (canvas, options = {}) => {
  const config = { ...SYSTEM_CONFIG, ...(options.config || {}) };
  const tier = paramsFor(window.innerWidth);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // `tier.brain` è il budget del cervello: cinque volte quello della sfera di
  // SABE, ed è ciò che serve perché il guscio si legga come una superficie.
  const count = Math.round(tier.brain * (options.density ?? 1));

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pixelRatio = renderer.getPixelRatio();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  const uniforms = {
    uTime: { value: 0 },
    uPR: { value: pixelRatio },
    uSize: { value: config.pointSize },
    uAssemble: { value: 0 },
    uWobble: { value: config.wobble },
    uWobbleSpeed: { value: config.wobbleSpeed },
    uBackFade: { value: config.backFade },
    uRadius: { value: config.radius },
    uOpacity: { value: config.opacity },
    uBrightness: { value: config.brightness },
    uColHot: { value: hexToLinear(config.colorHot) },
    uColBody: { value: hexToLinear(config.colorBody) },
    uColRim: { value: hexToLinear(config.colorRim) },
  };

  const shell = new THREE.Points(
    buildShellGeometry(count, config.radius, config.shellJitter),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SPHERE_VERT,
      fragmentShader: SPHERE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  shell.frustumCulled = false;
  scene.add(shell);

  // ── Corpi in orbita ────────────────────────────────────────────────────────
  const sistema = new THREE.Group();
  scene.add(sistema);
  const corpi = [];
  const risorse = [];
  // I corpi NON scalano col guscio: sono oggetti piccoli, e legarli a un
  // conteggio cinque volte più alto li farebbe diventare palle solide.
  const bodyCount = Math.max(420, Math.round(tier.count * 0.05));
  const trailCount = Math.max(700, Math.round(tier.count * 0.12));

  for (const spec of config.bodies) {
    const piano = new THREE.Group();
    piano.rotation.x = spec.tiltX;
    piano.rotation.z = spec.tiltZ;
    sistema.add(piano);

    const parti = [];
    for (const [tipo, conteggio, span, size] of [
      ["scia", trailCount, spec.trailSpan, config.trailSize],
      ["corpo", bodyCount, 0, config.bodySize],
    ]) {
      const geometry = buildBodyGeometry(conteggio, span);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPR: { value: pixelRatio },
          uSize: { value: size },
          uAppear: { value: 0 },
          uAngle: { value: spec.phase },
          uA: { value: spec.a },
          uB: { value: spec.b },
          uSpan: { value: span },
          uBodyR: { value: spec.radius },
          uIsTrail: { value: tipo === "scia" ? 1 : 0 },
          uOpacity: { value: tipo === "scia" ? 1 : 1 },
          uDim: { value: 1 },
          uColor: { value: hexToLinear(tipo === "scia" ? config.colorBody : config.colorHot) },
        },
        vertexShader: BODY_VERT,
        fragmentShader: BODY_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const punti = new THREE.Points(geometry, material);
      punti.frustumCulled = false;
      piano.add(punti);
      parti.push(material);
      risorse.push(geometry, material);
    }

    corpi.push({ spec, piano, materiali: parti });
  }

  const world = new THREE.Vector3();

  const detachResize = attachResize(canvas, (width, parentHeight) => {
    const side = Math.min(width, parentHeight || width, options.maxSize ?? 720);
    canvas.style.width = side + "px";
    canvas.style.height = side + "px";
    renderer.setSize(side, side, false);
    camera.aspect = 1;
    /*
       Distanza fissa, non più calcolata sulle orbite: la sfera deve avere la
       stessa presenza che hanno l'orb di SABE e il cervello di ATLAS nel loro
       riquadro. I corpi possono sfiorare il bordo — la dissolvenza li
       accompagna fuori senza tagli.
    */
    camera.position.z = options.cameraZ ?? (side < 420 ? config.cameraZMobile : config.cameraZ);
    camera.updateProjectionMatrix();

    // Le sprite seguono il lato della canvas, con un minimo: sotto, la scena
    // si dirada invece di rimpicciolire.
    const scale = Math.max(0.62, Math.min(1, side / 900));
    uniforms.uSize.value = config.pointSize * scale;
    uniforms.uPR.value = renderer.getPixelRatio();
    for (const corpo of corpi) {
      corpo.materiali[0].uniforms.uSize.value = config.trailSize * scale;
      corpo.materiali[1].uniforms.uSize.value = config.bodySize * scale;
    }
  });

  let onScreen = true;
  const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }, { threshold: 0 });
  observer.observe(canvas);

  const INTRO_MS = 2600;
  let introStart = null;
  let raf = null;
  let stopped = false;

  // Vedi mountGalaxy: WebKit scarta il livello di composizione quando un
  // antenato va in display:none, e va forzato a ricrearlo.
  const detachPage = onPageEnter(canvas, () => {
    onScreen = true;
    canvas.style.display = "none";
    void canvas.offsetHeight;
    canvas.style.display = "block";
    requestAnimationFrame(() => detachResize.measure());
    introStart = null;
  }, options.pageSelector);

  const clock = new THREE.Clock();

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (stopped || !onScreen || document.hidden) return;

    if (introStart === null) introStart = now;
    const t = Math.min(1, (now - introStart) / INTRO_MS);
    const eased = t * t * (3 - 2 * t);
    uniforms.uAssemble.value = reduceMotion.matches ? 1 : eased;

    const time = clock.getElapsedTime();
    uniforms.uTime.value = reduceMotion.matches ? 0 : time;
    if (!reduceMotion.matches) {
      shell.rotation.y = time * config.spin;
      // Oscillazione dell'asse: mezzo grado avanti e indietro, lentissima.
      // Senza, il guscio ruotando resta identico a sé stesso.
      shell.rotation.x = Math.sin(time * 0.07) * 0.12;
    }

    for (const corpo of corpi) {
      const angolo = corpo.spec.phase + (reduceMotion.matches ? 0 : time * corpo.spec.speed);
      for (const materiale of corpo.materiali) {
        materiale.uniforms.uAngle.value = angolo;
        materiale.uniforms.uTime.value = uniforms.uTime.value;
        materiale.uniforms.uAppear.value = reduceMotion.matches ? 1 : eased;
      }
      /*
         Un corpo dietro la sfera va attenuato a mano: le sprite sono additive
         e senza test di profondità, quindi passerebbe sopra il guscio come se
         gli stesse davanti.
      */
      world.set(Math.cos(angolo) * corpo.spec.a, 0, Math.sin(angolo) * corpo.spec.b);
      corpo.piano.localToWorld(world);
      const dietro = world.distanceTo(camera.position) > camera.position.length();
      const target = dietro ? 0.58 : 1;
      for (const materiale of corpo.materiali) {
        const dim = materiale.uniforms.uDim;
        dim.value += (target - dim.value) * 0.09;
      }
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      detachPage();
      detachResize();
      shell.geometry.dispose();
      shell.material.dispose();
      for (const risorsa of risorse) risorsa.dispose();
      renderer.dispose();
    },
  };
};


/* ═══════════════════════════════════════════════════════════════════════════
   VISIONE — il globo

   La stessa sfera dei Servizi, senza nulla che le giri intorno: un globo di
   particelle fini, con lo stesso budget e la stessa finezza del cervello di
   ATLAS. Vive di rotazione lenta e ondulazione — non ha bisogno d'altro.
   ═══════════════════════════════════════════════════════════════════════════*/

/**
 * Monta il globo su una canvas (pagina Visione).
 *
 * È `mountSystem` senza corpi in orbita: stessa geometria, stesso shader,
 * stessa taratura. Tenerne una sola implementazione significa che una
 * correzione al guscio vale per entrambe le pagine.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ destroy: () => void }}
 */
export const mountGlobe = (canvas, options = {}) =>
  mountSystem(canvas, {
    ...options,
    config: {
      bodies: [],
      // Un filo più fine e più lento della sfera dei Servizi: là il moto lo
      // danno i corpi, qui deve bastare il globo.
      pointSize: 8,
      spin: 0.045,
      wobble: 0.042,
      ...(options.config || {}),
    },
  });
