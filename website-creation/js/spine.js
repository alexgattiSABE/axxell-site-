/* CAP 03 — colonna di cristallo, ferma, in un ambiente al neon.
 *
 * Composizione dettata dal brief dell'utente (spine 3d.md) e dalle correzioni
 * successive. I punti che NON si possono cambiare senza rompere la richiesta:
 *
 *   · la spina è l'immagine di riferimento (assets/spine.webp), non una
 *     geometria generata: niente modelli anatomici, niente GLB;
 *   · sta FERMA e CENTRATA. Nessuna rotazione, nessuna traslazione, nessuna
 *     scala sullo scroll, nessun galleggiamento;
 *   · è più LUNGA della sezione: cima e fondo restano fuori dal viewport;
 *   · è VETRO: si vede attraverso, e i bordi non devono accendersi come un
 *     neon — il vetro si legge dalla rifrazione, non dal contorno;
 *   · niente sistemi particellari: le bolle sono sfere vere, a gruppi;
 *   · le sei card stanno su UNA sola orbita circolare INCLINATA, fanno UN
 *     giro esatto in tutto lo scroll, e hanno colore uniforme;
 *   · le parole NON sono stampate sulle card: stanno davanti, staccate, e
 *     guardano sempre chi legge.
 *
 * Come è fatto il vetro, visto che una texture su un piano di suo non
 * rifrange niente: la scena viene disegnata due volte. Il primo giro va in un
 * render target SENZA la spina e senza quello che le sta davanti; il secondo
 * giro disegna tutto, e lo shader della spina campiona quel render target
 * spostando le UV in base alla normale ricavata dall'immagine. Da lì
 * rifrazione, aberrazione cromatica e trasmissione colorata.
 *
 * Il fondo (nero + bagliore viola dal basso) è un piano dentro la scena e non
 * un gradiente CSS: quello che sta fuori dal WebGL non è campionabile, e
 * l'interno della colonna uscirebbe nero.
 *
 * La camera non si muove affatto. Il brief concedeva un avvicinamento minimo,
 * ma su un piano fermo avvicinarsi È uno zoom: la colonna cambiava dimensione
 * mentre si scendeva. A raccontare la discesa restano l'anello e la schiuma.
 *
 * Il fluido del cursore resta fuori da questa scena: è un canvas DOM sopra al
 * nostro, in `mix-blend-mode: screen` (js/fluid.js + sections.css).
 */
