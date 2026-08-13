/* CAP 03 — colonna di vetro sospesa in un fluido invisibile.
 *
 * La spina NON è più procedurale: è l'immagine di riferimento data
 * dall'utente (assets/spine.webp), montata come piano trasparente dentro la
 * scena three.js. Ed è FERMA: rotazione zero sui tre assi, nessuna rotazione
 * idle, nessuna rotazione sullo scroll, nessuna scala sullo scroll. È l'ancora
 * visiva del capitolo; a muoversi è tutto il resto.
 *
 * Come si tiene insieme:
 *
 * 1. SPINA — un piano con la texture già ritagliata (l'alone viola
 *    dell'immagine sorgente è stato tolto in fase di asset sottraendo una
 *    stima low-frequency dello sfondo: qui non arriva nessun rettangolo nero).
 *    Il fragment scarta i pixel ad alpha ~0, quindi il piano non ha bordi e
 *    SCRIVE PROFONDITÀ: è così che bolle e lastre passano davvero dietro alla
 *    spina invece di limitarsi a sembrarlo.
 *    L'illusione di volume su un piano fermo la fanno quattro cose, tutte
 *    nello shader: distorsione UV lentissima (rifrazione), bordo acceso
 *    ricavato dal gradiente dell'alpha (il Fresnel su un piano non esiste, la
 *    silhouette sì), una banda di luce che scende, e un bagliore a quattro tap
 *    (bloom finto, senza composer).
 * 2. CARD — 6 lastre in orbita ellittica vera: la profondità la decide la z,
 *    non una scala finta. Passano davanti e dietro alla spina.
 * 3. BOLLE — Points animati interamente nel vertex shader: la CPU non tocca
 *    mai il buffer. Alcune salgono davanti al piano della spina, altre dietro.
 *
 * Niente luci nella scena: non c'è più niente di PBR da illuminare. Il colore
 * sta nella texture, nello shader e nei gradienti CSS sotto al canvas.
 */
