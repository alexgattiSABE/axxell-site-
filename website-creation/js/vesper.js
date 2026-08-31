/* CAP. 04 — VESPER. Il capitolo intero, non più la sola sfera.
 *
 * Porting completo della scena WebGL del progetto Vesper (Textura) — da React
 * Three Fiber al three r128 globale del sito. Prima qui c'era solo l'orb: era
 * un pezzo di una scena che ne ha tre, e il resto (la galassia, il cervello,
 * il fondo, il pulviscolo, la coreografia che li lega) restava fuori.
 *
 * COSA È STATO PORTATO
 *   backdrop.tsx      il fondo a "fiamma" (domain warp) che cambia palette
 *   hero-line.tsx     la riga orizzontale disegnata DIETRO la sfera
 *   orb/              la sfera di punti + il puntatore "oleoso"
 *   galaxy/           la spirale a due bracci, con tuffo e dispersione
 *   brain/            il cervello di punti campionato dalla mesh cotta
 *   atmosphere.tsx    il pulviscolo agganciato alla camera
 *   main-scene.tsx    il rig di camera che viaggia fra le forme
 *   lib/scene/*       orologio 0→4, intro, outro, costanti, scaglioni
 *
 * COSA NON È STATO PORTATO, e perché
 *   - Tutto ciò che non è animazione: form di contatto e /api, cookie banner,
 *     SEO/sitemap/robots, header e nav, le sezioni FAQ/Financial/footer, il
 *     pannello di autoring dei colori (`color-store`) e i mock di contenuto.
 *     I colori qui sono costanti: è la stessa palette, senza il pannello che
 *     la ritocca a caldo.
 *   - Il bloom (`postprocessing.tsx`). Il three r128 caricato dalla pagina è
 *     il solo core: non porta EffectComposer/UnrealBloomPass, che vivono in
 *     `examples/` e vorrebbero altri cinque script dal CDN. I valori di
 *     `brightness` restano quelli della sorgente, non ritoccati per compensare.
 *   - Lo `star-fall` del loader: questa pagina ha già il suo (js/loader.js), e
 *     due sipari sullo stesso caricamento si pestano i piedi.
 *
 * COLORE. La sorgente carica i colori in spazio LINEARE perché r3f imposta
 * l'output in sRGB. Il renderer di questa pagina non lo fa (come le scene
 * originali di Vesper, che giravano su WebGL1Renderer senza encoding): i byte
 * vanno caricati grezzi, ed è quello che fa `WC.glsl.hexToVec3`. Convertire
 * qui li slaverebbe — vedi il commento in js/glsl.js.
 *
 * L'OROLOGIO. Nella sorgente la scena è guidata da un clock 0→4 alimentato da
 * quattro tracce di scroll alte una schermata, dove la traccia 4 replica la 2:
 * il tempo vale `p1 + 2·p2 + p3` e corre a velocità doppia nel segmento
 * centrale. Quella forma è portante — le fasi sono state scritte contro di lei,
 * non contro una rampa lineare. Qui la sezione è una sola, quindi lo scroll del
 * pin viene ripiegato nella stessa curva: tre terzi che valgono 0→1, 1→3, 3→4.
 * L'ultima fetta di scroll non alimenta il clock ma l'OUTRO, cioè l'uscita del
 * cervello mentre la sezione dopo sale a coprire (il pin è `pinSpacing:false`).
 */
