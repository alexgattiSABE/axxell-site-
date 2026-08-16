/* LUMINOUS SAUCER — un rapimento notturno.
 *
 * Portato da `luminous-saucer/luminous-saucer.html` (GetLayers). Questa è la
 * seconda stesura: la prima aveva semplificato via mezza scena, e si vedeva —
 * l'erba non compariva, il raggio era un cono di tinta piena, l'uomo non c'era
 * e il mouse spostava la camera di un terzo di quanto deve. Qui la scena è
 * quella del file: fondo, erba pmndrs, raggio a tre strati, alone, nebbia,
 * disco, uomo sospeso, e il passaggio finale di colore.
 *
 * ── COSA C'È E COSA NO ─────────────────────────────────────────────────────
 * Tutto quello che si vede nel file c'è. Restano fuori due cose che nel file
 * sono SPENTE nel CONFIG e quindi non si vedono nemmeno lì: gli anelli emissivi
 * sotto la fusoliera (`ringStr` e `coreStr` a 0 — le lampade vere sono dipinte
 * nella texture) e il pulviscolo dentro il raggio (`dustCount` a 0). Non sono
 * semplificazioni: sono rami morti del sorgente.
 *
 * ── I MODELLI ──────────────────────────────────────────────────────────────
 * Disco e uomo nell'originale stanno INLINE in base64 dentro due <script>, e
 * sono Draco-compressi: 2,4 MB + 206 KB. Spedirli così avrebbe voluto dire
 * imbarcare il decoder Draco in WASM per ogni visitatore. La decompressione si
 * paga UNA volta, offline — vedi `scripts/pack-saucer-glb.md` e
 * `scripts/pack-human-glb.md`. Qui arrivano due GLB normali.
 *
 * Il caricatore è il parser scritto a mano di `spine.js`, allargato ancora:
 * oltre a posizioni, normali e UV tira fuori TUTTE le texture che il file si
 * porta nei bufferView (base color, normal, metallic-roughness, emissive), che
 * sono WebP e quindi si passano al browser come Blob.
 *
 * ── PERCHÉ QUI IL MATERIALE È PBR, AL CONTRARIO DELLE ALTRE SEZIONI ────────
 * Le altre scene del sito sono shader che si illuminano da soli. Questa no, e
 * non per capriccio: il file usa `MeshStandardMaterial` con un ambiente + una
 * key fredda, e riaccende le lampade iniettando emissione dove l'albedo GREZZO
 * supera una soglia (`lampThresh`) — sono i finestrini dipinti nella texture.
 * La prima stesura aveva rifatto quel materiale a mano, e la fusoliera veniva
 * bianca e piatta: senza tone mapping, una texture di pannelli grigi chiari
 * satura. Le luci sono locali a QUESTA scena e a questo renderer, non toccano
 * il resto della pagina.
 *
 * ── IL PASSAGGIO DI COLORE ─────────────────────────────────────────────────
 * Il file rende dentro un EffectComposer: scena → bloom → passata finale che fa
 * linear→sRGB, satura, alza il contrasto, vignetta e sgrana. Il three r128 di
 * questa pagina è solo il core e non porta il composer. Qui la catena è a mano:
 * un render target a mezza virgola mobile, un bloom povero (soglia + due sfocature
 * separabili a un quarto di risoluzione) e una passata d'uscita che fa esattamente
 * i conti del file. Senza, il quadro è un altro: le lampade non alonano e i verdi
 * restano slavati.
 */