WC.register('spine', function(ctx){
  var section = document.getElementById('cap03');
  var pin     = document.getElementById('wcSpinePin');
  var canvas  = document.getElementById('wcSpineCanvas');
  var indexEl = document.getElementById('wcSpineIndex');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;

  var CARDS = [
    { word: 'TIPOGRAFIA',  color: '#FF315C', y:  1.60 },
    { word: 'MOTION',      color: '#246BFF', y:  0.40 },
    { word: 'INTERAZIONE', color: '#FF27C8', y: -1.00 },
    { word: 'SCROLL',      color: '#8B3DFF', y:  1.00 },
    { word: 'PERFORMANCE', color: '#FF5DAA', y: -0.30 },
    { word: 'SHADER',      color: '#5145FF', y: -1.60 }
  ];

  var CONFIG = {
    spineSrc: 'assets/spine.webp',
    spineAspect: 229 / 1200,   // dimensioni reali del ritaglio
    spineH: 4.95,              // ~74% dell'altezza inquadrata a z = 8
    orbitX: 3.40,
    orbitZ: 2.90,
    cardW: 1.62,
    cardH: 0.98,
    // La lastra frontale scivola di lato mentre si accende: se restasse
    // centrata coprirebbe la colonna, che deve rimanere il punto focale.
    frontShift: 0.85,
    turns: 1.75,               // giri d'orbita sull'intero scroll
    idleSpin: 0.045,           // rad/s dell'orbita senza scroll
    bubbles: 280,
    camZ: 8.0,   camZEnd: 6.8, // la camera si muove pochissimo, e mai in modo
    camY: -0.15, camYEnd: 0.20,// da far sembrare che la spina ruoti
    camX: 0,     camXEnd: 0.15
  };

  var reduced = !ctx.motionOk || typeof THREE === 'undefined';
  if (reduced) {
    // Nessun WebGL: restano la copy e l'elenco delle sei voci, che nel markup
    // c'è già. La sezione smette di essere alta 520svh (vedi CSS -static).
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
  camera.position.set(CONFIG.camX, CONFIG.camY, CONFIG.camZ);

  var uTime = { value: 0 };

  var rig = new THREE.Group();
  scene.add(rig);

  // --------------------------------------------------------------- spina
  var spineGeo = new THREE.PlaneGeometry(CONFIG.spineH * CONFIG.spineAspect, CONFIG.spineH, 1, 1);
  var spineMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap:    { value: null },
      uTime:   uTime,
      uAppear: { value: 0 },
      uTexel:  { value: new THREE.Vector2(1 / 229, 1 / 1200) },
      uViolet: { value: G.hexToVec3('#7A20FF') },
      uBlue:   { value: G.hexToVec3('#146BFF') },
      uPink:   { value: G.hexToVec3('#FF2BD6') }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap; uniform float uTime; uniform float uAppear;',
      'uniform vec2 uTexel; uniform vec3 uViolet; uniform vec3 uBlue; uniform vec3 uPink;',
      'varying vec2 vUv;',
      'void main(){',
      // 1. rifrazione: due onde sfasate, ampiezza sotto il mezzo pixel di
      //    texture. Deve leggersi come vetro che respira.
      //    Qui c'era il simplex noise di WC.glsl: due chiamate per fragment,
      //    su un piano che copre mezzo schermo, costavano ~20 fps. Due seni
      //    fanno la stessa cosa a questa ampiezza e costano niente.
      '  vec2 uv = vUv;',
      '  uv.x += sin(uv.y * 21.0 + uTime * 0.55) * 0.0016 + sin(uv.y * 6.5 - uTime * 0.31) * 0.0013;',
      '  uv.y += sin(uv.x * 17.0 + uTime * 0.42) * 0.0011;',
      '  vec4 tex = texture2D(uMap, uv);',
      '  if (tex.a < 0.012) discard;',   // niente rettangolo, e la profondità
                                         // la scrivono solo i pixel pieni
      '  vec3 col = tex.rgb;',
      '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
      // 2. grading verso la palette del capitolo, senza sbiancare il cromo
      '  col = mix(col, uViolet * (0.6 + lum * 1.5), 0.10);',
      // 3. banda di luce che scende: gli highlight si spostano anche se la
      //    spina è ferma, ed è metà dell'illusione di volume
      '  float travel = fract(uv.y * 0.6 - uTime * 0.035);',
      '  float band = smoothstep(0.22, 0.0, abs(travel - 0.5));',
      '  col += mix(uBlue, uPink, uv.y) * band * lum * 0.55;',
      // 4. Fresnel finto: il bordo della silhouette è dove l'alpha cambia
      //    in fretta, e lì la luce si attacca come sul vetro
      '  float ax = texture2D(uMap, uv + vec2(uTexel.x, 0.0)).a - texture2D(uMap, uv - vec2(uTexel.x, 0.0)).a;',
      '  float ay = texture2D(uMap, uv + vec2(0.0, uTexel.y)).a - texture2D(uMap, uv - vec2(0.0, uTexel.y)).a;',
      '  float edge = clamp(length(vec2(ax, ay)) * 2.2, 0.0, 1.0);',
      '  float edgeMix = 0.5 + 0.5 * sin(uv.y * 7.0 + uTime * 0.35);',
      '  col += mix(uBlue, uPink, edgeMix) * edge * 0.55;',
      // 5. bloom finto a due tap in diagonale: allarga la luce di qualche
      //    pixel senza montare un EffectComposer (su questa pagina girano
      //    altri contesti WebGL). Due tap invece di quattro: la differenza
      //    non si vede, il costo per fragment sì.
      '  float g = texture2D(uMap, uv + vec2(0.009, 0.006)).a',
      '          + texture2D(uMap, uv - vec2(0.009, 0.006)).a;',
      '  g *= 0.5;',
      '  col += uViolet * g * 0.22;',
      '  float alpha = clamp(tex.a + g * 0.16, 0.0, 1.0) * uAppear;',
      '  gl_FragColor = vec4(col, alpha);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true, depthTest: true, side: THREE.FrontSide
  });

  var spine = new THREE.Mesh(spineGeo, spineMat);
  spine.visible = false;                 // finché la texture non c'è
  spine.rotation.set(0, 0, 0);           // e resta così: è il vincolo del brief
  spine.renderOrder = 1;
  rig.add(spine);

  var spineTex = null, texState = 'idle';

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
      // Senza la spina la sezione non ha più un centro: meglio la versione
      // statica, che almeno dice le stesse sei cose.
      texState = 'failed';
      console.error('[WC] spine texture non caricata: ' + CONFIG.spineSrc);
      section.classList.remove('-live');
      section.classList.add('-static');
      stop();
    });
  }

  // --------------------------------------------------------------- card
  function wordTexture(word){
    var c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    var g2 = c.getContext('2d');
    function draw(){
      g2.clearRect(0, 0, 512, 128);
      g2.font = '500 46px "Space Grotesk", system-ui, sans-serif';
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
    // Il font arriva dalla rete: alla prima passata può ancora non esserci e
    // il testo uscirebbe con il fallback di sistema.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function(){ draw(); tex.needsUpdate = true; });
    }
    return tex;
  }

  var cardW = CONFIG.cardW * (mobile ? 0.82 : 1);
  var cardH = CONFIG.cardH * (mobile ? 0.82 : 1);
  var bandW = cardW * 0.76;                     // banda su cui vive il testo
  var bandH = bandW / 4;                        // la texture è 4:1
  var cardGeo = new THREE.PlaneGeometry(cardW, cardH, 1, 1);

  var cardVert = [
    'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vUv = uv;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var cardFrag = [
    'uniform vec3 uColor; uniform sampler2D uText; uniform vec2 uTextScale;',
    'uniform vec2 uSize; uniform float uActive; uniform float uFade; uniform float uTime;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
    'float sdBox(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }',
    'void main(){',
    // La lastra è a doppia faccia: vista da dietro il testo uscirebbe
    // speculare. Si ribalta la u, non si nasconde la faccia — le lastre
    // dietro alla colonna devono restare visibili.
    '  vec2 uvf = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
    '  vec2 p = (uvf - 0.5) * uSize;',
    '  float r = 0.11;',
    '  float d = sdBox(p, uSize * 0.5, r);',
    '  float mask = smoothstep(0.006, -0.006, d);',
    '  if (mask <= 0.001) discard;',
    // vetro colorato: mai tinta piena
    '  vec3 col = uColor * (0.50 + 0.30 * uActive);',
    '  float alpha = mask * (0.18 + 0.12 * uActive);',
    // bordo luminoso appena dentro il taglio
    '  float border = smoothstep(0.030, 0.0, abs(d + 0.012));',
    '  col += uColor * border * 1.0;',
    '  alpha += border * mask * (0.34 + 0.26 * uActive);',
    // inner glow verso i bordi
    '  float inner = smoothstep(-0.34, -0.02, d) * mask;',
    '  col += uColor * inner * 0.35;',
    '  alpha += inner * 0.10;',
    // riflesso diagonale, alto-sinistra -> basso-destra
    '  float diag = uvf.x * 0.75 + (1.0 - uvf.y) * 0.25;',
    '  float hi = smoothstep(0.30, 0.0, abs(diag - (0.52 + 0.08 * sin(uTime * 0.25))));',
    '  col += vec3(0.72, 0.76, 1.0) * hi * mask * 0.13;',
    '  alpha += hi * mask * 0.09;',
    // Fresnel sul taglio: la lastra di profilo si accende
    '  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);',
    '  col += mix(uColor, vec3(0.85, 0.80, 1.0), 0.4) * fres * mask * 0.6;',
    '  alpha += fres * mask * 0.22;',
    // testo
    '  vec2 tuv = (uvf - 0.5) * uTextScale + 0.5;',
    '  float txt = 0.0;',
    '  if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) txt = texture2D(uText, tuv).a;',
    '  col += vec3(0.96, 0.94, 1.0) * txt * (0.40 + 0.60 * uActive);',
    '  alpha += txt * (0.30 + 0.70 * uActive);',
    '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uFade);',
    '}'
  ].join('\n');

  var cards = CARDS.map(function(def, i){
    var tex = wordTexture(def.word);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:     { value: G.hexToVec3(def.color) },
        uText:      { value: tex },
        uTextScale: { value: new THREE.Vector2(cardW / bandW, cardH / bandH) },
        uSize:      { value: new THREE.Vector2(cardW, cardH) },
        uActive:    { value: 0 },
        uFade:      { value: 0 },
        uTime:      uTime
      },
      vertexShader: cardVert, fragmentShader: cardFrag,
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(cardGeo, mat);
    mesh.renderOrder = 2;
    rig.add(mesh);
    return { mesh: mesh, mat: mat, tex: tex, def: def,
             phase: (i / CARDS.length) * Math.PI * 2, wobble: i * 1.37 };
  });

  // -------------------------------------------------------------- bolle
  // Salgono da sotto la spina come in un fluido che non si vede. Tutto il
  // moto è nel vertex shader: nessun buffer riscritto a runtime. Nascono su
  // tutto il cerchio, quindi metà passano davanti al piano della spina e metà
  // dietro: con la spina ferma, la profondità la raccontano loro.
  function makeBubbles(count){
    var pos = new Float32Array(count * 3),
        seed = new Float32Array(count * 3),
        size = new Float32Array(count),
        col  = new Float32Array(count * 3);

    // Il gradiente cromatico non è uniforme: in basso domina viola/fucsia,
    // in alto blu. Il colore è fisso per particella, la fascia la decide la
    // quota di partenza.
    var LOW  = ['#C43CFF', '#F12BFF', '#A64DFF', '#FF4BCB', '#8A3FFC'];
    var MID  = ['#8A3FFC', '#6B5CFF', '#A64DFF', '#3C8DFF'];
    var HIGH = ['#3C8DFF', '#157BFF', '#6B5CFF'];
    var c = new THREE.Vector3();

    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var rad = 0.35 + Math.pow(Math.random(), 0.65) * 2.5;
      pos[i*3]   = Math.cos(a) * rad;
      pos[i*3+1] = 0;
      pos[i*3+2] = Math.sin(a) * rad * 0.9;

      var life = Math.random();
      seed[i*3]   = life;                               // fase nel ciclo
      seed[i*3+1] = 0.055 + Math.random() * 0.115;      // velocità di salita
      seed[i*3+2] = 0.10 + Math.random() * 0.42;        // deriva laterale

      size[i] = Math.random() < 0.12
        ? 0.085 + Math.random() * 0.04
        : 0.016 + Math.random() * 0.042;

      var pool = life < 0.4 ? LOW : life < 0.75 ? MID : HIGH;
      c.copy(G.hexToVec3(pool[(Math.random() * pool.length) | 0]));
      col[i*3] = c.x; col[i*3+1] = c.y; col[i*3+2] = c.z;
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed',    new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aSize',    new THREE.BufferAttribute(size, 1));
    g.setAttribute('aColor',   new THREE.BufferAttribute(col, 3));

    var mat = new THREE.ShaderMaterial({
      uniforms: { uTime: uTime, uAppear: { value: 0 }, uPx: { value: 800 } },
      vertexShader: [
        'attribute vec3 aSeed; attribute float aSize; attribute vec3 aColor;',
        'uniform float uTime; uniform float uPx;',
        'varying vec3 vColor; varying float vAlpha; varying float vCore;',
        'void main(){',
        '  float life = fract(aSeed.x + uTime * aSeed.y);',
        '  vec3 p = position;',
        '  p.y = -3.0 + life * 6.1;',
        '  p.x += sin(uTime * (0.30 + aSeed.y * 2.0) + aSeed.x * 24.0) * aSeed.z;',
        '  p.z += cos(uTime * (0.24 + aSeed.y * 1.6) + aSeed.x * 17.0) * aSeed.z * 0.7;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
        '  vColor = aColor;',
        '  vCore = step(0.07, aSize);',                 // le grandi hanno il cuore bianco
        '  vAlpha = smoothstep(0.0, 0.10, life) * smoothstep(1.0, 0.78, life);',
        '  gl_PointSize = max(aSize * uPx / -mv.z, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uAppear;',
        'varying vec3 vColor; varying float vAlpha; varying float vCore;',
        'void main(){',
        '  vec2 q = gl_PointCoord - 0.5;',
        '  float l = length(q);',
        '  if (l > 0.5) discard;',
        '  float ring = smoothstep(0.5, 0.34, l);',
        '  float core = smoothstep(0.26, 0.0, l);',
        '  vec3 col = mix(vColor, vec3(1.0), core * (0.35 + vCore * 0.45));',
        '  float a = (ring * 0.55 + core * 0.75) * vAlpha * uAppear;',
        '  gl_FragColor = vec4(col * (0.9 + core * 0.6), a);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    var pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    return { points: pts, geo: g, mat: mat };
  }

  var bubbles = makeBubbles(mobile ? 130 : (wide > 1024 ? CONFIG.bubbles : 190));
  rig.add(bubbles.points);

  // -------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, orbitPhase = 0, appear = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();
  var activeCard = -1;

  // La spina sta a destra e la copy a sinistra. Su viewport strette la copy le
  // sta sopra, quindi la scena torna al centro.
  function rigOffset(){ return window.innerWidth > 900 ? 1.45 : 0; }
  function orbitScale(){
    var w = window.innerWidth;
    return w > 1200 ? 1 : w > 900 ? 0.88 : w > 640 ? 0.78 : 0.62;
  }

  function resize(){
    var r = pin.getBoundingClientRect();
    rect.w = Math.max(1, r.width); rect.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.w, rect.h, false);
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();
    rig.position.x = rigOffset();
    bubbles.mat.uniforms.uPx.value = rect.h * 0.9;
    // Adattamento alla finestra, non allo scroll: la spina non cambia mai
    // scala mentre si scende.
    // Su viewport strette la copy non sta più di fianco alla scena ma sopra,
    // e col velo verticale copriva mezza colonna. La scena scende e rimpicci-
    // olisce per andarle sotto: la spina resta intera e leggibile.
    var narrow = window.innerWidth <= 900;
    var fit = Math.min(1, rect.h / 760);
    rig.position.y = narrow ? -0.85 : 0;
    rig.scale.setScalar((0.86 + fit * 0.14) * (narrow ? 0.78 : 1));
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = now / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    appear = Math.min(1, appear + dt / 1.4);

    uTime.value = t;
    spineMat.uniforms.uAppear.value = appear;
    bubbles.mat.uniforms.uAppear.value = appear;

    // Camera: si muove pochissimo e su una retta. Nessuna orbita, nessuna
    // parallasse col mouse — su un piano fermo si leggerebbe come una
    // rotazione della spina, che il brief vieta.
    camera.position.set(
      CONFIG.camX + scroll * (CONFIG.camXEnd - CONFIG.camX),
      CONFIG.camY + scroll * (CONFIG.camYEnd - CONFIG.camY),
      CONFIG.camZ + scroll * (CONFIG.camZEnd - CONFIG.camZ)
    );
    camera.lookAt(rig.position.x, 0, 0);

    layoutCards(t, dt);
    renderer.render(scene, camera);
  }

  // Orbita vera: la profondità è la z, non una scala finta. La lastra frontale
  // è quella con cos(angolo) massimo — cresce, si accende, diventa leggibile.
  function layoutCards(t, dt){
    orbitPhase += dt * CONFIG.idleSpin;
    var base = orbitPhase + scroll * Math.PI * 2 * CONFIG.turns;
    var os = orbitScale();
    var best = 0, bestDepth = -2;

    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var a = base + c.phase;
      var ca = Math.cos(a), sa = Math.sin(a);
      var depth = (ca + 1) * 0.5;                       // 1 = davanti
      var smooth = depth * depth * (3 - 2 * depth);

      c.mesh.position.set(
        sa * CONFIG.orbitX * os + smooth * CONFIG.frontShift * os,
        c.def.y * os + Math.sin(t * 0.42 + c.wobble) * 0.26,
        ca * CONFIG.orbitZ * os
      );
      c.mesh.rotation.set(Math.sin(t * 0.3 + c.wobble) * 0.06, a, Math.cos(t * 0.26 + c.wobble) * 0.04);

      var sc = 0.64 + smooth * 0.30;
      c.mesh.scale.set(sc, sc, 1);
      c.mat.uniforms.uActive.value = smooth;
      c.mat.uniforms.uFade.value = (0.22 + smooth * 0.78) * appear;

      if (depth > bestDepth) { bestDepth = depth; best = i; }
    }

    if (best !== activeCard) {
      activeCard = best;
      if (indexEl) indexEl.textContent = ('0' + (best + 1)) + ' / 06';
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

  // Due trigger separati, come nelle altre sezioni WebGL: uno pinna e misura,
  // l'altro monta e smonta il loop. Fuori schermo il canvas non disegna.
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
    cards.forEach(function(c){ c.mat.dispose(); c.tex.dispose(); });
    cardGeo.dispose(); spineGeo.dispose(); spineMat.dispose();
    if (spineTex) spineTex.dispose();
    bubbles.geo.dispose(); bubbles.mat.dispose();
    renderer.dispose();
    section.classList.remove('-live');
  };
});