WC.register('spine', function(ctx){
  var section = document.getElementById('cap03');
  var pin     = document.getElementById('wcSpinePin');
  var canvas  = document.getElementById('wcSpineCanvas');
  var indexEl = document.getElementById('wcSpineIndex');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;

  var CARDS = [
    { word: 'TIPOGRAFIA',  color: '#FF3A63' },
    { word: 'MOTION',      color: '#2E77FF' },
    { word: 'INTERAZIONE', color: '#FF2FCB' },
    { word: 'SCROLL',      color: '#8B3DFF' },
    { word: 'PERFORMANCE', color: '#FF63AF' },
    { word: 'SHADER',      color: '#5A4CFF' }
  ];

  var CONFIG = {
    spineSrc: 'assets/spine.webp',
    spineAspect: 229 / 1200,     // dimensioni reali del ritaglio
    spineOver: 1.42,             // quanto la spina è più alta dell'inquadratura
    spineOverNarrow: 1.18,
    orbitX: 3.10,                // raggi dell'anello
    orbitZ: 2.20,
    orbitTilt: 0.62,             // rad: l'inclinazione È la scala a gradini
    cardW: 1.20,
    cardH: 0.74,
    turns: 1.0,                  // UN giro esatto su tutto lo scroll: la card
                                 // che avevi davanti all'inizio torna davanti
                                 // proprio quando la sezione lascia il posto
    idleSpin: 0.05,              // rad/s senza scroll
    bubbleGroups: 18,            // schiuma: gruppi fitti di bolle minuscole
    bubblesPerGroup: 80,
    camZ: 8.0,                   // fissa: nessun avvicinamento sullo scroll,
    camY: -0.05,                 // che su un piano si leggerebbe come zoom
    rtScale: 0.55                // il render target della rifrazione è a metà
  };

  var reduced = !ctx.motionOk || typeof THREE === 'undefined';
  if (reduced) {
    section.classList.add('-static');
    return;
  }

  // ------------------------------------------------------------- renderer
  var wide   = window.innerWidth;
  var mobile = wide <= 640;
  var maxDpr = wide > 1024 ? 1.75 : 1.5;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, CONFIG.camY, CONFIG.camZ);
  camera.lookAt(0, 0, 0);   // e non si tocca piu': vedi frame()

  var FOV_T = Math.tan((45 * Math.PI / 180) / 2);
  var VIS_H = 2 * FOV_T * CONFIG.camZ;              // 6.63 unità inquadrate

  var uTime   = { value: 0 };
  var uRes    = { value: new THREE.Vector2(1, 1) };
  var uAppear = { value: 0 };

  var VIOLET = G.hexToVec3('#7024FF');
  var BLUE   = G.hexToVec3('#315CFF');
  var PINK   = G.hexToVec3('#FF28D4');

  var rt = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
  });

  // ------------------------------------------------------------- ambiente
  var bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uRes: uRes, uTime: uTime,
      uViolet: { value: VIOLET }, uBlue: { value: BLUE }, uPink: { value: PINK }
    },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec2 uRes; uniform float uTime;',
      'uniform vec3 uViolet; uniform vec3 uBlue; uniform vec3 uPink;',
      'float glow(vec2 p, vec2 c, float r){ float d = length((p - c) / r); return exp(-d * d); }',
      'void main(){',
      '  vec2 p = gl_FragCoord.xy / uRes;',
      '  p.x = (p.x - 0.5) * (uRes.x / uRes.y) + 0.5;',   // cerchi, non ellissi
      '  float breathe = 0.92 + sin(uTime * 0.4) * 0.08;',
      '  vec3 col = vec3(0.0078, 0.0078, 0.0314);',        // #020208
      '  col += uViolet * glow(p, vec2(0.5, -0.06), 0.42) * 0.55 * breathe;',
      '  col += uBlue   * glow(p, vec2(0.06, 0.04), 0.34) * 0.16;',
      '  col += uPink   * glow(p, vec2(0.94, 0.02), 0.32) * 0.14;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'),
    depthWrite: false, depthTest: false
  });
  var bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  bg.position.z = -1;                 // appeso alla camera: copre sempre
  camera.add(bg);
  scene.add(camera);

  var orbit = new THREE.Group();      // card, parole e bolle: si adattano alla
  scene.add(orbit);                   // finestra. La spina no.

  // ---------------------------------------------------------------- card
  // Oggetti fisici, non pannelli: hanno spessore vero e uno smusso sul bordo.
  // La faccia resta uniforme — nessun filo di luce lungo il perimetro — ma lo
  // smusso, che è una superficie a sé con la sua normale, prende la luce e
  // racconta lo spessore. Il colore vive nei riflessi, non nella base: la base
  // è quasi nera, come vetro nero lucido.
  var cardVert = [
    'varying vec3 vN; varying vec3 vV; varying vec3 vLocalN;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vLocalN = normal;',                 // per riconoscere lo smusso: le facce
    '  vV = normalize(-mv.xyz);',          // piatte hanno |z| = 1, il bordo no
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var cardFrag = [
    'uniform vec3 uColor; uniform float uActive; uniform float uFade;',
    'uniform vec3 uViolet; uniform vec3 uBlue; uniform vec3 uPink;',
    'varying vec3 vN; varying vec3 vV; varying vec3 vLocalN;',
    'void main(){',
    '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
    '  float fres = pow(1.0 - abs(dot(N, V)), 3.0);',
    // base: nero lucido appena tinto. Non è un blocco colorato.
    '  vec3 col = vec3(0.014, 0.014, 0.022) + uColor * 0.07;',
    // riflessi dell'ambiente al neon: seguono l'orientamento della card, non
    // sono un gradiente stampato sopra
    '  vec3 R = reflect(-V, N);',
    '  vec3 env = uViolet * smoothstep(0.15, -0.9, R.y) * 0.95',
    '           + uBlue   * smoothstep(0.0, -0.9, R.x) * 0.50',
    '           + uPink   * smoothstep(0.0,  0.9, R.x) * 0.45;',
    '  col += env * (0.18 + fres * 1.7) * (0.60 + 0.40 * uActive);',
    // specular della luce viola che sta sotto la spina, più un colpo bianco
    '  col += uViolet * pow(max(dot(N, normalize(vec3(0.1, -1.0, 0.55))), 0.0), 30.0) * 1.3;',
    '  col += vec3(0.9, 0.92, 1.0) * pow(max(dot(N, normalize(vec3(-0.5, 0.7, 0.6))), 0.0), 48.0) * 0.55;',
    // lo smusso: sulle facce piatte |vLocalN.z| = 1, sul bordo scende
    '  float bevel = 1.0 - abs(vLocalN.z);',
    '  col += mix(uColor, vec3(0.9, 0.92, 1.0), 0.45) * bevel * (0.22 + fres * 0.55);',
    '  gl_FragColor = vec4(col * uFade, 1.0);',
    '}'
  ].join('\n');

  // Le parole stanno DAVANTI alle card, staccate, e guardano sempre la camera:
  // è un piano a sé, non una texture stampata sulla lastra. Da lì l'effetto di
  // rilievo quando la card ruota e la parola no.
  var labelFrag = [
    'uniform sampler2D uText; uniform vec3 uColor; uniform float uActive; uniform float uFade;',
    'varying vec2 vUv;',
    'void main(){',
    '  float txt = texture2D(uText, vUv).a;',
    '  if (txt < 0.02) discard;',
    '  vec3 col = mix(uColor, vec3(1.0), 0.35 + 0.55 * uActive);',
    '  gl_FragColor = vec4(col, txt * (0.30 + 0.70 * uActive) * uFade);',
    '}'
  ].join('\n');
  var labelVert = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  ].join('\n');

  function wordTexture(word){
    var c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    var g2 = c.getContext('2d');
    function draw(){
      g2.clearRect(0, 0, 512, 128);
      g2.font = '500 44px "Space Grotesk", system-ui, sans-serif';
      g2.fillStyle = '#ffffff';
      g2.textBaseline = 'middle';
      var ls = word.length > 9 ? 5 : 8;      // letter-spacing a mano: Safari
      var chars = word.split('');            // ignora ctx.letterSpacing
      var total = 0, i;
      for (i = 0; i < chars.length; i++) total += g2.measureText(chars[i]).width + ls;
      total -= ls;
      var scale = Math.min(1, 460 / total);
      var x = 256 - (total * scale) / 2;
      g2.save();
      g2.translate(x, 64);
      g2.scale(scale, 1);
      var cx = 0;
      for (i = 0; i < chars.length; i++) {
        g2.fillText(chars[i], cx, 2);
        cx += g2.measureText(chars[i]).width + ls;
      }
      g2.restore();
    }
    draw();
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    // Il font arriva dalla rete: alla prima passata può ancora non esserci.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function(){ draw(); tex.needsUpdate = true; });
    }
    return tex;
  }

  var cardW = CONFIG.cardW * (mobile ? 0.85 : 1);
  var cardH = CONFIG.cardH * (mobile ? 0.85 : 1);

  // Rettangolo ad angoli tondi estruso: spessore vero e smusso sul giro.
  // THREE.Shape ed ExtrudeGeometry stanno nel core di r128 — RoundedBoxGeometry
  // no, sta negli examples, che qui non sono caricati.
  function roundedRect(w, h, r){
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);  s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);  s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);      s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  var cardGeo = new THREE.ExtrudeGeometry(roundedRect(cardW, cardH, 0.085), {
    depth: 0.045, curveSegments: 6,
    bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2
  });
  cardGeo.center();

  var labelW   = cardW * 0.86;
  var labelGeo = new THREE.PlaneGeometry(labelW, labelW / 4, 1, 1);

  var cards = CARDS.map(function(def, i){
    var col = G.hexToVec3(def.color);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:  { value: col },
        uActive: { value: 0 },
        uFade:   { value: 0 },
        uViolet: { value: VIOLET },
        uBlue:   { value: BLUE },
        uPink:   { value: PINK }
      },
      vertexShader: cardVert, fragmentShader: cardFrag,
      side: THREE.FrontSide,
      // Del tutto opache: ora sono solidi chiusi, quindi entrano nella passata
      // opaca e la profondità la gestisce il depth buffer da solo. È così che
      // la spina le occlude e loro occludono la spina, senza trucchi CSS.
      transparent: false, depthWrite: true, depthTest: true
    });
    var mesh = new THREE.Mesh(cardGeo, mat);
    mesh.renderOrder = 0;
    orbit.add(mesh);

    var tex = wordTexture(def.word);
    var lmat = new THREE.ShaderMaterial({
      uniforms: {
        uText:   { value: tex },
        uColor:  { value: col },
        uActive: { value: 0 },
        uFade:   { value: 0 }
      },
      vertexShader: labelVert, fragmentShader: labelFrag,
      transparent: true, depthWrite: false, depthTest: true
    });
    var label = new THREE.Mesh(labelGeo, lmat);
    label.renderOrder = 3;
    orbit.add(label);

    return { mesh: mesh, mat: mat, label: label, lmat: lmat, tex: tex, def: def,
             phase: (i / CARDS.length) * Math.PI * 2 };
  });

  // --------------------------------------------------------------- bolle
  // Sfere vere, non sprite. Sono tante, quindi InstancedMesh: 1400 mesh
  // separate volevano dire 2800 draw call al frame, contando che la scena si
  // disegna due volte.
  //
  // Ma le istanze sono DUE, non una: la schiuma minuscola sta bene con una
  // sfera a 6x4 segmenti, mentre a 0.10 unita' quella stessa sfera si vede che
  // e' un esagono. Le grandi hanno una geometria loro, piu' fitta, e sono
  // poche — il costo sta tutto nelle piccole.
  var BUBBLE_TINTS = ['#8A3FFC', '#C43CFF', '#FF4BCB', '#3C8DFF', '#6B5CFF',
                      '#FF2BD6', '#A64DFF', '#157BFF'];
  var GROUPS = mobile ? 9 : CONFIG.bubbleGroups;
  var PER    = mobile ? 40 : CONFIG.bubblesPerGroup;

  var foamData = [], bigData = [], foamTint = [], bigTint = [];
  var c3 = new THREE.Vector3();

  for (var gi = 0; gi < GROUPS; gi++) {
    // ogni gruppo nasce da un punto suo nella zona sotto la spina
    var gx = -0.8 + Math.random() * 1.6;
    var gz = -0.5 + Math.random() * 1.0;
    var gLife = Math.random();
    var gTint = BUBBLE_TINTS[gi % BUBBLE_TINTS.length];
    for (var k = 0; k < PER; k++) {
      c3.copy(G.hexToVec3(Math.random() < 0.25
        ? BUBBLE_TINTS[(Math.random() * BUBBLE_TINTS.length) | 0]   // qualche
        : gTint));                                                  // intrusa
      // Tre tagli: schiuma fitta, qualche bolla media, poche grandi che si
      // leggono una per una. Le grandi salgono piu' lente — sono quelle che
      // fanno capire che le altre sono schiuma e non rumore.
      var roll = Math.random(), size, speed;
      if (roll < 0.07)      { size = 0.060 + Math.random() * 0.085; speed = 0.10 + Math.random() * 0.09; }
      else if (roll < 0.28) { size = 0.020 + Math.random() * 0.028; speed = 0.16 + Math.random() * 0.16; }
      else                  { size = 0.005 + Math.random() * 0.012; speed = 0.20 + Math.random() * 0.24; }
      var b = {
        gx: gx, gz: gz,
        ox: (Math.random() - 0.5) * 0.22,      // il gruppo parte fitto
        oz: (Math.random() - 0.5) * 0.22,
        life: (gLife + (Math.random() - 0.5) * 0.10 + 1) % 1,
        speed: speed,
        // Asimmetrica di proposito: la deriva e' centrata su 0.42, non su 0.5,
        // quindi a destra ne finiscono di piu'. Una distribuzione simmetrica si
        // legge subito come generata.
        drift: (Math.random() - 0.42) * 2.6,
        curve: 0.12 + Math.random() * 0.40,
        phase: Math.random() * Math.PI * 2,
        size: size,
        base: 0.55 + Math.random() * 0.45
      };
      if (size >= 0.020) { b.slot = bigData.length;  bigData.push(b);  bigTint.push(c3.x, c3.y, c3.z); }
      else               { b.slot = foamData.length; foamData.push(b); foamTint.push(c3.x, c3.y, c3.z); }
    }
  }

  var bubbleMat = new THREE.ShaderMaterial({
    uniforms: { uScene: { value: rt.texture }, uRes: uRes, uAppear: uAppear },
    vertexShader: [
      'attribute vec3 aTint; attribute float aAlpha;',
      'varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying float vA;',
      'void main(){',
      '  vec4 mp = instanceMatrix * vec4(position, 1.0);',
      '  vec4 mv = modelViewMatrix * mp;',
      '  vN = normalize(normalMatrix * (mat3(instanceMatrix) * normal));',
      '  vV = normalize(-mv.xyz);',
      '  vTint = aTint; vA = aAlpha;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uScene; uniform vec2 uRes; uniform float uAppear;',
      'varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying float vA;',
      'void main(){',
      '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);',
      // il centro lascia passare la scena, il bordo la raccoglie: e' quel
      // contrasto a farle leggere come bolle e non come palline colorate
      '  vec2 suv = gl_FragCoord.xy / uRes;',
      '  vec3 refr = texture2D(uScene, suv + N.xy * 0.012).rgb;',
      '  vec3 col = refr * 1.05 + vTint * fres * 1.5 + vec3(0.35, 0.36, 0.5) * fres * 0.45;',
      '  vec3 L = normalize(vec3(-0.4, 0.8, 0.6));',
      '  col += vec3(0.9, 0.92, 1.0) * pow(max(dot(N, L), 0.0), 22.0) * 0.85;',
      '  gl_FragColor = vec4(col, clamp(fres * 1.15 + 0.08, 0.0, 1.0) * vA * uAppear);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, depthTest: true
  });

  function makeSwarm(list, tints, segW, segH){
    var n = Math.max(1, list.length);
    var geo = new THREE.SphereGeometry(1, segW, segH);
    var alpha = new Float32Array(n);
    geo.setAttribute('aTint',  new THREE.InstancedBufferAttribute(new Float32Array(tints), 3));
    var attr = new THREE.InstancedBufferAttribute(alpha, 1);
    geo.setAttribute('aAlpha', attr);
    var mesh = new THREE.InstancedMesh(geo, bubbleMat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    orbit.add(mesh);
    return { mesh: mesh, geo: geo, alpha: alpha, attr: attr, data: list };
  }
  var foam = makeSwarm(foamData, foamTint, 6, 4);
  var big  = makeSwarm(bigData,  bigTint, mobile ? 12 : 18, mobile ? 8 : 12);
  var swarms = [foam, big];
  var _bm = new THREE.Matrix4();

  // --------------------------------------------------------------- spina
  var spineGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  var spineMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap:      { value: null },
      uScene:    { value: rt.texture },
      uRes:      uRes,
      uTime:     uTime,
      uAppear:   uAppear,
      uTexel:    { value: new THREE.Vector2(1 / 229, 1 / 1200) },
      uViolet:   { value: VIOLET },
      uBlue:     { value: BLUE },
      uPink:     { value: PINK },
      uTransmit: { value: G.hexToVec3('#CBB6FF') }   // vetro bianco-lilla
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap; uniform sampler2D uScene; uniform vec2 uRes;',
      'uniform float uTime; uniform float uAppear; uniform vec2 uTexel;',
      'uniform vec3 uViolet; uniform vec3 uBlue; uniform vec3 uPink; uniform vec3 uTransmit;',
      'varying vec2 vUv;',
      'void main(){',
      // Micro-movimento delle UV: il vetro respira. Qui c'era il simplex noise
      // di WC.glsl e costava venti fps buoni; due seni fanno lo stesso.
      '  vec2 uv = vUv;',
      '  uv.x += sin(uv.y * 21.0 + uTime * 0.5) * 0.0014;',
      '  uv.y += sin(uv.x * 17.0 + uTime * 0.4) * 0.0010;',
      '  vec4 tex = texture2D(uMap, uv);',
      '  if (tex.a < 0.02) discard;',            // niente rettangolo nero
      '  float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));',
      // Normale finta dal gradiente della silhouette: guida la rifrazione.
      '  float axm = texture2D(uMap, uv - vec2(uTexel.x * 2.0, 0.0)).a;',
      '  float axp = texture2D(uMap, uv + vec2(uTexel.x * 2.0, 0.0)).a;',
      '  float aym = texture2D(uMap, uv - vec2(0.0, uTexel.y * 2.0)).a;',
      '  float ayp = texture2D(uMap, uv + vec2(0.0, uTexel.y * 2.0)).a;',
      '  vec2 grad = vec2(axp - axm, ayp - aym);',
      '  float edge = clamp(length(grad) * 1.9, 0.0, 1.0);',
      '  vec3 N = normalize(vec3(-grad * 3.0, 0.55));',
      // Rifrazione con i tre canali sfalsati: aberrazione cromatica.
      '  vec2 suv = gl_FragCoord.xy / uRes;',
      '  vec2 off = N.xy * (0.055 + lum * 0.05);',
      '  vec3 refr;',
      '  refr.r = texture2D(uScene, suv + off * 1.10).r;',
      '  refr.g = texture2D(uScene, suv + off).g;',
      '  refr.b = texture2D(uScene, suv + off * 0.90).b;',
      '  vec3 col = refr * mix(vec3(1.0), uTransmit, 0.45) * 1.38;',
      // I riflessi sono quelli dell'immagine di riferimento, che è cromo.
      '  col += tex.rgb * (0.22 + pow(lum, 1.7) * 0.80);',
      // Il contorno accende POCO: il vetro si legge dalla rifrazione, non da
      // un filo di neon. Prima era 1.15 + 0.35 e sembrava un tubo al neon.
      '  float side = 0.5 + 0.5 * sin(vUv.y * 9.0 + uTime * 0.3);',
      '  col += mix(uBlue, uPink, side) * edge * 0.22;',
      '  col += uTransmit * edge * 0.10;',
      // la luce viola sta SOTTO: sale attraverso la struttura e si spegne
      '  float fromBelow = smoothstep(0.42, 0.0, vUv.y);',
      '  col += uViolet * fromBelow * (0.30 + lum * 0.95);',
      // L'interno resta trasparente: la scena rifratta ci passa attraverso.
      '  float alpha = clamp(tex.a * (0.22 + edge * 0.40 + lum * 0.60), 0.0, 1.0);',
      '  gl_FragColor = vec4(col, alpha * uAppear);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true, depthTest: true, side: THREE.FrontSide
  });

  var spine = new THREE.Mesh(spineGeo, spineMat);
  spine.visible = false;                 // finché la texture non c'è
  spine.position.set(0, 0, 0);           // centrata, e ci resta
  spine.rotation.set(0, 0, 0);           // ferma, e ci resta
  spine.renderOrder = 1;
  scene.add(spine);

  var spineTex = null, texState = 'idle';

  function sizeSpine(){
    var over = window.innerWidth <= 900 ? CONFIG.spineOverNarrow : CONFIG.spineOver;
    var h = VIS_H * over;
    spine.scale.set(h * CONFIG.spineAspect, h, 1);
  }

  function loadSpine(){
    if (texState !== 'idle') return;
    texState = 'loading';
    new THREE.TextureLoader().load(CONFIG.spineSrc, function(tex){
      // NPOT: senza queste quattro righe WebGL1 restituisce nero.
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      spineTex = tex;
      spineMat.uniforms.uMap.value = tex;
      spine.visible = true;
      texState = 'ready';
    }, undefined, function(){
      texState = 'failed';
      console.error('[WC] spine texture non caricata: ' + CONFIG.spineSrc);
      section.classList.remove('-live');
      section.classList.add('-static');
      stop();
    });
  }

  // Il fluido del cursore NON entra in questa scena: vive nel suo canvas DOM
  // sopra al nostro, in mix-blend-mode screen (js/fluid.js + sections.css).
  // C'e' stata una versione che lo rileggeva come texture e lo spartiva su due
  // piani, uno dietro e uno davanti alla colonna: funzionava, ma l'utente ha
  // chiesto di tornare alla scia semplice sopra a tutto. Se serve rimetterla,
  // sta nel commit 94f8f31 — e ricordarsi `preserveDrawingBuffer` sul
  // contesto del fluido, senza il quale il frame riletto e' nero un giro su due.

  // -------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, orbitPhase = 0, appear = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();
  var activeCard = -1;
  var _toCam = new THREE.Vector3();

  function orbitScale(){
    var w = window.innerWidth;
    return w > 1200 ? 1 : w > 900 ? 0.9 : w > 640 ? 0.78 : 0.64;
  }

  function resize(){
    var r = pin.getBoundingClientRect();
    rect.w = Math.max(1, r.width); rect.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.w, rect.h, false);
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();
    uRes.value.set(rect.w * dpr, rect.h * dpr);
    rt.setSize(Math.max(2, Math.round(rect.w * dpr * CONFIG.rtScale)),
               Math.max(2, Math.round(rect.h * dpr * CONFIG.rtScale)));
    sizeSpine();
    orbit.scale.setScalar(orbitScale());
    // Su viewport strette la copy sta sopra la scena: l'anello scende per
    // andarle sotto. La spina no — quella resta dov'è, centrata.
    orbit.position.y = window.innerWidth <= 900 ? -0.7 : 0;
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = now / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    appear = Math.min(1, appear + dt / 1.4);
    uTime.value = t;
    uAppear.value = appear;

    // La camera NON si muove. Il brief permetteva un avvicinamento minimo
    // (z 8 -> 7), ma su un piano fermo l'avvicinamento È uno zoom: la spina
    // cambiava dimensione mentre si scendeva, ed è esattamente quello che non
    // deve fare. A raccontare la discesa restano l'anello e le bolle.
    layoutCards(t, dt);
    stepBubbles(dt);

    // Passata 1: la scena senza la spina e senza quello che le sta davanti.
    // È quello che il vetro rifrange.
    spine.visible = false;
    var i;
    for (i = 0; i < cards.length; i++) {
      var front = cards[i].mesh.position.z >= 0;
      cards[i].mesh.visible = !front;
      cards[i].label.visible = !front;
    }
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Passata 2: tutto, con la spina che campiona il render target.
    if (texState === 'ready') spine.visible = true;
    for (i = 0; i < cards.length; i++) {
      cards[i].mesh.visible = true;
      cards[i].label.visible = true;
    }
    renderer.render(scene, camera);
  }

  // UNA sola orbita circolare inclinata, UN solo giro su tutto lo scroll.
  var TILT_S = Math.sin(CONFIG.orbitTilt), TILT_C = Math.cos(CONFIG.orbitTilt);

  function layoutCards(t, dt){
    orbitPhase += dt * CONFIG.idleSpin;
    var base = orbitPhase + scroll * Math.PI * 2 * CONFIG.turns;
    var best = 0, bestDepth = -2;

    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var a = base + c.phase;
      var ca = Math.cos(a), sa = Math.sin(a);
      // anello nel piano XZ, poi inclinato attorno all'asse Z: la quota
      // dipende dalla x, quindi il fronte (sa = 1) resta a x = 0, y = 0.
      var rx = ca * CONFIG.orbitX;
      c.mesh.position.set(rx * TILT_C, rx * TILT_S, sa * CONFIG.orbitZ);
      // La normale del piano è (sin y, 0, cos y) e la radiale è (cos a, 0,
      // sin a): perché coincidano l'imbardata è PI/2 - a, non a.
      c.mesh.rotation.set(0, Math.PI / 2 - a, CONFIG.orbitTilt * ca * 0.35);

      var depth = (sa + 1) * 0.5;                       // 1 = davanti
      var smooth = depth * depth * (3 - 2 * depth);
      var sc = 0.62 + smooth * 0.38;
      c.mesh.scale.set(sc, sc, 1);
      c.mat.uniforms.uActive.value = smooth;
      c.mat.uniforms.uFade.value = (0.28 + smooth * 0.72) * appear;

      // La parola sta davanti alla card, verso la camera, e guarda sempre
      // dritto: è lei a non ruotare mentre la lastra gira.
      // 0.72 non è un numero a caso: quando la lastra è di taglio si estende
      // in profondità fino a mezza larghezza (0.6), e con uno scarto più corto
      // la lastra bucava la parola — si vedevano le lettere tagliate a metà.
      _toCam.copy(camera.position).sub(c.mesh.position).normalize();
      c.label.position.copy(c.mesh.position).addScaledVector(_toCam, 0.72);
      c.label.quaternion.copy(camera.quaternion);
      c.label.scale.setScalar(sc);
      c.lmat.uniforms.uActive.value = smooth;
      c.lmat.uniforms.uFade.value = (0.22 + smooth * 0.78) * appear;

      if (depth > bestDepth) { bestDepth = depth; best = i; }
    }

    if (best !== activeCard) {
      activeCard = best;
      if (indexEl) indexEl.textContent = ('0' + (best + 1)) + ' / 06';
    }
  }

  // I gruppi salgono compatti e in fretta, e si allargano mentre salgono.
  function stepBubbles(dt){
    for (var w = 0; w < swarms.length; w++) {
      var sw = swarms[w], list = sw.data;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        b.life += dt * b.speed;
        if (b.life > 1) b.life -= 1;
        // Nascono strette sotto la spina e si aprono salendo, fino a coprire
        // circa tre quarti della sezione: e' il brief a chiederlo, e senza
        // l'apertura la schiuma restava una colonna incollata al centro.
        var spread = 0.45 + b.life * 2.6;
        var x = (b.gx + b.ox) * spread + Math.sin(b.life * 7.0 + b.phase) * b.curve
                + b.drift * b.life;
        var y = -3.1 + b.life * 6.4;
        var z = (b.gz + b.oz) * spread + Math.cos(b.life * 5.2 + b.phase) * b.curve * 0.6;
        _bm.makeScale(b.size, b.size, b.size);
        _bm.setPosition(x, y, z);
        sw.mesh.setMatrixAt(i, _bm);
        sw.alpha[i] = b.base * Math.min(1, b.life / 0.10) * Math.min(1, (1 - b.life) / 0.16);
      }
      sw.mesh.instanceMatrix.needsUpdate = true;
      sw.attr.needsUpdate = true;
    }
  }

  function start(){
    if (running || document.hidden || texState === 'failed') return;
    loadSpine();                       // la texture arriva alla prima entrata
    running = true;                    // nella sezione, non al load della pagina
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  section.classList.add('-live');
  resize();
  if (indexEl) indexEl.textContent = '01 / 06';

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

  return function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    cards.forEach(function(c){ c.mat.dispose(); c.lmat.dispose(); c.tex.dispose(); });
    cardGeo.dispose(); labelGeo.dispose();
    swarms.forEach(function(sw){ sw.geo.dispose(); });
    bubbleMat.dispose();
    spineGeo.dispose(); spineMat.dispose();
    bg.geometry.dispose(); bgMat.dispose();
    if (spineTex) spineTex.dispose();
    rt.dispose();
    renderer.dispose();
    section.classList.remove('-live');
  };
});