WC.register('vesper', function(ctx){
  var section = document.getElementById('capVesper');
  var pin     = document.getElementById('wcVesperPin');
  var canvas  = document.getElementById('wcVesperCanvas');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;
  var cleanups = [];

  // Reduced-motion o niente WebGL: resta la copy, che è già la versione
  // leggibile del capitolo.
  if (!ctx.motionOk || typeof THREE === 'undefined') {
    section.classList.add('-static');
    return;
  }

  /* ==========================================================================
     SCAGLIONI — `scene/adaptive.ts`, riga per riga.

     I conteggi sono tutta la storia delle prestazioni: gli sprite di punti sono
     limitati dal fill rate, quindi il costo scala con `count × size² × dpr²`.
     Dimezzare uno dei tre vale più di qualunque ottimizzazione di CPU.
     ========================================================================== */
  var TIERS = [
    { max: 640,      orbCount: 6500,  orbSize: 21, orbCamZ: 5.4, orbMoveY: 1.0,
      galW: 70,  galH: 170, brainCount: 26000,  atmoCount: 90,  atmoSize: 18,
      pointer: false, dpr: 1.1,  fps: 30, lerp: 0.15 },
    { max: 1024,     orbCount: 11000, orbSize: 24, orbCamZ: 4.5, orbMoveY: 0.9,
      galW: 100, galH: 250, brainCount: 50000,  atmoCount: 150, atmoSize: 20,
      pointer: false, dpr: 1.25, fps: 45, lerp: 0.13 },
    { max: 1440,     orbCount: 17000, orbSize: 27, orbCamZ: 3.8, orbMoveY: 0.8,
      galW: 130, galH: 330, brainCount: 90000,  atmoCount: 210, atmoSize: 22,
      pointer: true,  dpr: 1.75, fps: 60, lerp: 0.08 },
    { max: Infinity, orbCount: 23000, orbSize: 28, orbCamZ: 3.8, orbMoveY: 0.8,
      galW: 160, galH: 420, brainCount: 130000, atmoCount: 260, atmoSize: 23,
      pointer: true,  dpr: 2,    fps: 60, lerp: 0.07 }
  ];
  var wide = window.innerWidth;
  var tier = TIERS[TIERS.length - 1];
  for (var ti = 0; ti < TIERS.length; ti++) { if (wide <= TIERS[ti].max) { tier = TIERS[ti]; break; } }
  // Un pannello touch non ha cursore da inseguire: niente olio, niente repulsione,
  // niente parallasse — comunque già spento sugli scaglioni stretti.
  var pointerOk = tier.pointer && !matchMedia('(pointer:coarse)').matches;

  /* ==========================================================================
     COSTANTI — `lib/scene/constants.ts`.
     ========================================================================== */

  // Palette di fondo e pulviscolo, una per forma. Sono colori WebGL, non stili:
  // non possono stare in una custom property CSS.
  var PAL_ORB = {
    bg: '#000000', flameA: '#8b98fe', flameB: '#6bfdff', flameAmt: 0.5,
    atmo: '#c9a8ff', atmoSpread: 2.2, atmoFadeNear: 2.0, atmoFadeFar: 3.2, atmoAlpha: 0.5
  };
  var PAL_GALAXY = {
    bg: '#000000', flameA: '#8b98fe', flameB: '#6bfdff', flameAmt: 0.195,
    atmo: '#c9a8ff', atmoSpread: 4.0, atmoFadeNear: 5.0, atmoFadeFar: 6.5, atmoAlpha: 0.6
  };

  var ORB = {
    colorTop: '#52ffa5', colorBottom: '#582eff', colorEdge: '#582eff',
    deform: 0.135, brightness: 1.24, opacity: 1, spin: 0.17, tilt: 0.39,
    pointerRadius: 1.76, oilBulge: 0.46, oilRipple: 0.34, oilDrag: 0.95,
    rippleFreq: 11, rippleSpeed: 4, iridescence: 0.6,
    radius: 1,
    approach: 2.6,     // unità mondo verso la camera durante "entrare nell'ignoto"
    distortGain: 3.4   // e di quanto si gonfia il rumore mentre arriva (× deform)
  };

  var GALAXY = {
    // Nucleo blu → bracci menta: è la stessa coppia dell'orb, così il disco si
    // legge come lo stesso gradiente che si irradia dal centro.
    colorEdge: '#52ffa5', colorCore: '#582eff',
    opacity: 0.55, pointSize: 6, brightness: 1.02,
    armSpin: 0.4, tilt: -0.5, scale: 0.18,
    cameraZ: 48, dive: 30,   // distanza camera a tuffo 0, e quanto il tuffo la tira dentro
    diveTilt: 0.5,           // inclinazione extra: il disco si mette di taglio
    parallax: 4, pointerRadius: 5, pointerStrength: 2
  };

  var BRAIN = {
    colorCool: '#582eff', colorWarm: '#52ffa5',   // gradiente verticale, quello dell'orb
    colorEdge: '#582eff', colorCenter: '#000000', // bordo acceso, interno scuro
    colorSynapse: '#eafff8', colorDeep: '#02040e', colorCursor: '#6bfdff',
    centerRadius: 0.37, centerFalloff: 4, size: 0.067,
    synapseRate: 0.1, flowSpeed: 2.3, flowAmount: 0.025,
    glow: 1.4, depthDarkness: 1,
    radius: 1.15,
    cursorTilt: 0.22,   // radianti di rollio verso il cursore
    scrollSpin: 2.4,    // quanto gira mentre lo scroll lo supera
    // Rotazione a riposo: il cervello formato si legge di PROFILO. Cambiare il
    // segno del secondo termine (± ~1.57) mostra l'altro profilo.
    baseRotationY: -1.309 - 1.5708,
    approach: 2.5,      // unità mondo verso la camera mentre scoppia in uscita
    meshUrl: 'assets/brain-mesh.bin'
  };

  var ORB_PARALLAX = 0.35;  // oscillazione da cursore della camera sull'orb: un sussurro
  var INTRO_DOLLY  = 10;    // di quanto l'intro tira indietro la camera prima di entrare

  /* ==========================================================================
     OROLOGIO — `lib/scene/timeline.ts`.
     ========================================================================== */

  var clamp01 = G.clamp01, smoothstep = G.smoothstep;
  function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t){ return a + (b - a) * t; }
  // Smootherstep di Perlin: derivata prima E seconda nulle ai due capi. È quello
  // che evita che la sfera si sfaldi al primo pixel di scroll o sparisca di colpo.
  function smootherstep(x){ var t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); }

  // I keyframe della sorgente a clock 0,1,2,3,4. `orbOut` resta a 1 una volta
  // dissolta la sfera: il terzo atto non è più l'orb che torna, è il cervello.
  var KEYS = [
    { orbOut: 0, galaxyIn: 0, galaxyOut: 0,   galaxyDive: 0   },
    { orbOut: 1, galaxyIn: 1, galaxyOut: 0,   galaxyDive: 0.5 },
    { orbOut: 1, galaxyIn: 1, galaxyOut: 0.5, galaxyDive: 1   },
    { orbOut: 1, galaxyIn: 1, galaxyOut: 1,   galaxyDive: 1   },
    { orbOut: 1, galaxyIn: 1, galaxyOut: 1,   galaxyDive: 1   }
  ];
  var st = { orbOut: 0, galaxyIn: 0, galaxyOut: 0, galaxyDive: 0 };

  function sampleScene(g){
    var c = clamp(g, 0, 4);
    var lo = Math.min(Math.floor(c), KEYS.length - 2);
    var t = c - lo, a = KEYS[lo], b = KEYS[lo + 1];
    st.orbOut     = lerp(a.orbOut,     b.orbOut,     t);
    st.galaxyIn   = lerp(a.galaxyIn,   b.galaxyIn,   t);
    st.galaxyOut  = lerp(a.galaxyOut,  b.galaxyOut,  t);
    st.galaxyDive = lerp(a.galaxyDive, b.galaxyDive, t);
  }

  // Le curve derivate, verbatim dalla sorgente.
  function orbDissolve(){ return smootherstep(st.orbOut); }
  function orbAlpha(){ return 1 - orbDissolve(); }
  function orbCoreOpen(p){ return smoothstep(2.9, 3.6, p); }
  function orbApproach(p){ return smoothstep(3.4, 4.0, p); }
  // Rampa di opacità della galassia: più lunga e morbida di quella sorgente
  // (che scattava su `in` 0.5→0.75), così le stelle arrivano a flusso.
  function galaxyAppear(){ return smootherstep(smoothstep(0.55, 0.95, st.galaxyIn)); }
  // Quanto le stelle sono ancora lontane dal posto, 1 → 0. Sta di proposito un
  // filo indietro rispetto ad `appear`: si vedono mentre sono ancora in arrivo,
  // così il disco si raduna dalla polvere invece di comparire già fatto.
  function galaxyAssemble(){ return 1 - smootherstep(smoothstep(0.5, 1.0, st.galaxyIn)); }
  function galaxyBlow(){ return smootherstep(clamp01((st.galaxyOut - 0.5) * 2)); }
  // Quanta inquadratura possiede la galassia. Guida camera, fondo e pulviscolo.
  // Segue `galaxyAppear`, NON `galaxyIn` grezzo: legata a quello, la camera
  // cominciava ad arretrare al primo pixel di scroll e strappava via l'orb
  // mentre era ancora mezzo visibile.
  function galaxyPresence(){ return galaxyAppear() * (1 - galaxyBlow()); }
  // Il cervello si forma sul 2.6→3.4 del clock, mentre la galassia esplode.
  function brainAppear(p){ return smootherstep(smoothstep(2.6, 3.4, p)); }

  // Lo scroll del pin, tutto quanto, ripiegato nella curva sorgente. L'outro NON
  // sta qui dentro: vive dopo, quando il pin si sgancia (vedi `stOutro` in fondo).
  function clockFromScroll(u){
    var c = clamp01(u);
    if (c < 1 / 3) return c * 3;              // traccia 1: 0 → 1
    if (c < 2 / 3) return 1 + (c - 1 / 3) * 6; // tracce 2+4: 1 → 3, a velocità doppia
    return 3 + (c - 2 / 3) * 3;               // traccia 3: 3 → 4
  }

  var progressTarget = 0, progress = 0;   // dove dice lo scroll / dove sta la scena
  var outro = 0;                          // 0 finché la scena possiede l'inquadratura

  // INTRO — `lib/scene/intro.ts`. Nella sorgente è una molla 0→1 fatta partire
  // dal loader; qui parte quando la sezione entra in quadro. Dura più dei 1800 ms
  // originali: i punti dell'orb arrivano volando dalla camera, e a quel passo
  // attraversavano l'inquadratura troppo in fretta per leggersi come un raduno.
  var INTRO_MS = 2900;
  var introStart = 0, introRunning = false, intro = 0;
  function startIntro(){ if (introRunning) return; introRunning = true; introStart = performance.now(); }
  function stepIntro(){
    if (!introRunning) return;
    var t = clamp01((performance.now() - introStart) / INTRO_MS);
    intro = 1 - Math.pow(1 - t, 3);   // easeOutCubic, come la molla sorgente
  }

  /* ==========================================================================
     RENDERER, SCENA, CAMERA
     ========================================================================== */

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 0, tier.orbCamZ + INTRO_DOLLY);

  // Il puntatore in NDC relativo al pin: il canvas non è tutta la pagina, e
  // usare le coordinate di finestra sposterebbe il contatto di mezza sezione.
  var ptrX = 0, ptrY = 0, hasPointer = false;
  var onMove = function(e){
    var r = pin.getBoundingClientRect();
    ptrX = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptrY = -(((e.clientY - r.top) / r.height) * 2 - 1);
    hasPointer = true;
  };
  window.addEventListener('mousemove', onMove, { passive: true });
  cleanups.push(function(){ window.removeEventListener('mousemove', onMove); });

  /* ==========================================================================
     FONDO — `scene/backdrop.tsx`.

     Un lavaggio radiale scuro più la "fiamma" a domain warp del pass compositivo
     delle scene sorgente. Là girava DOPO il bloom; qui è un quad in spazio clip
     disegnato per primo, sotto le particelle additive — visivamente equivalente,
     e dà un posto dove far vivere il cambio di palette: tutto il fondo passa da
     quello dell'orb a quello della galassia mentre le scene si danno il cambio.
     ========================================================================== */
  var WARP3D = [
    'vec3 warp3d(vec3 pos, float t){',
    '  float curv = 0.8, a = 1.9, b = 0.7;',
    '  pos *= 2.0;',
    '  pos.x += curv*sin(t + a*pos.y) + t*b; pos.y += curv*cos(t + a*pos.x);',
    '  pos.y += curv*sin(t + a*pos.z) + t*b; pos.z += curv*cos(t + a*pos.y);',
    '  pos.z += curv*sin(t + a*pos.x) + t*b; pos.x += curv*cos(t + a*pos.z);',
    '  return 0.5 + 0.5*cos(pos.xyz + vec3(1, 2, 4));',
    '}'
  ].join('\n');

  var CLIP_VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }'
  ].join('\n');

  var backUniforms = {
    iTime:     { value: 0 },
    uBg:       { value: G.hexToVec3(PAL_ORB.bg) },
    uFlameA:   { value: G.hexToVec3(PAL_ORB.flameA) },
    uFlameB:   { value: G.hexToVec3(PAL_ORB.flameB) },
    uFlameAmt: { value: PAL_ORB.flameAmt }
  };
  var backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: backUniforms,
      vertexShader: CLIP_VERT,
      fragmentShader: [
        'precision highp float;',
        'uniform float iTime; uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB;',
        'uniform float uFlameAmt;',
        'varying vec2 vUv;',
        WARP3D,
        'void main(){',
        '  vec2 uv = 2.0 * vUv - 1.0;',
        '  vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime * 1.5), vec3(1.5));',
        '  vec3 flame = 1.5 * uFlameA * w.x;',
        '  flame *= w.y;',
        '  flame += uFlameB * w.z;',
        '  flame *= smoothstep(0.25, 1.0, abs(uv.y));',
        '  float md = smoothstep(-0.7, 1.0, -uv.y * uv.x);',
        '  flame *= md * md;',
        '  vec3 bg = uBg * (1.0 - 0.4 * length(uv));',
        '  gl_FragColor = vec4(bg + flame * uFlameAmt, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    })
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  var palOrbBg     = G.hexToVec3(PAL_ORB.bg),     palGalBg     = G.hexToVec3(PAL_GALAXY.bg);
  var palOrbFlameA = G.hexToVec3(PAL_ORB.flameA), palGalFlameA = G.hexToVec3(PAL_GALAXY.flameA);
  var palOrbFlameB = G.hexToVec3(PAL_ORB.flameB), palGalFlameB = G.hexToVec3(PAL_GALAXY.flameB);

  /* ==========================================================================
     RIGA D'APERTURA — `scene/hero-line.tsx`.

     La riga orizzontale sottile, disegnata in WebGL per stare DIETRO la sfera:
     è un quad in spazio clip dopo il fondo e prima delle forme (renderOrder
     −0.5), così l'orb additivo le passa sopra. Una riga in DOM non potrebbe:
     il fondo è opaco e la coprirebbe.

     Le particelle additive però non OCCLUDONO: per leggersi davvero come dietro,
     la riga svanisce sull'impronta a schermo della sfera (una maschera centrale)
     e resta visibile solo ai lati — esattamente come nel progetto.
     ========================================================================== */
  var lineUniforms = {
    uY:          { value: 0.33 },
    uThickness:  { value: 0.0015 },
    uMaskRadius: { value: 0.2 },
    uAlpha:      { value: 0 }
  };
  var heroLine = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: lineUniforms,
      vertexShader: CLIP_VERT,
      fragmentShader: [
        'precision highp float;',
        'uniform float uY; uniform float uThickness; uniform float uMaskRadius; uniform float uAlpha;',
        'varying vec2 vUv;',
        'void main(){',
        '  float d = abs(vUv.y - uY);',
        '  float line = 1.0 - smoothstep(0.0, uThickness, d);',
        '  float side = smoothstep(uMaskRadius * 0.6, uMaskRadius, abs(vUv.x - 0.5));',
        '  gl_FragColor = vec4(vec3(1.0), line * side * 0.2 * uAlpha);',
        '}'
      ].join('\n'),
      transparent: true, depthTest: false, depthWrite: false
    })
  );
  heroLine.frustumCulled = false;
  heroLine.renderOrder = -0.5;
  heroLine.visible = false;
  scene.add(heroLine);

  var LINE_DESIGN_WIDTH = 1440;  // artboard di riferimento
  var LINE_FROM_BOTTOM  = 264;   // distanza dal fondo, in px di artboard

  /* ==========================================================================
     ORB — `scene/orb/`.

     La forma non è una mesh: è una sfera di Fibonacci (distribuzione uniforme,
     non la griglia lat/lon che addensa i poli) i cui punti vengono spinti lungo
     la normale da due ottave di simplex.

       uAssemble  i punti arrivano dalla camera e si posano, ognuno col suo
                  ritardo: si raduna, non compare. Lo guida l'INTRO, non lo
                  scroll — è l'entrata in scena, non una fase del racconto.
       uCore      un foro passante lungo l'asse di vista, misurato in spazio
                  OGGETTO: il bordo segue la superficie già deformata e ondeggia
                  con lei invece di essere un cerchio netto stampato sopra.
       uOut       la dissoluzione: i punti scorrono a lenzuoli, con un'onda che
                  viaggia, così si sfalda invece di esplodere.

     L'"olio" del cursore vive in spazio MONDO e non gira con la sfera: la sfera
     ruota sotto la gobba, che resta dove sta il dito. È il dettaglio che fa
     sembrare la superficie un liquido e non una texture che scorre.
     ========================================================================== */
  var orbPositions = new Float32Array(tier.orbCount * 3);
  var orbRandoms   = new Float32Array(tier.orbCount * 3);
  var golden = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < tier.orbCount; i++) {
    var y  = 1 - (i / (tier.orbCount - 1)) * 2;
    var rr = Math.sqrt(Math.max(0, 1 - y * y));
    var th = golden * i;
    orbPositions[i*3]   = Math.cos(th) * rr * ORB.radius;
    orbPositions[i*3+1] = y * ORB.radius;
    orbPositions[i*3+2] = Math.sin(th) * rr * ORB.radius;
    orbRandoms[i*3]   = Math.random() - 0.5;
    orbRandoms[i*3+1] = Math.random() - 0.5;
    orbRandoms[i*3+2] = Math.random() - 0.5;
  }
  var orbGeo = new THREE.BufferGeometry();
  orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPositions, 3));
  orbGeo.setAttribute('aRandom',  new THREE.BufferAttribute(orbRandoms, 3));

  var orbUniforms = {
    uTime:          { value: 0 },
    uPR:            { value: 1 },
    uSize:          { value: tier.orbSize },
    uDeform:        { value: ORB.deform },
    uOut:           { value: 0 },
    uAssemble:      { value: 0 },
    uCore:          { value: 0 },
    uCentre:        { value: new THREE.Vector3() },
    uCamLocal:      { value: new THREE.Vector3(0, 0, 1) },
    uColTop:        { value: G.hexToVec3(ORB.colorTop) },
    uColBottom:     { value: G.hexToVec3(ORB.colorBottom) },
    uColEdge:       { value: G.hexToVec3(ORB.colorEdge) },
    uBrightness:    { value: ORB.brightness },
    uOpacity:       { value: ORB.opacity },
    uAppear:        { value: 0 },
    uCursor:        { value: new THREE.Vector3(0, 0, ORB.radius) },
    uCursorVel:     { value: new THREE.Vector3() },
    uEnergy:        { value: 0 },
    uPointerRadius: { value: ORB.pointerRadius },
    uOilBulge:      { value: ORB.oilBulge },
    uOilRipple:     { value: ORB.oilRipple },
    uOilDrag:       { value: ORB.oilDrag },
    uRippleFreq:    { value: ORB.rippleFreq },
    uRippleSpeed:   { value: ORB.rippleSpeed },
    uIri:           { value: ORB.iridescence }
  };

  var orbMaterial = new THREE.ShaderMaterial({
    uniforms: orbUniforms,
    vertexShader: [
      'uniform float uTime; uniform float uSize; uniform float uPR; uniform float uDeform;',
      'uniform float uOut; uniform float uAssemble; uniform float uCore;',
      'uniform vec3 uCentre; uniform vec3 uCamLocal; uniform vec3 uCursor; uniform vec3 uCursorVel;',
      'uniform float uEnergy; uniform float uPointerRadius;',
      'uniform float uOilBulge; uniform float uOilRipple; uniform float uOilDrag;',
      'uniform float uRippleFreq; uniform float uRippleSpeed;',
      'attribute vec3 aRandom;',
      'varying float vAlpha; varying float vLit; varying float vVert; varying float vSide; varying float vOil;',
      G.SNOISE,
      'void main(){',
      '  vec3 p = position;',
      '  float n1 = snoise(p * 1.6 + vec3(0.0, uTime * 0.18, 0.0));',
      '  float n2 = snoise(p * 3.3 - vec3(uTime * 0.12));',
      '  float disp = n1 * 0.72 + n2 * 0.28;',
      '  vec3 pos = p * (1.0 + uDeform * disp);',
      '  float lit = smoothstep(-0.25, 0.5, disp);',
      '  vLit = lit;',
      // Il foro, in spazio oggetto contro la superficie GIÀ deformata.
      '  vec3 axis = normalize(uCamLocal);',
      '  float axial = dot(pos, axis);',
      '  float radial = length(pos - axis * axial);',
      '  float bore = mix(0.36, 0.56, uCore) * (1.0 + disp * 0.55);',
      '  float hole = smoothstep(bore, bore + 0.10, radial);',
      // Il raduno: ogni punto ha il suo ritardo, così la nuvola sfila e si posa.
      '  float delay = (aRandom.z + 0.5) * 0.55;',
      '  float t = clamp((uAssemble - delay) / (1.0 - delay), 0.0, 1.0);',
      '  float ease = 1.0 - pow(1.0 - t, 3.0);',
      '  vec3 spawn = uCamLocal * 0.92 + vec3(aRandom.x * 1.9, -1.7 + aRandom.y * 1.3, 0.0);',
      '  pos = mix(spawn, pos, ease);',
      '  float assembleFade = ease;',
      // Lo sfaldamento a lenzuoli.
      '  float out2 = uOut * uOut;',
      '  vec3 flow = normalize(p + aRandom * 0.4);',
      '  float sheet = snoise(p * 1.9 + vec3(uTime * 0.25));',
      '  float ripple = sin(length(p) * 6.0 - uTime * 1.6 + sheet * 3.0);',
      '  pos += flow * (out2 * (9.0 + sheet * 5.0 + ripple * 1.6));',
      '  pos += vec3(sheet, ripple, sheet * ripple) * uOut * 0.55;',
      // L'olio: in spazio MONDO, non gira con la sfera.
      '  vec4 wpos = modelMatrix * vec4(pos, 1.0);',
      '  vec3 wN = normalize(wpos.xyz - uCentre);',
      '  float ang = acos(clamp(dot(wN, normalize(uCursor)), -1.0, 1.0));',
      '  float fall = smoothstep(uPointerRadius, 0.0, ang);',
      '  float bulge = fall * fall;',
      '  float oilRip = sin(ang * uRippleFreq - uTime * uRippleSpeed) * fall;',
      '  float oil = (bulge * uOilBulge + oilRip * uOilRipple) * uEnergy;',
      '  wpos.xyz += wN * oil;',
      '  wpos.xyz += uCursorVel * fall * uOilDrag * uEnergy;',
      '  vOil = (bulge + max(oilRip, 0.0) * 0.5) * uEnergy;',
      '  vec4 mv = viewMatrix * wpos;',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = uSize * uPR * (1.0 / max(0.1, -mv.z));',
      '  vVert = mv.y;',
      '  vSide = abs(mv.x);',
      '  float depth = pos.z * 0.5 + 0.5;',
      '  float outFade = 1.0 - smoothstep(0.0, 0.92, uOut);',
      // Fondi di alpha e di colore: il blending è additivo, ma su un nero quasi
      // pieno un punto che collassa scopre lo sfondo e si legge come una macchia
      // scura invece che come una particella più fioca.
      '  vAlpha = hole * (0.28 + 0.32 * depth) * (0.38 + 0.72 * lit) * outFade * assembleFade;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform vec3 uColTop; uniform vec3 uColBottom; uniform vec3 uColEdge;',
      'uniform float uBrightness; uniform float uOpacity; uniform float uAppear; uniform float uIri;',
      'varying float vAlpha; varying float vLit; varying float vVert; varying float vSide; varying float vOil;',
      'void main(){',
      '  vec2 uv = gl_PointCoord - 0.5;',
      '  float d = length(uv);',
      '  if (d > 0.5) discard;',
      '  float soft = smoothstep(0.5, 0.0, d);',
      '  soft = soft * soft * 1.2;',
      '  float core = smoothstep(0.13, 0.0, d);',
      '  float vt = clamp(vVert * 0.5 + 0.5, 0.0, 1.0);',
      '  vec3 col = mix(uColBottom, uColTop, vt);',
      '  col = mix(col, uColEdge, smoothstep(0.72, 1.15, vSide));',
      '  col *= (0.78 + 0.42 * vLit);',
      '  col += smoothstep(0.6, 1.0, vLit) * core * vec3(0.45);',
      '  float cap = smoothstep(0.55, 1.05, abs(vVert));',
      '  col += col * cap * 1.1;',
      '  float capA = 1.0 + 0.6 * cap;',
      '  float oilMask = clamp(vOil, 0.0, 1.0);',
      '  vec3 iri = 0.5 + 0.5 * cos(6.2831853 * (vOil * 2.4 + abs(vVert) * 0.3 + vec3(0.0, 0.33, 0.67)));',
      '  col = mix(col, iri, oilMask * uIri);',
      '  col += oilMask * 0.3;',
      '  col *= uBrightness;',
      '  gl_FragColor = vec4(col, soft * vAlpha * capA * uOpacity * uAppear * (1.0 + oilMask * 0.5));',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending
  });

  var orbGroup = new THREE.Group();
  var orbPoints = new THREE.Points(orbGeo, orbMaterial);
  orbPoints.frustumCulled = false;
  orbGroup.add(orbPoints);
  orbGroup.visible = false;
  scene.add(orbGroup);

  /* ---- il puntatore "oleoso" — `orb/oil-pointer.ts` ----
   * Proietta il cursore sulla sfera per trovare il punto di contatto, lo insegue
   * in ritardo (viscosità) e accumula un'energia che sale col movimento e cala
   * piano: la superficie continua a fluire un momento e poi si posa.
   */
  var oil = (function(radius){
    var smooth = new THREE.Vector3(0, 0, radius);
    var prev   = new THREE.Vector3(0, 0, radius);
    var vel    = new THREE.Vector3();
    var rawVel = new THREE.Vector3();
    var ndc = new THREE.Vector3(), dir = new THREE.Vector3();
    var o2c = new THREE.Vector3(), target = new THREE.Vector3(), radialV = new THREE.Vector3();
    var ptr = new THREE.Vector2();
    var energy = 0, idle = 0;

    return {
      cursor: smooth, velocity: vel,
      get energy(){ return energy; },
      step: function(cam, ndcX, ndcY, centre, enabled, dt){
        // Smorzamento indipendente dal frame rate: `base` è la quota chiusa in
        // 1/60 s, così il comportamento è lo stesso a 60, 45 o 30 fps.
        function ease(base){ return 1 - Math.pow(1 - base, dt * 60); }
        ptr.x += (ndcX - ptr.x) * ease(0.11);
        ptr.y += (ndcY - ptr.y) * ease(0.11);
        target.copy(smooth);
        if (enabled) {
          ndc.set(ptr.x, ptr.y, 0.5).unproject(cam);
          dir.copy(ndc).sub(cam.position).normalize();
          o2c.copy(cam.position).sub(centre);
          var b = 2 * dir.dot(o2c);
          var c = o2c.lengthSq() - radius * radius;
          var disc = b * b - 4 * c;
          if (disc >= 0) {
            target.copy(o2c).addScaledVector(dir, (-b - Math.sqrt(disc)) / 2);
          } else {
            // Il raggio manca la sfera: si prende il punto più vicino e lo si
            // spinge sulla superficie, così il contatto non sparisce ai bordi.
            var tc = Math.max(0, -dir.dot(o2c));
            target.copy(o2c).addScaledVector(dir, tc).normalize().multiplyScalar(radius);
          }
        }
        prev.copy(smooth);
        smooth.lerp(target, ease(0.1));
        // Solo la componente tangente: la parte radiale spingerebbe dentro o
        // fuori invece di spalmare.
        rawVel.subVectors(smooth, prev).multiplyScalar(2.5);
        radialV.copy(smooth).normalize();
        rawVel.addScaledVector(radialV, -rawVel.dot(radialV));
        if (rawVel.length() > 0.6) rawVel.setLength(0.6);
        vel.lerp(rawVel, ease(0.16));

        var speed = smooth.distanceTo(prev);
        var drive = Math.max(0, Math.min(1, speed * 8));
        if (drive > energy) energy += (drive - energy) * ease(0.08);
        else energy *= Math.pow(0.97, dt * 60);
        idle = speed < 0.0005 ? idle + dt : 0;
        if (!enabled || idle > 2.5) energy *= Math.pow(0.9, dt * 60);
      }
    };
  })(ORB.radius);

  /* ==========================================================================
     GALASSIA — `scene/galaxy/`.

     La seconda scena: una spirale a due bracci più un bulge sferico al centro,
     ricavati da hash per-vertice delle posizioni della sfera sorgente — la
     geometria è solo un reticolo di semi, non viene mai disegnata come sfera.

     `SphereGeometry` è indicizzata, e `THREE.Points` rispetta l'indice: ogni
     vertice è riferito ~6 volte dalla lista dei triangoli, quindi la sfera
     disegnerebbe ~700k sprite per ~120k stelle distinte, impilate una sull'altra.
     Togliendo l'indice ogni stella viene disegnata una volta sola. Il blending
     additivo è lineare, quindi N sprite coincidenti di alpha `a` sommano a
     esattamente `N·a`: scalare l'opacità per il fattore di duplicazione
     riproduce l'immagine sorgente facendo un sesto del lavoro.
     ========================================================================== */
  var galSphere = new THREE.SphereGeometry(4.2, tier.galW, tier.galH);
  var galVerts = galSphere.attributes.position.count;
  var galDuplicates = galSphere.index ? galSphere.index.count / galVerts : 1;
  galSphere.setIndex(null);
  var galOpacity = GALAXY.opacity * galDuplicates;

  var galUniforms = {
    uTime:          { value: 0 },
    uAppear:        { value: 0 },
    uFade:          { value: 1 },
    uBlow:          { value: 0 },
    uAssemble:      { value: 1 },
    uColEdge:       { value: G.hexToVec3(GALAXY.colorEdge) },
    uColCore:       { value: G.hexToVec3(GALAXY.colorCore) },
    uOpacity:       { value: galOpacity },
    uSize:          { value: GALAXY.pointSize },
    uBrightness:    { value: GALAXY.brightness },
    uArmSpin:       { value: GALAXY.armSpin },
    uScale:         { value: GALAXY.scale },
    uCursor:        { value: new THREE.Vector3() },
    uRepelRadius:   { value: GALAXY.pointerRadius },
    uRepelStrength: { value: GALAXY.pointerStrength },
    uActivity:      { value: 0 }
  };

  var galMaterial = new THREE.ShaderMaterial({
    uniforms: galUniforms,
    vertexShader: [
      'uniform float uTime; uniform float uSize; uniform float uArmSpin; uniform float uScale;',
      'uniform float uBlow; uniform float uAssemble;',
      'uniform vec3 uColEdge; uniform vec3 uColCore; uniform vec3 uCursor;',
      'uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;',
      'varying float vFade; varying vec3 vColor;',
      'void main(){',
      '  float gRnd1 = fract(sin(dot(position.xyz, vec3(12.989, 78.233, 45.164))) * 43758.545);',
      '  float gRnd2 = fract(sin(dot(position.xyz, vec3(93.989, 67.345, 54.256))) * 24634.634);',
      '  float gRnd3 = fract(sin(dot(position.xyz, vec3(43.332, 11.235, 89.234))) * 56475.234);',
      '  float gRnd4 = fract(sin(dot(position.xyz, vec3(75.321, 32.123, 23.456))) * 35432.123);',
      '  float galaxyR = pow(gRnd1, 2.0) * 60.0 + pow(gRnd2, 3.0) * 30.0;',
      '  float swirl = pow(galaxyR, 1.1) * 0.08;',
      '  float armIndex = floor(gRnd2 * 2.0);',
      '  float baseAngle = armIndex * 3.14159265;',
      '  float uniformTheta = gRnd3 * 2.0 - 1.0;',
      '  float dTheta = pow(uniformTheta, 5.0) * 3.14159;',
      '  float theta = baseAngle + swirl + dTheta + uTime * uArmSpin;',
      '  float gx = galaxyR * cos(theta);',
      '  float gz = galaxyR * sin(theta);',
      '  float gyDisc = pow(gRnd4 * 2.0 - 1.0, 3.0) * 1.5;',
      '  vec3 basePos = vec3(gx, gyDisc, gz);',
      '  float bulgeStrength = smoothstep(25.0, 0.0, galaxyR);',
      '  float gRnd5 = fract(sin(gRnd1 * 44.44 + gRnd2) * 555.55);',
      '  float gRnd6 = fract(sin(gRnd3 * 66.66 + gRnd4) * 777.77);',
      '  float gRnd7 = fract(sin(gRnd5 * 88.88 + gRnd6) * 999.99);',
      '  float phi = acos(gRnd5 * 2.0 - 1.0);',
      '  float thetaS = gRnd6 * 6.2831853 + uTime * (uArmSpin * 2.0);',
      '  float rS = pow(gRnd7, 2.0) * 18.0;',
      '  vec3 bulge = vec3(rS * sin(phi) * cos(thetaS), rS * cos(phi), rS * sin(phi) * sin(thetaS));',
      '  vec3 galaxyPos = mix(basePos, bulge, bulgeStrength);',
      '  vec3 blowDir = normalize(vec3(gRnd1, gRnd2, gRnd3) - 0.5 + 0.0001);',
      // Il raduno: ogni stella arriva da lontano lungo il suo vettore, col suo
      // ritardo, così il disco si forma dalla polvere invece di accendersi.
      // Il raggio di nascita è in unità locali; uScale (0.18) lo porta a mondo.
      // Molto più grande di così e il guscio in arrivo racchiude la camera.
      '  float delay = gRnd4 * 0.45;',
      '  float at = clamp((1.0 - uAssemble - delay) / (1.0 - delay), 0.0, 1.0);',
      '  float aEase = 1.0 - pow(1.0 - at, 3.0);',
      '  vec3 spawn = galaxyPos + blowDir * 70.0 + vec3(0.0, (gRnd3 - 0.5) * 26.0, 0.0);',
      '  galaxyPos = mix(spawn, galaxyPos, aEase);',
      // La dispersione: ogni punto vola via lungo la propria direzione.
      '  galaxyPos += blowDir * uBlow * 90.0;',
      '  vec3 finalPos = galaxyPos * uScale;',
      '  vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);',
      '  vec3 toP = modelPosition.xyz - uCursor;',
      '  float cd = length(toP);',
      '  float fall = smoothstep(uRepelRadius, 0.0, cd);',
      '  modelPosition.xyz += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * uActivity;',
      '  vec4 mvPosition = viewMatrix * modelPosition;',
      '  float coreMix = smoothstep(80.0, 0.0, galaxyR);',
      '  vColor = mix(uColEdge, uColCore, clamp(coreMix, 0.0, 1.0));',
      '  float isOrb = step(0.98, fract(gRnd1 * 77.77));',
      '  float starSize = mix(1.0, 3.0, isOrb);',
      '  vFade = mix(0.7, 1.0, isOrb);',
      '  gl_PointSize = uSize * starSize * (10.0 / -mvPosition.z);',
      '  gl_PointSize = max(gl_PointSize, 1.5);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform float uOpacity; uniform float uBrightness; uniform float uAppear; uniform float uFade;',
      'varying float vFade; varying vec3 vColor;',
      'void main(){',
      '  vec2 xy = gl_PointCoord - 0.5;',
      '  float ll = length(xy);',
      '  if (ll > 0.5) discard;',
      '  float a = smoothstep(0.5, 0.1, ll);',
      '  gl_FragColor = vec4(vColor * uBrightness, vFade * a * uOpacity * uAppear * uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  var galGroup = new THREE.Group();
  var galPoints = new THREE.Points(galSphere, galMaterial);
  galPoints.frustumCulled = false;
  galGroup.add(galPoints);
  galGroup.visible = false;
  scene.add(galGroup);

  var galCursor = new THREE.Vector3(), galCursorTarget = new THREE.Vector3();
  var galNdc = new THREE.Vector3(), galRay = new THREE.Vector3();
  var galActivity = 0;

  /* ==========================================================================
     CERVELLO — `scene/brain/`.

     La terza forma, al posto dell'orb che tornava con il logo. È una superficie
     campionata per area dalla mesh COTTA: 43 KB al posto del GLB da 4,67 MB (di
     cui 4,5 erano texture che lo shader non legge). Il contenitore è `VBRN`,
     posizioni quantizzate a int16 su raggio unitario, già centrate sul baricentro
     di superficie — vedi `scripts/bake-brain.mjs` nel progetto sorgente.

     Il file viene scaricato ma NON atteso: se non arriva, la sezione resta in
     piedi con orb e galassia. È l'ordine giusto anche a schermo, visto che la
     forma serve solo al terzo atto.

     `uExplode` fa due mestieri: a 1 i punti sono dispersi lungo la loro direzione
     radiale, a 0 riposano sulla superficie. Guida quindi sia il raduno (1→0 mentre
     la galassia esplode) sia lo scoppio d'uscita (0→1 sull'outro).
     ========================================================================== */
  var brainUniforms = {
    iTime:              { value: 0 },
    iAlpha:             { value: 0 },
    iResolutionY:       { value: 720 },
    uCool:              { value: G.hexToVec3(BRAIN.colorCool) },
    uWarm:              { value: G.hexToVec3(BRAIN.colorWarm) },
    uEdgeColor:         { value: G.hexToVec3(BRAIN.colorEdge) },
    uCenterColor:       { value: G.hexToVec3(BRAIN.colorCenter) },
    uSynapse:           { value: G.hexToVec3(BRAIN.colorSynapse) },
    uDeepColor:         { value: G.hexToVec3(BRAIN.colorDeep) },
    uCursorColor:       { value: G.hexToVec3(BRAIN.colorCursor) },
    uHighlightColor:    { value: G.hexToVec3('#2563eb') },
    uCenterRadius:      { value: BRAIN.centerRadius },
    uCenterFalloff:     { value: BRAIN.centerFalloff },
    uSize:              { value: BRAIN.size },
    uSynapseRate:       { value: BRAIN.synapseRate },
    uFlowSpeed:         { value: BRAIN.flowSpeed },
    uFlowAmount:        { value: BRAIN.flowAmount },
    uGlow:              { value: BRAIN.glow },
    uDepthDarkness:     { value: BRAIN.depthDarkness },
    uOcclusionStrength: { value: 0 },
    uHighlightPos:      { value: new THREE.Vector3(0, 0, 0) },
    uHighlightRadius:   { value: 0.6 },
    uHighlightStrength: { value: 0 },
    uFocusFadeStrength: { value: 0.55 },
    uIsolateStrength:   { value: 0.88 },
    uExplode:           { value: 1 },
    uExplodeDist:       { value: 5 },
    uMouse:             { value: new THREE.Vector2(-10, -10) },
    uCursor:            { value: 0 },
    uAspect:            { value: 1 },
    uCursorRadius:      { value: 0.1 }
  };

  var brainGroup = new THREE.Group();
  brainGroup.visible = false;
  scene.add(brainGroup);
  // Il materiale del cervello nasce ora nella callback del fetch (via
  // WC.pointBrain), non più sincrono a inizio scena: resta null finché la mesh
  // non arriva. `brainUniforms` (sopra) è invece già pronto e viene passato al
  // materiale così com'è — è lo stesso oggetto che il loop pilota.
  var brainGeo = null, brainPoints = null, brainMaterial = null;
  var brainParallax = { ry: 0, rx: 0 };

  /* Decodifica del contenitore cotto: 'VBRN' + versione + conteggi, poi le
   * posizioni int16 (frazioni del raggio unitario) e gli indici uint16. */
  function decodeBrainMesh(buffer){
    var view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x4e524256) throw new Error('brain mesh: magic errato');
    if (view.getUint32(4, true) !== 1) throw new Error('brain mesh: versione non supportata');
    var vertexCount = view.getUint32(8, true);
    var indexCount  = view.getUint32(12, true);
    var quantised = new Int16Array(buffer, 16, vertexCount * 3);
    var positions = new Float32Array(vertexCount * 3);
    for (var k = 0; k < positions.length; k++) positions[k] = quantised[k] / 32767;
    var indexBase = 16 + vertexCount * 3 * 2;
    var indices = new Uint16Array(buffer.slice(indexBase, indexBase + indexCount * 2));
    return { positions: positions, indices: indices };
  }

  var brainAborted = false;
  fetch(BRAIN.meshUrl).then(function(res){
    if (!res.ok) throw new Error('brain mesh: ' + res.status + ' ' + res.statusText);
    return res.arrayBuffer();
  }).then(function(buf){
    if (brainAborted) return;
    // Il cervello di punti ora vive in WC.pointBrain (js/pointbrain.js), da cui
    // lo riusa anche il robot (Task 5): il campionamento di superficie e lo
    // shader dei punti stanno lì. Qui restano il contenitore cotto
    // (decodeBrainMesh) e la coreografia. Le `brainUniforms` guidate nel loop
    // sono lo STESSO oggetto passato al materiale, quindi la resa è identica.
    var decoded = decodeBrainMesh(buf);
    var srcGeo = new THREE.BufferGeometry();
    srcGeo.setAttribute('position', new THREE.BufferAttribute(decoded.positions, 3));
    srcGeo.setIndex(new THREE.BufferAttribute(decoded.indices, 1));
    var brain = WC.pointBrain.create({
      count: tier.brainCount, radius: BRAIN.radius,
      sampleFrom: new THREE.Mesh(srcGeo), uniforms: brainUniforms
    });
    srcGeo.dispose();
    brainGeo = brain.geometry;
    brainMaterial = brain.material;
    brainPoints = brain.points;   // frustumCulled già false dall'helper
    brainGroup.add(brainPoints);
  }).catch(function(err){
    // Un cervello che non arriva non deve portarsi giù il resto della scena.
    console.error('[vesper] mesh del cervello non caricata:', err);
  });

  /* ==========================================================================
     PULVISCOLO — `scene/atmosphere.tsx`.

     Motes alla deriva agganciati alla CAMERA. Non è il pulviscolo condiviso di
     js/glsl.js: quello ha raggio e colore fissi, e qui la camera viaggia da ~4 a
     ~48 unità mondo attraverso il tuffo. Raggio, dissolvenza, colore e opacità
     fanno tutti il passaggio fra la taratura dell'orb e quella della galassia.
     ========================================================================== */
  var atmoPositions = new Float32Array(tier.atmoCount * 3);
  var atmoSizes     = new Float32Array(tier.atmoCount);
  for (var ai = 0; ai < tier.atmoCount; ai++) {
    atmoPositions[ai*3]   = 2 * Math.random() - 1;
    atmoPositions[ai*3+1] = 2 * Math.random() - 1;
    atmoPositions[ai*3+2] = 2 * Math.random() - 1;
    atmoSizes[ai] = tier.atmoSize * (0.4 + Math.random());
  }
  var atmoGeo = new THREE.BufferGeometry();
  atmoGeo.setAttribute('position', new THREE.BufferAttribute(atmoPositions, 3));
  atmoGeo.setAttribute('size',     new THREE.BufferAttribute(atmoSizes, 1));

  var atmoOrbColor = G.hexToVec3(PAL_ORB.atmo);
  var atmoGalColor = G.hexToVec3(PAL_GALAXY.atmo);

  var atmoUniforms = {
    uTime:     { value: 0 },
    uColor:    { value: atmoOrbColor.clone() },
    uAlpha:    { value: PAL_ORB.atmoAlpha },
    uSpread:   { value: PAL_ORB.atmoSpread },
    uFadeNear: { value: PAL_ORB.atmoFadeNear },
    uFadeFar:  { value: PAL_ORB.atmoFadeFar },
    uRes:      { value: new THREE.Vector2(1, 1) }
  };

  var atmoPoints = new THREE.Points(atmoGeo, new THREE.ShaderMaterial({
    uniforms: atmoUniforms,
    vertexShader: [
      'attribute float size;',
      'uniform float uTime; uniform vec2 uRes; uniform float uSpread;',
      'uniform float uFadeNear; uniform float uFadeFar;',
      'varying float vA;',
      'vec3 warp(vec3 p, float t){',
      '  float c = 0.9, a = 1.9, b = 0.02, s = 0.05;',
      '  p *= 2.0;',
      '  p.x += c*sin(s*t + a*p.y) + t*b; p.y += c*cos(s*t + a*p.x);',
      '  p.y += c*sin(s*t + a*p.z) + t*b; p.z += c*cos(s*t + a*p.y);',
      '  p.z += c*sin(s*t + a*p.x) + t*b; p.x += c*cos(s*t + a*p.z);',
      '  return cos(p + vec3(1, 2, 4));',
      '}',
      'void main(){',
      '  vec3 v = position * uSpread + warp(position, uTime) * (uSpread * 0.28);',
      '  vec4 mv = modelViewMatrix * vec4(v, 1.0);',
      '  float r = length(v);',
      '  float farF = 1.0 - smoothstep(uFadeNear, uFadeFar, r);',
      '  float nearF = smoothstep(0.0, 0.3, -mv.z);',
      '  vA = farF * nearF;',
      '  gl_PointSize = size * uRes.y / 900.0 / -mv.z;',
      '  gl_PointSize = max(gl_PointSize, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform vec3 uColor; uniform float uAlpha;',
      'varying float vA;',
      'void main(){',
      '  vec2 p = gl_PointCoord - 0.5;',
      '  float l = length(p);',
      '  if (l > 0.5) discard;',
      '  float tex = smoothstep(0.5, 0.0, l);',
      '  gl_FragColor = vec4(uColor * tex, tex * vA * uAlpha);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending
  }));
  atmoPoints.frustumCulled = false;
  scene.add(atmoPoints);

  /* ==========================================================================
     CICLO
     ========================================================================== */

  var dpr = 1, size = { w: 1, h: 1 };
  var running = false, raf = 0, last = performance.now(), started = performance.now();
  var lastDraw = 0;
  // Tetto di frame rate per scaglione. È un tetto RAGGIUNGIBILE saltando interi
  // frame di rAF: su un pannello a 60 Hz i valori onesti sono 60 e 30, e 45
  // degrada a 30 — che è l'intenzione, un tablet che spende il budget in meno
  // frame ma completi. La tolleranza di 2 ms evita il battito alternato
  // 16,7/33 ms che farebbe scendere un "60" a ~40 fps veri.
  var frameInterval = tier.fps >= 60 ? 0 : (1000 / tier.fps) - 2;

  var centre = new THREE.Vector3(), camLocal = new THREE.Vector3();

  function resize(){
    var r = pin.getBoundingClientRect();
    size.w = Math.max(1, r.width); size.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, tier.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = (now - started) / 1000;

    // L'orologio avanza SEMPRE, anche nei frame che il gate non disegna: se
    // avanzasse solo al disegno, sugli scaglioni bassi la scena si muoverebbe a
    // scatti proporzionali al frame skip invece che al tempo.
    stepIntro();
    var d = progressTarget - progress;
    if (Math.abs(d) < 0.00005) progress = progressTarget;
    else progress += d * G.damp(tier.lerp, dt);
    sampleScene(progress);

    if (frameInterval && now - lastDraw < frameInterval) return;
    lastDraw = now;

    var presence = galaxyPresence();
    var introEased = 1 - Math.pow(1 - intro, 2);
    var handoff = 1 - outro;   // quanto d'inquadratura possiede ancora la scena

    /* ---- camera — `main-scene.tsx` ----
     * Le due scene sorgente portavano ognuna la sua camera: l'orb sta vicino
     * (z ≈ 3.8), la galassia lontana (z = 48, che tuffa a 18). Invece di
     * riscalare una forma per raggiungere l'altra, è la CAMERA a viaggiare fra
     * loro: ogni forma resta alla scala con cui è stata scritta. Il "tuffo" è
     * quello che rende immersivo l'arrivo della galassia — la camera cade verso
     * il nucleo mentre il disco si mette di taglio. */
    var galaxyZ = GALAXY.cameraZ - st.galaxyDive * GALAXY.dive;
    var targetZ = lerp(tier.orbCamZ, galaxyZ, presence) + (1 - introEased) * INTRO_DOLLY;
    camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 8);

    // Oscillazione da cursore: un sussurro per l'orb vicino, un'orbita per la
    // galassia larga.
    var sway = lerp(ORB_PARALLAX, GALAXY.parallax, presence);
    var swayOk = pointerOk && hasPointer;
    var targetX = swayOk ? ptrX * sway * introEased : 0;
    var targetY = swayOk ? ptrY * sway * 0.55 * introEased : 0;
    var follow = Math.min(1, dt * 3);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.lookAt(0, 0, 0);

    /* ---- fondo ---- */
    backUniforms.iTime.value = t;
    backUniforms.uBg.value.lerpVectors(palOrbBg, palGalBg, presence);
    backUniforms.uFlameA.value.lerpVectors(palOrbFlameA, palGalFlameA, presence);
    backUniforms.uFlameB.value.lerpVectors(palOrbFlameB, palGalFlameB, presence);
    backUniforms.uFlameAmt.value = lerp(PAL_ORB.flameAmt, PAL_GALAXY.flameAmt, presence);

    /* ---- riga d'apertura ---- */
    // Sta in passo con la copy scalata a vw: la riga è a `LINE_FROM_BOTTOM` px
    // di artboard dal fondo, scalati sulla larghezza.
    var fromBottomPx = (LINE_FROM_BOTTOM * size.w) / LINE_DESIGN_WIDTH;
    lineUniforms.uY.value = clamp(fromBottomPx / Math.max(1, size.h), 0.02, 0.95);
    // Riga netta da ~1 px; maschera centrale dimensionata sulla mezza larghezza
    // dell'orb a schermo.
    lineUniforms.uThickness.value = 0.6 / Math.max(1, size.h);
    lineUniforms.uMaskRadius.value = (0.36 * size.h) / Math.max(1, size.w);
    var lineRevealed = clamp01((intro - 0.35) / 0.65);
    var lineGone = clamp01((progress - 0.08) / 0.2);
    var lineAlpha = lineRevealed * (1 - lineGone);
    lineUniforms.uAlpha.value = lineAlpha;
    heroLine.visible = lineAlpha > 0.002;

    /* ---- orb ---- */
    orbUniforms.uTime.value = t;
    orbUniforms.uPR.value = dpr;
    // La copy dell'inquadratura passa alle sezioni che chiudono: quel che resta
    // della sfera si spegne invece di restare dietro a contenuto vero.
    orbUniforms.uAppear.value = handoff;
    orbUniforms.uAssemble.value = intro;
    orbUniforms.uOut.value = orbDissolve();
    orbUniforms.uCore.value = orbCoreOpen(progress);

    orbPoints.rotation.y = t * ORB.spin;
    orbPoints.rotation.x = Math.sin(t * 0.1) * ORB.tilt;

    // "Entrare nell'ignoto": invece di allontanarsi, la sfera viene verso la
    // camera e il rumore che la deforma si gonfia, così si sforma arrivando.
    var approach = orbApproach(progress);
    orbGroup.position.z = tier.orbMoveY * ORB.approach * approach;
    orbUniforms.uDeform.value = ORB.deform * (1 + approach * ORB.distortGain);

    // La camera nello spazio dei punti. Il foro e il punto di nascita sono
    // entrambi in spazio oggetto e i punti ruotano: va ricalcolata DOPO la
    // rotazione qui sopra, e serve una matrice mondo fresca.
    orbPoints.updateMatrixWorld();
    camLocal.copy(camera.position);
    orbPoints.worldToLocal(camLocal);
    orbUniforms.uCamLocal.value.copy(camLocal);
    centre.set(0, orbGroup.position.y, 0);
    orbUniforms.uCentre.value.copy(centre);

    oil.step(camera, ptrX, ptrY, centre, pointerOk && hasPointer, dt);
    orbUniforms.uCursor.value.copy(oil.cursor);
    orbUniforms.uCursorVel.value.copy(oil.velocity);
    orbUniforms.uEnergy.value = oil.energy;

    // Continua a disegnare finché la dissoluzione l'ha davvero portata via:
    // fermarsi al solo `orbOut` la tagliava mentre stava ancora sfumando.
    orbGroup.visible = intro > 0.001 && handoff > 0.002 && orbAlpha() > 0.002;

    /* ---- galassia ---- */
    var gAppear = galaxyAppear(), gBlow = galaxyBlow(), gAssemble = galaxyAssemble();
    galUniforms.uTime.value = t;
    galUniforms.uAppear.value = gAppear;
    galUniforms.uBlow.value = gBlow;
    galUniforms.uFade.value = (1 - gBlow) * handoff;
    galUniforms.uAssemble.value = gAssemble;

    galGroup.rotation.x = -(GALAXY.tilt + st.galaxyDive * GALAXY.diveTilt);
    galGroup.rotation.z = pointerOk ? ptrX * 0.12 : 0;

    // Il "vuoto" sotto il cursore: il puntatore proiettato sul piano z = 0 in
    // coordinate mondo.
    galCursorTarget.set(0, 0, 0);
    if (pointerOk && hasPointer) {
      galNdc.set(ptrX, ptrY, 0.5).unproject(camera);
      galRay.copy(galNdc).sub(camera.position).normalize();
      if (Math.abs(galRay.z) > 1e-4) {
        var gt = -camera.position.z / galRay.z;
        if (gt > 0 && isFinite(gt)) galCursorTarget.copy(camera.position).addScaledVector(galRay, gt);
      }
    }
    galCursor.lerp(galCursorTarget, 0.12);
    galUniforms.uCursor.value.copy(galCursor);
    galActivity += ((pointerOk && hasPointer ? 1 : 0) - galActivity) * Math.min(1, dt * 4);
    galUniforms.uActivity.value = galActivity;

    // Le stelle stanno già arrivando mentre `appear` è ancora piccolo, quindi il
    // cancello guarda anche il raduno: altrimenti la polvere in arrivo è invisibile.
    galGroup.visible = (gAppear > 0.001 || gAssemble < 0.999) && gBlow < 0.999 && handoff > 0.002;

    /* ---- cervello ---- */
    if (brainPoints) {
      var appear = brainAppear(progress);
      // Scoppio morbido e graduale: una piccola zona morta tiene il cervello
      // formato per la prima fetta di outro, poi esce con uno smoothstep — niente
      // attacco netto.
      var exit = smoothstep(0.12, 1, outro);

      brainUniforms.iTime.value = t;
      // Piena luminosità per tutto l'avvicinamento; sfuma solo quando la sezione
      // dopo ha davvero cominciato a coprire.
      brainUniforms.iAlpha.value = appear * (1 - smoothstep(0.55, 1, outro));
      // `uExplode` guida sia il raduno d'ingresso (1→0) sia lo scoppio d'uscita (0→1).
      brainUniforms.uExplode.value = Math.max(1 - appear, exit);
      brainGroup.position.z = exit * BRAIN.approach;
      brainUniforms.iResolutionY.value = size.h * dpr;
      brainUniforms.uAspect.value = size.w / Math.max(1, size.h);
      brainUniforms.uCursorRadius.value = clamp((0.1 * 4.6) / camera.position.length(), 0.04, 0.13);

      if (pointerOk && hasPointer) {
        brainUniforms.uMouse.value.x += (ptrX - brainUniforms.uMouse.value.x) * 0.18;
        brainUniforms.uMouse.value.y += (ptrY - brainUniforms.uMouse.value.y) * 0.18;
      }
      var cursorTarget = (pointerOk && hasPointer) ? 1 : 0;
      brainUniforms.uCursor.value += (cursorTarget - brainUniforms.uCursor.value) * 0.1;

      // La rotazione si sovrappone al raduno (comincia a girare mentre si sta
      // ancora formando) e arriva fino allo scoppio, così il movimento si legge
      // come uno solo — niente pausa fra "si forma" e "gira". Più un rollio
      // smorzato verso il cursore.
      var spin = clamp((progress - 2.7) / 1.3, 0, 1) * BRAIN.scrollSpin;
      var cur = brainUniforms.uCursor.value;
      var targetRy = clamp(ptrX, -1, 1) * BRAIN.cursorTilt * cur;
      var targetRx = -clamp(ptrY, -1, 1) * BRAIN.cursorTilt * 0.65 * cur;
      brainParallax.ry += (targetRy - brainParallax.ry) * 0.05;
      brainParallax.rx += (targetRx - brainParallax.rx) * 0.05;
      brainGroup.rotation.y = BRAIN.baseRotationY + spin + brainParallax.ry;
      brainGroup.rotation.x = brainParallax.rx;

      // Fuori dal terzo atto i ~130k punti non si disegnano affatto — ma si
      // continua a disegnarli attraverso lo scoppio, finché la sezione dopo non
      // ha davvero coperto.
      brainGroup.visible = appear > 0.001 && outro < 0.998;
    }

    /* ---- pulviscolo ---- */
    atmoUniforms.uTime.value = t * 8;
    atmoUniforms.uRes.value.set(size.w * dpr, size.h * dpr);
    atmoUniforms.uColor.value.lerpVectors(atmoOrbColor, atmoGalColor, presence);
    atmoUniforms.uAlpha.value = lerp(PAL_ORB.atmoAlpha, PAL_GALAXY.atmoAlpha, presence) * handoff;
    atmoUniforms.uSpread.value = lerp(PAL_ORB.atmoSpread, PAL_GALAXY.atmoSpread, presence);
    atmoUniforms.uFadeNear.value = lerp(PAL_ORB.atmoFadeNear, PAL_GALAXY.atmoFadeNear, presence);
    atmoUniforms.uFadeFar.value = lerp(PAL_ORB.atmoFadeFar, PAL_GALAXY.atmoFadeFar, presence);

    renderer.render(scene, camera);
  }

  function start(){ if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  resize();

  var stPin = ScrollTrigger.create({
    trigger: section, start: 'top top', end: 'bottom bottom',
    pin: pin, pinSpacing: false, anticipatePin: 1,
    onUpdate: function(self){ progressTarget = clockFromScroll(self.progress); }
  });
  /* L'OUTRO sta DOPO il pin, non dentro.
   *
   * Nella sorgente lo scoppio del cervello è mosso dall'arrivo della sezione che
   * chiude: la scena non resta mai vuota in quadro, perché mentre esplode c'è già
   * altro che sale a coprirla. Tenendolo dentro il pin — come nella prima
   * stesura di questo porting — il cervello finiva di sfaldarsi con ancora mezza
   * sezione di scroll davanti, e restava un fotogramma nero con solo la copy
   * sopra: verificato a schermo, non dedotto.
   *
   * Qui la finestra buona è quella dopo `bottom bottom`: il pin si sgancia, il
   * canvas comincia a scorrere via da solo e il capitolo del disco volante sale
   * a prenderne il posto. Un'intera schermata di scroll, che è esattamente il
   * tempo dell'uscita. */
  var stOutro = ScrollTrigger.create({
    trigger: section, start: 'bottom bottom', end: 'bottom top',
    onUpdate: function(self){ outro = self.progress; }
  });
  // L'intro parte prima che la sezione si incastri: i 2,9 s del raduno hanno così
  // il tempo di girare mentre la sfera sta ancora salendo in quadro.
  var stIntro = ScrollTrigger.create({
    trigger: section, start: 'top 70%',
    onEnter: startIntro, onEnterBack: startIntro
  });
  var stLife = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });
  start();

  var onResize = function(){ resize(); };
  window.addEventListener('resize', onResize);

  cleanups.push(function(){
    stop();
    brainAborted = true;
    stPin.kill(); stIntro.kill(); stOutro.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    orbGeo.dispose(); orbMaterial.dispose();
    galSphere.dispose(); galMaterial.dispose();
    if (brainGeo) brainGeo.dispose();
    if (brainMaterial) brainMaterial.dispose();
    atmoGeo.dispose(); atmoPoints.material.dispose();
    backdrop.geometry.dispose(); backdrop.material.dispose();
    heroLine.geometry.dispose(); heroLine.material.dispose();
    renderer.dispose();
  });

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