WC.register('saucer', function(ctx){
  var section = document.getElementById('capSaucer');
  var pin     = document.getElementById('wcSaucerPin');
  var canvas  = document.getElementById('wcSaucerCanvas');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;

  /* ==========================================================================
     CONFIG — i valori del CONFIG originale, non riaccordati a occhio.
     ========================================================================== */
  var CONFIG = {
    saucerSrc: 'assets/saucer.glb',
    humanSrc:  'assets/human.glb',
    grassDiffuse: 'assets/grass0.jpg',
    grassAlpha:   'assets/grass1.jpg',
    // fondo
    bgTop: '#010301', bgBottom: '#020f09', bgGlow: '#093a1e',
    bgGlowY: 0.15, bgGlowStr: 0.2,
    bgHorizon: '#0b3a24', bgHorizonY: 0.34, bgHorizonStr: 0.16,
    // stelle
    starColor: '#c6efdc', starStr: 0.6, starDensity: 58, starTwinkle: 1.6,
    // disco
    saucerScale: 2.0, saucerY: 4.5, saucerTilt: -0.13, saucerSpin: 0.05,
    bobAmount: 0.09, bobSpeed: 0.55,
    hullDark: 0.14, lampColor: '#bfffd8', lampStr: 2.8, lampThresh: 0.66,
    haloColor: '#8affc6', haloStr: 0.32, haloSize: 5.5,
    keyStr: 0.45, ambient: 0.22,
    // raggio
    beamColor: '#4dffab', beamTopR: 0.40, beamBotR: 1.30,
    beamWall: 0.42, beamCore: 0.5, beamNoise: 0.09, beamSpeed: 0.32, beamFade: 0.62,
    beamRayCount: 14, beamRayStr: 0.5, beamRaySpeed: 0.22, beamRaySharp: 2.4,
    // l'uomo sollevato dal raggio
    humanScale: 0.54, humanY: 1.6, humanZ: -0.56, humanYaw: 1.25,
    humanSpin: 0.08, humanTilt: -0.06, humanBob: 0.17, humanBobSpeed: 0.23,
    humanDark: 0.26, humanGlow: 0.7,
    // pozza a terra
    poolColor: '#5bffb0', poolRadius: 2.1, poolStr: 0.5,
    // erba
    grassRoot: '#010703', grassTip: '#0a3d18', grassLit: '#2fc76a',
    grassCount: 40000, grassArea: 4.5, grassHeight: 0.1, grassWidth: 0.005,
    litRadius: 1.45, litStr: 0.78, windSpeed: 1.3, windStr: 0.035,
    // foschia
    mistColor: '#0c3a22', mistStr: 0.65, mistHeight: 2.4, mistSpeed: 0.05,
    // camera / interazione
    // camZ è l'unico numero del CONFIG spostato dal file: 7.4 → 8.1. Nel file la
    // scena è a tutto schermo e non ha niente sopra; qui i primi 72 px sono la
    // barra di navigazione, che tagliava il bordo alto del disco. Tirare indietro
    // la camera di 0,7 unità rimpicciolisce il quadro dell'8% e fa passare sia il
    // disco sotto la barra sia il prato dentro il bordo basso. Alzare invece
    // `camTargetY` avrebbe fatto scendere il disco portandosi dietro il prato,
    // fuori dall'inquadratura.
    fov: 42, camY: 1.15, camZ: 8.1, camTargetY: 2.6, parallax: 0.30,
    // passaggio finale
    exposure: 1.0,
    bloomStrength: 0.36, bloomRadius: 0.28, bloomThreshold: 0.62,
    saturation: 1.24, contrast: 1.12, grain: 0.05, vignette: 1,
    fogDensity: 0.048
  };

  if (!ctx.motionOk || typeof THREE === 'undefined') { section.classList.add('-static'); return; }

  var wide   = window.innerWidth;
  var mobile = wide <= 640;
  var maxDpr = wide > 1024 ? 1.6 : 1.35;
  // 40.000 fili su un telefono sono 40.000 istanze da trasformare a ogni
  // fotogramma dentro una GPU che ha già un'altra scena da disegnare.
  var nGrass = mobile ? 9000 : (wide <= 1024 ? 20000 : CONFIG.grassCount);
  // Il bloom è tre passate in più: sullo scaglione più debole si spegne e resta
  // l'alone geometrico, che è già la parte grossa del bagliore.
  var useBloom = !mobile;

  /* Il colore scritto a mano è sRGB; gli shader lavorano in luce LINEARE (la
   * passata d'uscita fa l'unica conversione, alla fine). Convertire qui è quello
   * che tiene scuro un esadecimale scuro invece di alzarlo in un verde slavato:
   * è la ragione per cui questa funzione non è `WC.glsl.hexToVec3`, che carica i
   * byte grezzi perché le altre scene del sito non hanno passata d'uscita. */
  function srgbToLinear(c){ return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexLin(hex){
    var n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(srgbToLinear(((n >> 16) & 255) / 255),
                             srgbToLinear(((n >> 8) & 255) / 255),
                             srgbToLinear((n & 255) / 255));
  }
  function col(hex){ return new THREE.Color(hex); }

  /* ==========================================================================
     RENDERER / SCENA / CAMERA
     ========================================================================== */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  // Il tone mapping tocca i materiali standard (disco e uomo), non gli shader a
  // mano: è esattamente il comportamento del file, dove il composer rende in
  // lineare e la conversione finale la fa la passata d'uscita.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.exposure;

  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 200);
  scene.fog = new THREE.FogExp2(new THREE.Color(CONFIG.bgBottom).getHex(), CONFIG.fogDensity);

  var uTime = { value: 0 };
  var uFade = { value: 0 };
  var uBeam = { value: 1 };

  /* ==========================================================================
     1. FONDO — un gradiente a tutto schermo (scuro in alto → verde scuro a
     terra) con una banda di foschia bassa dove il raggio tocca il suolo, più le
     stelle. Disegnato dietro tutto, senza profondità.
     ========================================================================== */
  var bgU = {
    uTop: { value: hexLin(CONFIG.bgTop) }, uBot: { value: hexLin(CONFIG.bgBottom) },
    uGlow: { value: hexLin(CONFIG.bgGlow) },
    uGlowY: { value: CONFIG.bgGlowY }, uGlowStr: { value: CONFIG.bgGlowStr },
    uHorizon: { value: hexLin(CONFIG.bgHorizon) },
    uHorizonY: { value: CONFIG.bgHorizonY }, uHorizonStr: { value: CONFIG.bgHorizonStr },
    uStarColor: { value: hexLin(CONFIG.starColor) },
    uStarStr: { value: CONFIG.starStr }, uStarDensity: { value: CONFIG.starDensity },
    uStarTwinkle: { value: CONFIG.starTwinkle },
    uAspect: { value: 1 }, uTime: uTime
  };
  var bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: bgU, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }',
    fragmentShader: [
      'precision highp float;',
      'varying vec2 vUv;',
      'uniform vec3 uTop, uBot, uGlow, uHorizon, uStarColor;',
      'uniform float uGlowY, uGlowStr, uHorizonY, uHorizonStr;',
      'uniform float uStarStr, uStarDensity, uStarTwinkle, uAspect, uTime;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'void main(){',
      '  vec3 base = mix(uBot, uTop, smoothstep(0.0, 1.0, vUv.y));',
      // Sollevamento verso l'orizzonte: è quello che dà profondità d'aria.
      '  float horizon = exp(-pow((vUv.y - uHorizonY) / 0.30, 2.0));',
      '  base += uHorizon * horizon * uHorizonStr;',
      // Banda di foschia centrata su uGlowY, più accesa verso il centro.
      '  float band = exp(-pow((vUv.y - uGlowY) / 0.34, 2.0));',
      '  float horiz = exp(-pow((vUv.x - 0.5) / 0.55, 2.0));',
      '  base += uGlow * band * horiz * uGlowStr;',
      // Stelle: una cella su dieci ne ha una, e si spengono verso terra.
      '  vec2 suv = vec2(vUv.x * uAspect, vUv.y) * uStarDensity;',
      '  vec2 cell = floor(suv), f = fract(suv);',
      '  float r = hash(cell);',
      '  if (r > 0.90) {',
      '    vec2 c = vec2(hash(cell + 1.7), hash(cell + 4.3));',
      '    float d = length(f - c);',
      '    float tw = 0.55 + 0.45 * sin(uTime * uStarTwinkle + r * 40.0);',
      '    float star = smoothstep(0.09, 0.0, d) * tw * (0.4 + 0.6 * fract(r * 17.0));',
      '    float skyFade = smoothstep(0.30, 0.7, vUv.y);',
      '    base += uStarColor * star * uStarStr * skyFade;',
      '  }',
      '  base += (hash(vUv * 1024.0) - 0.5) * (2.5 / 255.0);',
      '  gl_FragColor = vec4(base, 1.0);',
      '}'
    ].join('\n')
  }));
  bgMesh.frustumCulled = false;
  bgMesh.renderOrder = -1;
  scene.add(bgMesh);

  /* ==========================================================================
     2. ERBA — i fili dello shader pmndrs: piani snodati con la sagoma nel canale
     alpha, istanziati con un quaternione di orientamento e uno stiramento in
     altezza, mossi da un vento a simplex noise e piegati con uno slerp
     radice→punta. La forma del filo e il movimento sono i loro; il colore è
     rifatto per la notte — quasi nero di suo, e verde solo dove il cono lo tocca.

     Il peso del vento cresce con la QUOTA lungo il filo (`frc`), non in modo
     uniforme: un filo che si piega anche alla radice sembra gomma.
     ========================================================================== */
  var SIMPLEX2D = [
    'vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }',
    'vec2 mod289(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }',
    'vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }',
    'float snoise(vec2 v){',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i  = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v -   i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;',
    '  i = mod289(i);',
    '  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);',
    '  m = m*m; m = m*m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);',
    '  vec3 g;',
    '  g.x  = a0.x  * x0.x  + h.x  * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}'
  ].join('\n');

  // Prodotto di Hamilton, scritto dentro `a` (l'helper del pmndrs).
  function mulQuat(a, b){
    var qax = a.x, qay = a.y, qaz = a.z, qaw = a.w;
    var qbx = b.x, qby = b.y, qbz = b.z, qbw = b.w;
    a.set(qax*qbw + qaw*qbx + qay*qbz - qaz*qby,
          qay*qbw + qaw*qby + qaz*qbx - qax*qbz,
          qaz*qbw + qaw*qbz + qax*qby - qay*qbx,
          qaw*qbw - qax*qbx - qay*qby - qaz*qbz);
  }

  var texLoader = new THREE.TextureLoader();
  var grassDiff  = texLoader.load(CONFIG.grassDiffuse);
  var grassAlphaT = texLoader.load(CONFIG.grassAlpha);
  grassDiff.encoding = THREE.sRGBEncoding;

  var grassU = {
    map: { value: grassDiff }, alphaMap: { value: grassAlphaT },
    uTime: uTime, uFade: uFade, uBeam: uBeam,
    bladeHeight: { value: CONFIG.grassHeight },
    uRoot: { value: hexLin(CONFIG.grassRoot) },
    uTip:  { value: hexLin(CONFIG.grassTip) },
    uLit:  { value: hexLin(CONFIG.grassLit) },
    uLitRadius: { value: CONFIG.litRadius }, uLitStr: { value: CONFIG.litStr },
    uWindSpeed: { value: CONFIG.windSpeed }, uWindStr: { value: CONFIG.windStr },
    uFogColor: { value: hexLin(CONFIG.bgBottom) },
    uFogDensity: { value: CONFIG.fogDensity }
  };
  var grassMat = new THREE.ShaderMaterial({
    uniforms: grassU, side: THREE.DoubleSide, fog: false, transparent: true,
    vertexShader: [
      'attribute vec3 offset;',           // radice del filo, sul piano
      'attribute vec4 orientation;',      // quaternione per filo
      'attribute float halfRootAngleSin;',
      'attribute float halfRootAngleCos;',
      'attribute float stretch;',         // variazione d'altezza per filo
      'uniform float uTime, bladeHeight, uWindSpeed, uWindStr;',
      'varying vec2 vUv; varying float frc; varying float vDist; varying float vViewDepth;',
      SIMPLEX2D,
      'vec3 rotateVectorByQuaternion(vec3 v, vec4 q){',
      '  return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;',
      '}',
      'vec4 slerp(vec4 v0, vec4 v1, float t){',
      '  normalize(v0); normalize(v1);',
      '  float d = dot(v0, v1);',
      '  if (d < 0.0) { v1 = -v1; d = -d; }',
      '  const float THRESHOLD = 0.9995;',
      '  if (d > THRESHOLD) return normalize(v0 + t * (v1 - v0));',
      '  float theta_0 = acos(d);',
      '  float theta = theta_0 * t;',
      '  float sin_theta = sin(theta);',
      '  float sin_theta_0 = sin(theta_0);',
      '  float s0 = cos(theta) - d * sin_theta / sin_theta_0;',
      '  float s1 = sin_theta / sin_theta_0;',
      '  return (s0 * v0) + (s1 * v1);',
      '}',
      'void main(){',
      '  frc = position.y / bladeHeight;',   // 0 radice .. 1 punta
      '  float wt = uTime * uWindSpeed * 0.25;',
      '  float noise = 1.0 - snoise(vec2(wt - offset.x / 50.0, wt - offset.z / 50.0));',
      '  vec4 direction = vec4(0.0, halfRootAngleSin, 0.0, halfRootAngleCos);',
      '  direction = slerp(direction, orientation, frc);',
      '  vec3 vPosition = vec3(position.x, position.y + position.y * stretch, position.z);',
      '  vPosition = rotateVectorByQuaternion(vPosition, direction);',
      '  float halfAngle = noise * uWindStr * 1.5;',
      '  vPosition = rotateVectorByQuaternion(vPosition,',
      '    normalize(vec4(sin(halfAngle), 0.0, -sin(halfAngle), cos(halfAngle))));',
      '  vUv = uv;',
      '  vec3 wp = offset + vPosition;',
      '  vec4 mv = modelViewMatrix * vec4(wp, 1.0);',
      '  vDist = length(offset.xz);',       // distanza dall'asse del raggio
      '  vViewDepth = -mv.z;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D map, alphaMap;',
      'uniform vec3 uRoot, uTip, uLit, uFogColor;',
      'uniform float uLitRadius, uLitStr, uFogDensity, uFade, uBeam;',
      'varying vec2 vUv; varying float frc; varying float vDist; varying float vViewDepth;',
      'void main(){',
      '  float alpha = texture2D(alphaMap, vUv).r;',
      '  if (alpha < 0.15) discard;',        // la sagoma del filo sta nell'alpha
      '  vec3 tex = texture2D(map, vUv).rgb;',
      '  float texLum = dot(tex, vec3(0.299, 0.587, 0.114));',
      // Base notturna: gradiente scuro radice→punta, con il dettaglio del filo.
      '  vec3 base = mix(uRoot, uTip, frc) * (0.55 + 0.9 * texLum);',
      '  float pool = exp(-(vDist * vDist) / (uLitRadius * uLitRadius)) * uBeam;',
      // Sotto il cono il filo si riprende il suo verde vero, e si alza.
      '  base = mix(base, tex * uTip * 2.2, pool * 0.7);',
      '  base += uLit * pool * uLitStr * (0.28 + 0.72 * frc);',
      '  float f = 1.0 - exp(-pow(vViewDepth * uFogDensity, 2.0));',
      '  base = mix(base, uFogColor, clamp(f, 0.0, 1.0));',
      '  gl_FragColor = vec4(base, uFade);',
      '}'
    ].join('\n')
  });

  var grass = (function(){
    var N = nGrass, R = CONFIG.grassArea, joints = 5;
    var offsets = new Float32Array(N * 3);
    var orientations = new Float32Array(N * 4);
    var stretches = new Float32Array(N);
    var hras = new Float32Array(N), hrac = new Float32Array(N);
    var q0 = new THREE.Vector4(), q1 = new THREE.Vector4();
    // Generatore con seme fisso: il prato è lo stesso a ogni caricamento, così
    // una regolazione si giudica sullo stesso campo e non su uno nuovo.
    var seed = 1234.567;
    function rnd(){ seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    for (var i = 0; i < N; i++) {
      // sqrt sul raggio: senza, i fili si ammassano al centro del disco.
      var r = Math.sqrt(rnd()) * R;
      var a = rnd() * Math.PI * 2;
      offsets[i*3] = Math.cos(a) * r; offsets[i*3+1] = 0; offsets[i*3+2] = Math.sin(a) * r;
      // 1) rotazione libera attorno all'asse verticale
      var angle = Math.PI - rnd() * (2 * Math.PI);
      hras[i] = Math.sin(0.5 * angle); hrac[i] = Math.cos(0.5 * angle);
      q0.set(0, Math.sin(angle / 2), 0, Math.cos(angle / 2)).normalize();
      // 2) piccola inclinazione su X
      angle = rnd() * 0.5 - 0.25;
      q1.set(Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)).normalize();
      mulQuat(q0, q1);
      // 3) piccola inclinazione su Z
      angle = rnd() * 0.5 - 0.25;
      q1.set(0, 0, Math.sin(angle / 2), Math.cos(angle / 2)).normalize();
      mulQuat(q0, q1);
      orientations[i*4] = q0.x; orientations[i*4+1] = q0.y;
      orientations[i*4+2] = q0.z; orientations[i*4+3] = q0.w;
      // 4) un terzo dei fili più alto degli altri
      stretches[i] = (i < N / 3 ? rnd() * 1.8 : rnd()) * 0.7;
    }

    var baseGeom = new THREE.PlaneGeometry(CONFIG.grassWidth * 2.0, CONFIG.grassHeight, 1, joints)
      .translate(0, CONFIG.grassHeight / 2, 0);
    var geo = new THREE.InstancedBufferGeometry();
    geo.index = baseGeom.index;
    geo.setAttribute('position', baseGeom.attributes.position);
    geo.setAttribute('uv', baseGeom.attributes.uv);
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('orientation', new THREE.InstancedBufferAttribute(orientations, 4));
    geo.setAttribute('stretch', new THREE.InstancedBufferAttribute(stretches, 1));
    geo.setAttribute('halfRootAngleSin', new THREE.InstancedBufferAttribute(hras, 1));
    geo.setAttribute('halfRootAngleCos', new THREE.InstancedBufferAttribute(hrac, 1));
    geo.instanceCount = N;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.6);
    baseGeom.dispose();

    var m = new THREE.Mesh(geo, grassMat);
    m.frustumCulled = false;
    m.renderOrder = 1;
    scene.add(m);
    return m;
  })();

  // Un disco scuro sotto l'erba, così i vuoti fra i fili si leggono come terra
  // e non come fondo.
  var groundMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(CONFIG.bgBottom).multiplyScalar(0.6),
    fog: true, transparent: true, opacity: 0
  });
  var ground = new THREE.Mesh(new THREE.CircleGeometry(CONFIG.grassArea + 2, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.renderOrder = 0;
  scene.add(ground);

  /* ==========================================================================
     3. RAGGIO — tre strati additivi fra il disco e il suolo: (a) un guscio a
     cono che si accende sui bordi di silhouette (fresnel), (b) un piano
     verticale girato verso la camera che fa il cuore luminoso, (c) la pozza a
     terra. Un rumore animato dà al fusto il senso del volume.

     Non è una finezza: con il solo cono pieno il raggio si legge come plastica.
     ========================================================================== */
  var NOISE3D = [
    'float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }',
    'float noise3(vec3 p){',
    '  vec3 i = floor(p), f = fract(p);',
    '  f = f*f*(3.0-2.0*f);',
    '  float n = mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x),',
    '                    mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),',
    '                mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),',
    '                    mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);',
    '  return n;',
    '}'
  ].join('\n');

  var beamTop = CONFIG.saucerY - 0.35;
  var beamHeight = beamTop;
  var beamGroup = new THREE.Group();
  scene.add(beamGroup);

  // (a) guscio a cono, fresnel
  var coneU = {
    uTime: uTime, uFade: uFade, uBeam: uBeam,
    uColor: { value: hexLin(CONFIG.beamColor) },
    uWall: { value: CONFIG.beamWall }, uNoise: { value: CONFIG.beamNoise },
    uSpeed: { value: CONFIG.beamSpeed }, uVFade: { value: CONFIG.beamFade },
    uHalfH: { value: beamHeight / 2 },
    uRayCount: { value: CONFIG.beamRayCount }, uRayStr: { value: CONFIG.beamRayStr },
    uRaySpeed: { value: CONFIG.beamRaySpeed }, uRaySharp: { value: CONFIG.beamRaySharp }
  };
  var cone = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.beamTopR, CONFIG.beamBotR, beamHeight, 40, 1, true),
    new THREE.ShaderMaterial({
      uniforms: coneU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      vertexShader: [
        'varying vec3 vN; varying vec3 vView; varying float vY; varying vec3 vLocal;',
        'void main(){',
        '  vLocal = position; vY = uv.y;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vN = normalize(normalMatrix * normal);',
        '  vView = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;', NOISE3D,
        'uniform float uTime, uWall, uNoise, uSpeed, uVFade, uHalfH, uFade, uBeam;',
        'uniform vec3 uColor;',
        'uniform float uRayCount, uRayStr, uRaySpeed, uRaySharp;',
        'varying vec3 vN; varying vec3 vView; varying float vY; varying vec3 vLocal;',
        'void main(){',
        '  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.6);',
        '  float vert = mix(1.0, uVFade, vY);',   // più acceso vicino alla sorgente
        // Rumore stirato in verticale: strisce che scendono, non bolle.
        '  float n = mix(1.0 - uNoise, 1.0, noise3(vec3(vLocal.xz * 6.0, vY * 1.5 - uTime * uSpeed)));',
        // Lame di luce che girano lentamente attorno all'asse.
        '  float ang = atan(vLocal.z, vLocal.x);',
        '  float rays = 0.5 + 0.5 * sin(ang * uRayCount + uTime * uRaySpeed);',
        '  rays = pow(rays, uRaySharp);',
        '  float rayMask = mix(1.0, rays, uRayStr);',
        // Il bordo aperto in cima si dissolve, se no si vede l'anello sfaccettato.
        '  float topFade = smoothstep(uHalfH, uHalfH * 0.78, vLocal.y);',
        '  float a = fres * vert * n * rayMask * uWall * topFade * uFade * uBeam;',
        '  gl_FragColor = vec4(uColor * a, a);',
        '}'
      ].join('\n')
    })
  );
  cone.position.y = beamHeight / 2;
  cone.renderOrder = 5;
  beamGroup.add(cone);

  // (b) piano del cuore, girato verso la camera restando verticale
  var coreU = {
    uTime: uTime, uFade: uFade, uBeam: uBeam,
    uColor: { value: hexLin(CONFIG.beamColor) },
    uCore: { value: CONFIG.beamCore }, uNoise: { value: CONFIG.beamNoise },
    uSpeed: { value: CONFIG.beamSpeed }, uVFade: { value: CONFIG.beamFade }
  };
  var core = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.beamBotR * 2.1, beamHeight),
    new THREE.ShaderMaterial({
      uniforms: coreU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'precision highp float;', NOISE3D,
        'uniform float uTime, uCore, uNoise, uSpeed, uVFade, uFade, uBeam; uniform vec3 uColor;',
        'varying vec2 vUv;',
        'void main(){',
        '  float radial = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5));',
        '  radial = pow(radial, 2.2);',
        '  float vert = mix(1.0, uVFade, vUv.y);',
        '  float n = mix(1.0 - uNoise, 1.0, noise3(vec3(vUv.x * 9.0, vUv.y * 2.0 - uTime * uSpeed, uTime * 0.15)));',
        '  float topFade = smoothstep(1.0, 0.82, vUv.y);',
        '  float a = radial * vert * n * uCore * topFade * uFade * uBeam;',
        '  gl_FragColor = vec4(uColor * a, a);',
        '}'
      ].join('\n')
    })
  );
  core.position.y = beamHeight / 2;
  core.renderOrder = 6;
  beamGroup.add(core);

  // (c) pozza a terra
  var poolU = { uColor: { value: hexLin(CONFIG.poolColor) }, uStr: { value: CONFIG.poolStr },
                uFade: uFade, uBeam: uBeam };
  var pool = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.poolRadius * 2, CONFIG.poolRadius * 2),
    new THREE.ShaderMaterial({
      uniforms: poolU, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 uColor; uniform float uStr, uFade, uBeam; varying vec2 vUv;',
        'void main(){',
        '  float d = length(vUv - 0.5) * 2.0;',
        '  float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.2) * uStr * uFade * uBeam;',
        '  gl_FragColor = vec4(uColor * a, a);',
        '}'
      ].join('\n')
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.02;
  pool.renderOrder = 4;
  beamGroup.add(pool);

  /* ==========================================================================
     4. ALONE — una gaussiana morbida girata verso la camera, messa DIETRO la
     fusoliera (spinta via lungo la direzione di vista) così il disco la occlude:
     si legge come un bagliore che abbraccia la sagoma invece che come un piano
     additivo spalmato sulla pancia concava.
     ========================================================================== */
  var haloU = { uColor: { value: hexLin(CONFIG.haloColor) }, uStr: { value: CONFIG.haloStr }, uFade: uFade };
  var halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: haloU, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uColor; uniform float uStr, uFade; varying vec2 vUv;',
      'void main(){',
      '  float d = length(vUv - 0.5) * 2.0;',
      '  float a = exp(-d * d * 5.8) * uStr * uFade;',
      '  gl_FragColor = vec4(uColor * a, a);',
      '}'
    ].join('\n')
  }));
  halo.renderOrder = 2;
  halo.scale.set(CONFIG.haloSize, CONFIG.haloSize, 1);
  scene.add(halo);

  /* ==========================================================================
     5. FOSCHIA — tre cartelle di rumore fbm che scorrono basse sul campo, a
     profondità e velocità diverse, aderenti al suolo così il cielo resta pulito.
     Blending normale: velano, non sommano.
     ========================================================================== */
  var mistU = { uTime: uTime, uColor: { value: hexLin(CONFIG.mistColor) },
                uStr: { value: CONFIG.mistStr }, uSpeed: { value: CONFIG.mistSpeed }, uFade: uFade };
  var mistMat = new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, blending: THREE.NormalBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'precision highp float;', NOISE3D,
      'uniform float uTime, uStr, uSpeed, uFade; uniform vec3 uColor; varying vec2 vUv;',
      'float fbm(vec3 p){ float s = 0.0, a = 0.5; for(int i=0;i<5;i++){ s += a*noise3(p); p *= 2.03; a *= 0.5; } return s; }',
      'void main(){',
      '  vec3 p = vec3(vUv * vec2(3.2, 1.8), uTime * 0.04);',
      '  p.x += uTime * uSpeed;',
      '  float n = fbm(p * 2.0);',
      '  n = smoothstep(0.32, 0.95, n);',
      '  float vfade = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.42, 1.0, vUv.y));',
      '  float sfade = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));',
      '  float a = n * vfade * sfade * uStr * uFade;',
      '  gl_FragColor = vec4(uColor, a);',
      '}'
    ].join('\n')
  });
  var MIST_DEFS = [
    { z: 2.5, w: 34, hy: 0.55, ro: 8 },
    { z: -0.5, w: 40, hy: 0.75, ro: 9 },
    { z: -4.0, w: 46, hy: 1.0, ro: 10 }
  ];
  var mistLayers = MIST_DEFS.map(function(d){
    var m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, CONFIG.mistHeight * 2.0), mistMat);
    m.position.set(0, CONFIG.mistHeight * d.hy, d.z);
    m.renderOrder = d.ro;
    m.frustumCulled = false;
    m.userData.def = d;
    scene.add(m);
    return m;
  });

  /* ==========================================================================
     6. LUCI — una key fredda debole più un ambiente: è notte. Più una luce verde
     bassa dentro il raggio, che illumina l'uomo da sotto.
     ========================================================================== */
  scene.add(new THREE.AmbientLight(0xffffff, CONFIG.ambient));
  var key = new THREE.DirectionalLight(0xbcd4ff, CONFIG.keyStr);
  key.position.set(-3, 6, 4);
  scene.add(key);
  var humanLight = new THREE.PointLight(col(CONFIG.beamColor), CONFIG.humanGlow, 7, 2);
  humanLight.position.set(0, CONFIG.humanY - 1.15, CONFIG.humanZ);
  scene.add(humanLight);

  /* ==========================================================================
     PARSER GLB — la versione allargata di quello di `spine.js`.
     Oltre a posizioni, normali e UV tira fuori tutte le texture che il file si
     porta nei bufferView: sono WebP, quindi si passano al browser come Blob e le
     decodifica lui.
     ========================================================================== */
  var blobUrls = [], loadedTex = [];

  function parseGlb(buf){
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('non è un GLB');
    var off = 12, json = null, binOff = -1;
    while (off + 8 <= dv.byteLength) {
      var len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
      else if (type === 0x004E4942) binOff = off + 8;
      off += 8 + len;
    }
    if (!json || binOff < 0) throw new Error('GLB senza chunk JSON o BIN');
    var prim = json.meshes[0].primitives[0];
    if (!prim || prim.indices === undefined) throw new Error('mesh non indicizzata');

    /* Lettore di accessor che regge anche i bufferView INTERLACCIATI: passando
     * dal decompressore Draco gli attributi vengono riscritti intrecciati —
     * posizione, normale e UV dello stesso vertice uno dietro l'altro. Leggerli
     * come contigui darebbe una mesh esplosa, non un errore. */
    function read(accIdx, Ctor, comps){
      var acc = json.accessors[accIdx], bv = json.bufferViews[acc.bufferView];
      var base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
      var bytes = Ctor.BYTES_PER_ELEMENT;
      var stride = bv.byteStride || 0;
      if (!stride || stride === bytes * comps) return new Ctor(buf, base, acc.count * comps);
      var getter = Ctor === Float32Array ? 'getFloat32'
                 : Ctor === Uint32Array  ? 'getUint32'
                 : Ctor === Uint16Array  ? 'getUint16' : 'getUint8';
      var src = new DataView(buf), out = new Ctor(acc.count * comps);
      for (var i = 0; i < acc.count; i++)
        for (var c = 0; c < comps; c++)
          out[i * comps + c] = src[getter](base + i * stride + c * bytes, true);
      return out;
    }

    var iT = json.accessors[prim.indices].componentType;
    var IdxCtor = iT === 5125 ? Uint32Array : iT === 5123 ? Uint16Array : Uint8Array;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(read(prim.attributes.POSITION, Float32Array, 3), 3));
    if (prim.attributes.NORMAL !== undefined)
      geo.setAttribute('normal', new THREE.BufferAttribute(read(prim.attributes.NORMAL, Float32Array, 3), 3));
    if (prim.attributes.TEXCOORD_0 !== undefined)
      geo.setAttribute('uv', new THREE.BufferAttribute(read(prim.attributes.TEXCOORD_0, Float32Array, 2), 2));
    geo.setIndex(new THREE.BufferAttribute(read(prim.indices, IdxCtor, 1), 1));
    if (prim.attributes.NORMAL === undefined) geo.computeVertexNormals();
    geo.computeBoundingBox();

    // La mesh viene centrata sul suo baricentro come fa il file (che fa
    // `model.position.sub(centro)`), così ruota attorno alla propria metà. Il
    // fondo serve poi per appoggiarci sotto quello che deve stare sotto.
    var box = geo.boundingBox;
    var centre = box.getCenter(new THREE.Vector3());
    geo.translate(-centre.x, -centre.y, -centre.z);
    var bottom = box.min.y - centre.y;

    function texture(texIdx, srgb){
      if (texIdx === undefined || texIdx === null) return null;
      var t = json.textures[texIdx];
      var srcIdx = t.source !== undefined ? t.source
                 : (t.extensions && t.extensions.EXT_texture_webp && t.extensions.EXT_texture_webp.source);
      if (srcIdx === undefined) return null;
      var img = json.images[srcIdx], bv = json.bufferViews[img.bufferView];
      var bytes = new Uint8Array(buf, binOff + (bv.byteOffset || 0), bv.byteLength);
      var url = URL.createObjectURL(new Blob([bytes], { type: img.mimeType || 'image/webp' }));
      blobUrls.push(url);
      var tex = new THREE.TextureLoader().load(url);
      tex.flipY = false;                       // glTF ha l'origine UV in alto
      if (srgb) tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      loadedTex.push(tex);
      return tex;
    }

    var mat = (json.materials && json.materials[0]) || {};
    var pbr = mat.pbrMetallicRoughness || {};
    return {
      geo: geo, bottom: bottom,
      map:       texture(pbr.baseColorTexture && pbr.baseColorTexture.index, true),
      mrMap:     texture(pbr.metallicRoughnessTexture && pbr.metallicRoughnessTexture.index, false),
      normalMap: texture(mat.normalTexture && mat.normalTexture.index, false),
      emissiveMap: texture(mat.emissiveTexture && mat.emissiveTexture.index, true)
    };
  }

  function fetchGlb(url){
    return fetch(url).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url);
      return r.arrayBuffer();
    }).then(parseGlb);
  }

  /* ==========================================================================
     7. DISCO — il GLB. Le sue lampade sono dipinte come punti chiari nella base
     color (non c'è nessuna mappa emissiva), quindi la fusoliera viene SCURITA a
     silhouette notturna e l'emissione viene iniettata dove l'albedo GREZZO è
     chiaro: si accendono i finestrini veri, indipendentemente dallo scurimento.
     ========================================================================== */
  var saucerPivot = new THREE.Group();
  saucerPivot.position.y = CONFIG.saucerY;
  saucerPivot.visible = false;
  scene.add(saucerPivot);

  var humanPivot = new THREE.Group();
  humanPivot.position.z = CONFIG.humanZ;
  humanPivot.visible = false;
  scene.add(humanPivot);

  var disposables = [];
  var saucerMat = null, humanMat = null, saucerMesh = null, humanMesh = null;

  fetchGlb(CONFIG.saucerSrc).then(function(o){
    saucerMat = new THREE.MeshStandardMaterial({
      map: o.map, normalMap: o.normalMap, metalnessMap: o.mrMap, roughnessMap: o.mrMap,
      color: new THREE.Color(0xffffff).multiplyScalar(CONFIG.hullDark),
      roughness: 0.65, metalness: 0.35,
      transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    // Emissione iniettata sopra soglia di luminanza: sono le lampade dipinte.
    saucerMat.onBeforeCompile = function(shader){
      shader.uniforms.uLampStr = { value: CONFIG.lampStr };
      shader.uniforms.uLampThresh = { value: CONFIG.lampThresh };
      shader.uniforms.uLampColor = { value: hexLin(CONFIG.lampColor) };
      shader.fragmentShader = 'uniform float uLampStr, uLampThresh; uniform vec3 uLampColor;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        ['#include <emissivemap_fragment>',
         '#ifdef USE_MAP',
         '  vec3 lampTex = texture2D(map, vUv).rgb;',
         '  float lum = max(max(lampTex.r, lampTex.g), lampTex.b);',
         '  float lampMask = smoothstep(uLampThresh, min(uLampThresh + 0.16, 1.0), lum);',
         '  totalEmissiveRadiance += uLampColor * lampMask * uLampStr;',
         '#endif'].join('\n'));
    };
    saucerMesh = new THREE.Mesh(o.geo, saucerMat);
    saucerMesh.frustumCulled = false;
    saucerMesh.scale.setScalar(CONFIG.saucerScale);
    saucerPivot.add(saucerMesh);
    saucerPivot.visible = true;
    disposables.push(o.geo, saucerMat);
  }).catch(function(err){ console.error('[WC] disco non caricato:', err); });

  /* ==========================================================================
     7b. IL RAPITO — l'uomo che levita dentro il cono, come se il disco lo stesse
     tirando su. Scurito a silhouette e illuminato di verde da sotto. Disegnato
     come geometria opaca normale, così gli strati additivi del raggio gli
     passano davanti e dietro: è quello che lo mette DENTRO il fusto invece che
     appiccicato sopra.
     ========================================================================== */
  fetchGlb(CONFIG.humanSrc).then(function(o){
    humanMat = new THREE.MeshStandardMaterial({
      map: o.map, normalMap: o.normalMap, metalnessMap: o.mrMap, roughnessMap: o.mrMap,
      color: new THREE.Color(0xffffff).multiplyScalar(CONFIG.humanDark),
      emissive: new THREE.Color(CONFIG.beamColor).multiplyScalar(0.14),
      roughness: 0.8, metalness: 0.0,
      transparent: true, opacity: 0
    });
    humanMesh = new THREE.Mesh(o.geo, humanMat);
    humanMesh.frustumCulled = false;
    humanMesh.scale.setScalar(CONFIG.humanScale);
    humanMesh.rotation.x = CONFIG.humanTilt;
    humanPivot.add(humanMesh);
    humanPivot.visible = true;
    disposables.push(o.geo, humanMat);
  }).catch(function(err){ console.error('[WC] rapito non caricato:', err); });

  /* ==========================================================================
     PASSAGGIO FINALE — render target + bloom povero + grade.

     Il file rende dentro un EffectComposer; qui la catena è a mano perché il
     three r128 della pagina non porta il composer. Il conto della passata di
     uscita è lo stesso del file: linear→sRGB, saturazione, contrasto, vignetta,
     grana animata e un dither da 1 LSB perché il quasi-nero non faccia bande.
     ========================================================================== */
  var rtType = THREE.HalfFloatType;
  var rtScene = new THREE.WebGLRenderTarget(1, 1, {
    type: rtType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false
  });
  var rtA = new THREE.WebGLRenderTarget(1, 1, { type: rtType, minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
  var rtB = rtA.clone();

  var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var quadGeo = new THREE.PlaneGeometry(2, 2);
  var quadScene = new THREE.Scene();
  var quadMesh = new THREE.Mesh(quadGeo, null);
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  var QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }';

  // soglia: cosa entra nel bloom. La soglia è in luce LINEARE, non sRGB — con
  // un valore basso ci entra anche il lavaggio di fondo e sbava tutto il quadro.
  var brightMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uThresh: { value: CONFIG.bloomThreshold } },
    vertexShader: QUAD_VERT,
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D tDiffuse; uniform float uThresh; varying vec2 vUv;',
      'void main(){',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  float k = smoothstep(uThresh, uThresh + 0.22, l);',
      '  gl_FragColor = vec4(c * k, 1.0);',
      '}'
    ].join('\n'), depthTest: false, depthWrite: false
  });

  var blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) },
                uTexel: { value: new THREE.Vector2(1, 1) } },
    vertexShader: QUAD_VERT,
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uTexel; varying vec2 vUv;',
      // Gaussiana a nove prelievi, separabile: due passate invece di ottantuno.
      'void main(){',
      '  float w[5];',
      '  w[0] = 0.2270270270; w[1] = 0.1945945946; w[2] = 0.1216216216;',
      '  w[3] = 0.0540540541; w[4] = 0.0162162162;',
      '  vec3 s = texture2D(tDiffuse, vUv).rgb * w[0];',
      '  for (int i = 1; i < 5; i++) {',
      '    vec2 o = uDir * uTexel * float(i) * 1.6;',
      '    s += texture2D(tDiffuse, vUv + o).rgb * w[i];',
      '    s += texture2D(tDiffuse, vUv - o).rgb * w[i];',
      '  }',
      '  gl_FragColor = vec4(s, 1.0);',
      '}'
    ].join('\n'), depthTest: false, depthWrite: false
  });

  var outMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null }, tBloom: { value: null },
      // `bloomStrength` è il numero del file, ma il bloom del file è un
      // UnrealBloomPass che SOMMA cinque livelli di mipmap: a parità di valore
      // rende molto più energia di questa singola sfocatura a un quarto di
      // risoluzione. Il fattore riporta le lampade a essere bianche e alonate
      // come nel riferimento — non è una ritaratura del valore, è la conversione
      // fra due bloom diversi. Cambiando `bloomStrength` questo resta valido.
      uBloomStr: { value: useBloom ? CONFIG.bloomStrength * 3.0 : 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSat: { value: CONFIG.saturation }, uContrast: { value: CONFIG.contrast },
      uGrain: { value: CONFIG.grain }, uVignette: { value: CONFIG.vignette },
      uTime: uTime, uFade: uFade
    },
    vertexShader: QUAD_VERT,
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D tDiffuse, tBloom;',
      'uniform vec2 uRes;',
      'uniform float uBloomStr, uSat, uContrast, uGrain, uTime, uVignette, uFade;',
      'varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'void main(){',
      '  vec3 lin = texture2D(tDiffuse, vUv).rgb;',
      '  lin += texture2D(tBloom, vUv).rgb * uBloomStr;',
      '  vec3 srgb = mix(lin * 12.92, 1.055 * pow(max(lin, 0.0), vec3(1.0/2.4)) - 0.055, step(0.0031308, lin));',
      // grade, in spazio percettivo
      '  float luma = dot(srgb, vec3(0.2126, 0.7152, 0.0722));',
      '  srgb = mix(vec3(luma), srgb, uSat);',
      '  srgb = (srgb - 0.5) * uContrast + 0.5;',
      // vignetta: gli angoli, dove non arriva luce, cadono a nero
      '  float vd = length(vUv - 0.5) * 1.414;',
      '  srgb *= 1.0 - uVignette * smoothstep(0.35, 1.0, vd);',
      // grana animata, un filo di più nelle ombre così le luci restano pulite
      '  float g = hash(vUv * uRes + fract(uTime) * 91.7) - 0.5;',
      '  srgb += g * uGrain * (0.5 + 0.5 * (1.0 - luma));',
      '  float d = (hash(vUv * uRes) - 0.5) / 255.0;',
      '  gl_FragColor = vec4(clamp(srgb, 0.0, 1.0) + d, uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthTest: false, depthWrite: false
  });

  function drawQuad(mat, target){
    quadMesh.material = mat;
    renderer.setRenderTarget(target || null);
    renderer.render(quadScene, quadCam);
  }

  /* ==========================================================================
     STATO / CICLO
     ========================================================================== */
  var scrollTarget = 0, scroll = 0, fade = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now(), started = performance.now();
  var tmx = 0, tmy = 0, mx = 0, my = 0;
  var _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3();

  function resize(){
    var r = pin.getBoundingClientRect();
    rect.w = Math.max(1, r.width); rect.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.w, rect.h, false);
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();

    var pw = Math.max(1, Math.round(rect.w * dpr)), ph = Math.max(1, Math.round(rect.h * dpr));
    rtScene.setSize(pw, ph);
    // Il bloom gira a un quarto di risoluzione: è una sfocatura, la definizione
    // che perde non si vede e il costo scala col quadrato.
    var bw = Math.max(1, pw >> 2), bh = Math.max(1, ph >> 2);
    rtA.setSize(bw, bh); rtB.setSize(bw, bh);
    blurMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    outMat.uniforms.uRes.value.set(pw, ph);
    bgU.uAspect.value = rect.w / rect.h;
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = (now - started) / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    fade = Math.min(1, fade + dt / 1.1);
    uTime.value = t;
    uFade.value = fade;
    // Il raggio si accende arrivando. È l'unica cosa che lo scroll muove: la
    // camera resta quella del file, perché muoverla in avanti tagliava il disco
    // in cima e mandava il prato sotto l'inquadratura.
    uBeam.value = G.clamp01((scroll - 0.02) / 0.16);
    groundMat.opacity = fade;
    if (saucerMat) saucerMat.opacity = fade;
    // Il rapito compare col raggio, non prima: nel file il raggio è sempre acceso
    // e lui ci sta dentro. Qui il raggio si accende arrivando, e un uomo che
    // galleggia nel buio senza niente che lo tiene su è un'altra scena.
    if (humanMat) humanMat.opacity = fade * uBeam.value;

    // Mouse → parallasse di camera. I fattori sono quelli del file: 1.6 in
    // orizzontale, 0.6 in verticale e col segno invertito (il mouse in basso
    // abbassa la camera), più il bersaglio dello sguardo che scorre di 0.4. È
    // quest'ultimo che fa GIRARE il disco invece di limitarsi a traslarlo.
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;
    camera.position.set(mx * CONFIG.parallax * 1.6,
                        CONFIG.camY - my * CONFIG.parallax * 0.6,
                        CONFIG.camZ);
    camera.lookAt(mx * CONFIG.parallax * 0.4, CONFIG.camTargetY, 0);

    // Il disco galleggia e gira lentamente. Questo va nel tempo e non nello
    // scroll: un oggetto fermo appeso in aria è un fermo immagine, e il
    // galleggiamento è quello che dice che sta volando.
    var bob = Math.sin(t * CONFIG.bobSpeed) * CONFIG.bobAmount;
    saucerPivot.position.y = CONFIG.saucerY + bob;
    saucerPivot.rotation.y = t * CONFIG.saucerSpin;
    saucerPivot.rotation.z = CONFIG.saucerTilt;

    // Il rapito va su e giù e gira su sé stesso.
    humanPivot.rotation.y = CONFIG.humanYaw + t * CONFIG.humanSpin;
    humanPivot.position.y = CONFIG.humanY + Math.sin(t * CONFIG.humanBobSpeed + 1.0) * CONFIG.humanBob;

    // Il cuore del raggio si gira verso la camera restando verticale.
    core.rotation.y = Math.atan2(camera.position.x - core.position.x,
                                 camera.position.z - core.position.z);

    // L'alone segue la camera ma sta DIETRO la fusoliera.
    var haloC = _v0.set(0, CONFIG.saucerY + bob, 0);
    var haloDir = _v1.copy(haloC).sub(camera.position).normalize();
    halo.position.copy(haloC).addScaledVector(haloDir, CONFIG.saucerScale * 1.6);
    halo.quaternion.copy(camera.quaternion);

    // Le cartelle di foschia si girano verso la camera restando verticali.
    for (var i = 0; i < mistLayers.length; i++) {
      var m = mistLayers[i];
      m.rotation.y = Math.atan2(camera.position.x - m.position.x,
                                camera.position.z - m.position.z);
    }

    // ---- catena di rendering ----
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);

    if (useBloom) {
      brightMat.uniforms.tDiffuse.value = rtScene.texture;
      drawQuad(brightMat, rtA);
      // Due giri di sfocatura separabile: il raggio cresce senza altre passate.
      for (var p = 0; p < 2; p++) {
        blurMat.uniforms.tDiffuse.value = rtA.texture;
        blurMat.uniforms.uDir.value.set(1 + CONFIG.bloomRadius * 4, 0);
        drawQuad(blurMat, rtB);
        blurMat.uniforms.tDiffuse.value = rtB.texture;
        blurMat.uniforms.uDir.value.set(0, 1 + CONFIG.bloomRadius * 4);
        drawQuad(blurMat, rtA);
      }
      outMat.uniforms.tBloom.value = rtA.texture;
    } else {
      outMat.uniforms.tBloom.value = rtScene.texture;   // non letto: uBloomStr è 0
    }

    outMat.uniforms.tDiffuse.value = rtScene.texture;
    drawQuad(outMat, null);
  }

  function start(){ if (running || document.hidden) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  // Il puntatore in coordinate di FINESTRA, come nel file: la scena è a tutta
  // sezione e la sezione è alta una schermata, quindi le due cose coincidono.
  var onMove = function(e){
    tmx = (e.clientX / window.innerWidth) * 2 - 1;
    tmy = (e.clientY / window.innerHeight) * 2 - 1;
  };

  section.classList.add('-live');
  resize();

  var stPin = ScrollTrigger.create({
    trigger: section, start: 'top top', end: 'bottom bottom',
    pin: pin, pinSpacing: false, anticipatePin: 1,
    onUpdate: function(self){ scrollTarget = self.progress; }
  });
  var stLife = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });

  var onResize = function(){ resize(); };
  var onVis = function(){ if (document.hidden) stop(); else if (stLife.isActive) start(); };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  if (ctx.desktop) window.addEventListener('pointermove', onMove, { passive: true });

  return function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pointermove', onMove);
    [grassMat, groundMat, mistMat, brightMat, blurMat, outMat,
     cone.material, core.material, pool.material, halo.material, bgMesh.material
    ].forEach(function(m){ m.dispose(); });
    [grass, ground, cone, core, pool, halo, bgMesh, quadMesh].forEach(function(o){
      if (o.geometry) o.geometry.dispose();
    });
    mistLayers.forEach(function(m){ m.geometry.dispose(); });
    disposables.forEach(function(d){ d.dispose(); });
    loadedTex.forEach(function(t){ t.dispose(); });
    blobUrls.forEach(function(u){ URL.revokeObjectURL(u); });
    grassDiff.dispose(); grassAlphaT.dispose();
    rtScene.dispose(); rtA.dispose(); rtB.dispose();
    renderer.dispose();
    section.classList.remove('-live');
  };
});
