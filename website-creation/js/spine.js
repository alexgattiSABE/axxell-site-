/* CAP 03 — colonna di vetro sospesa in un fluido invisibile.
 *
 * Sostituisce la doppia elica. Tre sistemi in una scena sola:
 *
 * 1. SPINA — 24 vertebre procedurali (corpo a lathe, arco, processi laterali e
 *    spinoso), fuse in UNA sola geometria. La fusione è a mano: r128 tiene
 *    BufferGeometryUtils negli examples, che qui non sono caricati, e senza
 *    merge sarebbero ~120 draw call per strato. Due strati sovrapposti fanno
 *    il vetro: dentro un MeshPhysicalMaterial che raccoglie i riflessi delle
 *    luci colorate, fuori un guscio Fresnel additivo che accende solo i bordi.
 *    Niente `transmission`: in r128 il render target della trasmissione non
 *    c'è, e su questa pagina girano già altri tre contesti WebGL.
 * 2. CARD — 6 lastre in orbita ellittica vera (non un carosello CSS): la
 *    profondità la decide la posizione z, non una scala finta. Ogni lastra è
 *    un piano con shader proprio: angoli arrotondati per SDF, bordo luminoso,
 *    riflesso diagonale, Fresnel sul taglio e il testo da CanvasTexture.
 * 3. BOLLE — Points animati interamente nel vertex shader (posizione da tempo
 *    e seme): la CPU non tocca mai il buffer.
 *
 * Lo scroll pinna la sezione e guida orbita, camera, torsione delle vertebre e
 * quale lastra arriva davanti. Senza scroll la scena resta viva lo stesso.
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
    vertebrae: 24,
    orbitX: 3.40,
    orbitZ: 2.90,
    cardW: 1.62,
    cardH: 0.98,
    // La lastra frontale scivola di lato mentre si accende: se restasse
    // centrata coprirebbe la colonna, che deve rimanere il punto focale.
    frontShift: 0.85,
    turns: 1.75,          // giri d'orbita sull'intero scroll
    idleSpin: 0.045,      // rad/s dell'orbita senza scroll
    spineSpin: 0.075,
    scrollSpin: 0.85,
    bubbles: 280,
    camZ: 8.0,
    camZEnd: 6.8,
    parallax: 0.34
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
  camera.position.set(0, 0, CONFIG.camZ);

  // Uniform condivisi da spina interna e guscio: un oggetto solo, aggiornato
  // una volta per frame.
  var uTime   = { value: 0 };
  var uScroll = { value: 0 };

  var rig = new THREE.Group();
  scene.add(rig);

  // --------------------------------------------------------------- spina
  // Torsione delle vertebre: la stessa funzione nei due materiali, iniettata
  // nel MeshPhysicalMaterial con onBeforeCompile e concatenata a mano nel
  // guscio. Vive nel vertex shader perché è per-vertebra, non per-oggetto.
  var WOBBLE = [
    'attribute float aSeg;',
    'uniform float uTime; uniform float uScroll;',
    'vec3 wcWobble(vec3 p, float s){',
    '  float ang = sin(uTime * 0.55 + s * 5.5) * 0.05 + uScroll * (s - 0.5) * 0.42;',
    '  float c = cos(ang), n = sin(ang);',
    '  p.xz = mat2(c, -n, n, c) * p.xz;',
    '  p.x += sin(uTime * 0.40 + s * 4.0) * 0.05;',
    '  p.z += cos(uTime * 0.33 + s * 3.2) * 0.04;',
    '  return p;',
    '}'
  ].join('\n');

  // Le vertebre non sono una pila di primitive uguali: cervicali piccole in
  // alto, lombari larghe in basso, ognuna ruotata di suo.
  function buildVertebraParts(){
    var parts = [];
    var N = CONFIG.vertebrae;
    var q = new THREE.Matrix4();   // scratch: makeX() muta e ritorna sé stessa,
                                   // e la multiply avviene subito dopo

    // profilo a clessidra del corpo vertebrale: i fianchi rientrano
    var profile = [
      new THREE.Vector2(0.001, -0.185),
      new THREE.Vector2(0.300, -0.180),
      new THREE.Vector2(0.232, -0.115),
      new THREE.Vector2(0.198,  0.000),
      new THREE.Vector2(0.232,  0.115),
      new THREE.Vector2(0.300,  0.180),
      new THREE.Vector2(0.001,  0.186)
    ];
    var body  = new THREE.LatheGeometry(profile, mobile ? 14 : 20).toNonIndexed();
    var arch  = new THREE.TorusGeometry(0.20, 0.040, 6, mobile ? 12 : 18, Math.PI * 1.25).toNonIndexed();
    var spike = new THREE.ConeGeometry(0.062, 0.26, 6).toNonIndexed();
    var wing  = new THREE.ConeGeometry(0.050, 0.26, 5).toNonIndexed();

    // L'altezza totale è un vincolo, non un risultato: 24 vertebre a passo
    // libero fanno una colonna lunga il doppio del viewport e si vedono solo
    // le dieci centrali. Il passo si ricava dalla scala della vertebra, così
    // le cervicali stanno strette e le lombari respirano, ma il totale resta
    // intorno alle 5.3 unità — cioè ~70% dell'altezza inquadrata.
    var y = 2.62;
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);                       // 0 = cervicale, 1 = lombare
      var s = 0.42 + t * t * 0.42;               // le lombari crescono più in fretta
      var step = 0.115 + 0.185 * s;
      var tilt = Math.sin(t * Math.PI * 1.6) * 0.10;   // curva sagittale
      var seg = t;
      var spin = (i * 0.37) % (Math.PI * 2);

      var base = new THREE.Matrix4()
        .makeTranslation(Math.sin(t * Math.PI) * 0.10, y, tilt * 0.9)
        .multiply(q.makeRotationY(spin * 0.55 + Math.sin(i * 2.3) * 0.12))
        .multiply(q.makeRotationX(tilt * 0.35))
        .multiply(q.makeScale(s, s, s));

      parts.push({ geo: body, seg: seg, mat: base.clone() });

      parts.push({ geo: arch, seg: seg, mat: base.clone()
        .multiply(q.makeTranslation(0, 0, -0.30))
        .multiply(q.makeRotationX(Math.PI / 2)) });

      parts.push({ geo: spike, seg: seg, mat: base.clone()
        .multiply(q.makeTranslation(0, -0.05, -0.46))
        .multiply(q.makeRotationX(-Math.PI / 2 - 0.45)) });

      parts.push({ geo: wing, seg: seg, mat: base.clone()
        .multiply(q.makeTranslation(-0.34, 0, -0.16))
        .multiply(q.makeRotationZ(Math.PI / 2 + 0.35)) });

      parts.push({ geo: wing, seg: seg, mat: base.clone()
        .multiply(q.makeTranslation(0.34, 0, -0.16))
        .multiply(q.makeRotationZ(-Math.PI / 2 - 0.35)) });

      y -= step;
    }

    var merged = mergeParts(parts);
    body.dispose(); arch.dispose(); spike.dispose(); wing.dispose();
    return merged;
  }

  // Fusione a mano di geometrie NON indicizzate: posizione trasformata dalla
  // matrice, normale dalla sua normal matrix, più l'indice di vertebra.
  function mergeParts(parts){
    var total = 0, i, j;
    for (i = 0; i < parts.length; i++) total += parts[i].geo.attributes.position.count;

    var pos = new Float32Array(total * 3),
        nor = new Float32Array(total * 3),
        seg = new Float32Array(total);
    var v = new THREE.Vector3(), nm = new THREE.Matrix3(), off = 0;

    for (i = 0; i < parts.length; i++) {
      var g = parts[i].geo, mat = parts[i].mat;
      var gp = g.attributes.position.array, gn = g.attributes.normal.array;
      var n = g.attributes.position.count;
      nm.getNormalMatrix(mat);
      for (j = 0; j < n; j++) {
        v.set(gp[j*3], gp[j*3+1], gp[j*3+2]).applyMatrix4(mat);
        pos[(off+j)*3] = v.x; pos[(off+j)*3+1] = v.y; pos[(off+j)*3+2] = v.z;
        v.set(gn[j*3], gn[j*3+1], gn[j*3+2]).applyMatrix3(nm).normalize();
        nor[(off+j)*3] = v.x; nor[(off+j)*3+1] = v.y; nor[(off+j)*3+2] = v.z;
        seg[off+j] = parts[i].seg;
      }
      off += n;
    }

    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
    out.setAttribute('aSeg',     new THREE.BufferAttribute(seg, 1));
    return out;
  }

  var spineGeo = buildVertebraParts();

  // Colore quasi neutro e scuro apposta: il bianco pieno mangia le luci
  // colorate e la colonna esce grigia. Così a tingerla sono viola, blu e
  // fucsia, che è il punto.
  var glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7d92cc, roughness: 0.10, metalness: 0.18, clearcoat: 1.0,
    clearcoatRoughness: 0.08, transparent: true, opacity: 0.42,
    side: THREE.DoubleSide, depthWrite: true
  });
  glassMat.onBeforeCompile = function(shader){
    shader.uniforms.uTime = uTime;
    shader.uniforms.uScroll = uScroll;
    shader.vertexShader = WOBBLE + '\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed = wcWobble(transformed, aSeg);'
    );
  };

  // Guscio Fresnel: il centro resta trasparente, i bordi catturano viola,
  // blu e fucsia. È additivo, quindi non scrive profondità.
  var shellMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uTime, uScroll: uScroll,
      uEdgeA: { value: G.hexToVec3('#B99CFF') },
      uEdgeB: { value: G.hexToVec3('#7A8CFF') },
      uEdgeC: { value: G.hexToVec3('#F0C6FF') },
      uAppear: { value: 0 }
    },
    vertexShader: [
      WOBBLE,
      'varying vec3 vN; varying vec3 vV; varying float vY;',
      'void main(){',
      '  vec3 p = wcWobble(position, aSeg);',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  vN = normalize(normalMatrix * normal);',
      '  vV = normalize(-mv.xyz);',
      '  vY = aSeg;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uEdgeA; uniform vec3 uEdgeB; uniform vec3 uEdgeC;',
      'uniform float uAppear; uniform float uTime;',
      'varying vec3 vN; varying vec3 vV; varying float vY;',
      'void main(){',
      '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);',
      '  vec3 col = mix(uEdgeB, uEdgeA, smoothstep(0.0, 0.6, vY));',
      '  col = mix(col, uEdgeC, smoothstep(0.55, 1.0, vY) * 0.7);',
      '  float breathe = 0.86 + sin(uTime * 0.5) * 0.14;',
      '  gl_FragColor = vec4(col * f * 1.05 * breathe, f * 0.95 * uAppear);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });

  var spineGroup = new THREE.Group();
  var glassMesh = new THREE.Mesh(spineGeo, glassMat);
  var shellMesh = new THREE.Mesh(spineGeo, shellMat);
  shellMesh.scale.setScalar(1.015);
  glassMesh.renderOrder = 0;
  shellMesh.renderOrder = 1;
  spineGroup.add(glassMesh);
  spineGroup.add(shellMesh);
  rig.add(spineGroup);

  // --------------------------------------------------------------- luci
  var lightPurple = new THREE.PointLight(0x7a20ff, 24, 11);
  lightPurple.position.set(0, -2.7, 1.5);
  var lightBlue = new THREE.PointLight(0x245bff, 14, 10);
  lightBlue.position.set(-3.3, 0.7, 2.3);
  var lightPink = new THREE.PointLight(0xff2bd6, 14, 10);
  lightPink.position.set(3.3, -0.5, 2.1);
  var lightRim = new THREE.PointLight(0xbbd7ff, 3.5, 13);
  lightRim.position.set(0, 2.3, -3.5);
  var ambient = new THREE.AmbientLight(0x0e0e20, 0.35);
  rig.add(lightPurple, lightBlue, lightPink, lightRim, ambient);

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
  // moto è nel vertex shader: nessun buffer riscritto a runtime.
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
      pos[i*3+2] = Math.sin(a) * rad * 0.8;

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

  var pointer = G.makePointer();

  // -------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, orbitPhase = 0, spinPhase = 0, appear = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();
  var activeCard = -1;
  var _v = new THREE.Vector3();

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
    // La spina deve restare ~70% dell'altezza anche quando la finestra è bassa
    // e larga: lì il campo verticale è quello che stringe.
    var fit = Math.min(1, rect.h / 760);
    rig.scale.setScalar(0.86 + fit * 0.14);
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = now / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    appear = Math.min(1, appear + dt / 1.4);

    uTime.value = t;
    uScroll.value = scroll;
    shellMat.uniforms.uAppear.value = appear;
    bubbles.mat.uniforms.uAppear.value = appear;

    // camera: quasi ferma, un filo di parallasse e un avvicinamento sullo scroll
    pointer.step(camera, dt, rig.position.x, 0, 0);
    camera.position.set(
      pointer.ndc.x * CONFIG.parallax,
      pointer.ndc.y * CONFIG.parallax * 0.6 - 0.3 + scroll * 0.6,
      CONFIG.camZ - scroll * (CONFIG.camZ - CONFIG.camZEnd)
    );
    camera.lookAt(rig.position.x, scroll * 0.25, 0);

    // spina: rotazione lentissima, oscillazione appena percettibile
    spinPhase += dt * (CONFIG.spineSpin + scroll * CONFIG.scrollSpin * 0.25);
    spineGroup.rotation.y = spinPhase;
    spineGroup.rotation.z = Math.sin(t * 0.22) * 0.035;

    // luci che respirano
    lightPurple.intensity = 24 + Math.sin(t * 0.5) * 2.8;
    lightBlue.intensity   = 14 + Math.sin(t * 0.37 + 1.2) * 1.8;
    lightPink.intensity   = 14 + Math.sin(t * 0.41 + 2.4) * 1.8;

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

  function start(){ if (running || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
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
    pointer.dispose();
    cards.forEach(function(c){ c.mat.dispose(); c.tex.dispose(); });
    cardGeo.dispose(); spineGeo.dispose();
    glassMat.dispose(); shellMat.dispose();
    bubbles.geo.dispose(); bubbles.mat.dispose();
    renderer.dispose();
    section.classList.remove('-live');
  };
});
