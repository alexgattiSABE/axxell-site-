/* CAP 03 — colonna di cristallo, ferma, in un ambiente al neon.
 *
 * Composizione dettata dal brief dell'utente (spine 3d.md, secondo giro), che
 * è vincolante nei dettagli. I punti che NON si possono cambiare senza
 * rompere la richiesta:
 *
 *   · la spina è l'immagine di riferimento (assets/spine.webp), non una
 *     geometria generata: niente modelli anatomici, niente GLB;
 *   · sta FERMA e CENTRATA. Nessuna rotazione, nessuna traslazione, nessuna
 *     scala sullo scroll, nessun galleggiamento;
 *   · è più LUNGA della sezione: cima e fondo restano fuori dal viewport, così
 *     sembra continuare oltre la pagina. Ma non scorre — a scorrere è tutto il
 *     resto;
 *   · è VETRO: si vede attraverso. Non un PNG bianco appiccicato;
 *   · niente sistemi particellari. Le bolle sono sfere vere;
 *   · le sei card stanno su UNA sola orbita circolare INCLINATA. La scala a
 *     gradini viene dall'inclinazione dell'anello, non da offset verticali
 *     messi a mano;
 *   · le card sono scure, opache e riflettenti. Il contrario della spina.
 *
 * Come è fatto il vetro, visto che una texture su un piano di suo non
 * rifrange niente: la scena viene disegnata due volte. Il primo giro va in un
 * render target SENZA la spina e senza le card che le stanno davanti; il
 * secondo giro disegna tutto, e lo shader della spina campiona quel render
 * target spostando le UV in base alla normale ricavata dall'immagine. È da lì
 * che vengono rifrazione, aberrazione cromatica e trasmissione colorata: cosa
 * c'è dietro si vede davvero attraverso il vetro, non per finta.
 *
 * Il fondo (nero + bagliore viola dal basso) è un piano dentro la scena e non
 * più solo un gradiente CSS: se restasse fuori dal WebGL, la rifrazione non
 * avrebbe niente da rifrangere e l'interno della spina uscirebbe nero.
 */
WC.register('spine', function(ctx){
  var section = document.getElementById('cap03');
  var pin     = document.getElementById('wcSpinePin');
  var canvas  = document.getElementById('wcSpineCanvas');
  var indexEl = document.getElementById('wcSpineIndex');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;

  // I sei accenti restano quelli del brief: rosso/rosa, blu elettrico,
  // fucsia, viola, rosa, blu-viola. Qui sono solo accenti — la card è scura.
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
    orbitX: 3.10,                // raggi dell'anello (brief: X 2.8-3.4, Z 1.8-2.5)
    orbitZ: 2.20,
    orbitTilt: 0.62,             // rad: l'inclinazione È la scala a gradini
    cardW: 1.20,                 // -26% rispetto al giro precedente
    cardH: 0.74,
    turns: 1.6,                  // giri d'orbita sull'intero scroll
    idleSpin: 0.05,              // rad/s senza scroll
    bubbles: 34,                 // sfere vere, non un campo di puntini
    camZ: 8.0, camZEnd: 7.0,
    camY: -0.10, camYEnd: 0.15,
    rtScale: 0.55                // il render target della rifrazione è a metà
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
  camera.position.set(0, CONFIG.camY, CONFIG.camZ);

  var VIS_H = 2 * Math.tan((45 * Math.PI / 180) / 2) * CONFIG.camZ;  // 6.63 unità

  var uTime = { value: 0 };
  var uRes  = { value: new THREE.Vector2(1, 1) };

  var VIOLET = G.hexToVec3('#7024FF');
  var BLUE   = G.hexToVec3('#315CFF');
  var PINK   = G.hexToVec3('#FF28D4');

  // Il render target della rifrazione. Mezza risoluzione: quello che ci passa
  // attraverso è sfocato dal vetro comunque.
  var rt = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
  });

  // ------------------------------------------------------------- ambiente
  // Il fondo sta DENTRO la scena, non solo in CSS: la rifrazione deve avere
  // qualcosa da rifrangere. Nero quasi pieno, il viola concentrato in basso al
  // centro, blu a sinistra e fucsia a destra appena accennati.
  var bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uRes: uRes, uTime: uTime,
      uViolet: { value: VIOLET }, uBlue: { value: BLUE }, uPink: { value: PINK }
    },
    vertexShader: [
      'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
    ].join('\n'),
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
  // Il piano vive appeso alla camera: così copre sempre l'inquadratura, a
  // qualunque aspect, e il gradiente lo decide comunque gl_FragCoord.
  bg.material.depthTest = false;
  bg.position.z = -1;
  camera.add(bg);
  scene.add(camera);

  // ---------------------------------------------------------------- card
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
    // Il font arriva dalla rete: alla prima passata può ancora non esserci e
    // il testo uscirebbe con il fallback di sistema.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function(){ draw(); tex.needsUpdate = true; });
    }
    return tex;
  }

  var cardW = CONFIG.cardW * (mobile ? 0.85 : 1);
  var cardH = CONFIG.cardH * (mobile ? 0.85 : 1);
  var bandW = cardW * 0.74;                     // banda su cui vive il testo
  var bandH = bandW / 4;                        // la texture è 4:1
  var cardGeo = new THREE.PlaneGeometry(cardW, cardH, 1, 1);

  // Le card sono l'opposto della spina: base scura e opaca, e tutto quello
  // che si vede sono riflessi. Niente trasparenza — attraverso non si guarda.
  var cardFrag = [
    'uniform vec3 uColor; uniform sampler2D uText; uniform vec2 uTextScale;',
    'uniform vec2 uSize; uniform float uActive; uniform float uFade; uniform float uTime;',
    'uniform vec3 uViolet; uniform vec3 uBlue; uniform vec3 uPink;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
    'float sdBox(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }',
    'void main(){',
    // La lastra è a doppia faccia: vista da dietro il testo uscirebbe
    // speculare. Si ribalta la u invece di nascondere la faccia.
    '  vec2 uvf = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
    '  vec2 p = (uvf - 0.5) * uSize;',
    '  float d = sdBox(p, uSize * 0.5, 0.085);',
    '  if (d > 0.0) discard;',                  // angoli tondi, niente alone
    '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
    '  float fres = pow(1.0 - abs(dot(N, V)), 3.0);',
    // base scura: acrilico nero lucido
    '  vec3 col = vec3(0.020, 0.020, 0.032) + uColor * 0.045;',
    // ambiente al neon riflesso: viola dal basso, blu a sinistra, fucsia a
    // destra. Il vettore riflesso decide quale prende.
    '  vec3 R = reflect(-V, N);',
    '  vec3 env = uViolet * smoothstep(0.1, -0.9, R.y) * 0.85',
    '           + uBlue   * smoothstep(0.0, -0.9, R.x) * 0.45',
    '           + uPink   * smoothstep(0.0,  0.9, R.x) * 0.40;',
    '  col += env * (0.25 + fres * 1.5) * (0.55 + 0.45 * uActive);',
    // specular stretta della luce viola sotto la spina
    '  vec3 Lb = normalize(vec3(0.1, -1.0, 0.55));',
    '  col += uViolet * pow(max(dot(N, Lb), 0.0), 26.0) * 1.1;',
    // filo di luce sul taglio: è il bordo della lastra, non un neon
    '  float rim = smoothstep(0.020, 0.0, abs(d + 0.010));',
    '  col += mix(uColor, vec3(0.85, 0.86, 1.0), 0.35) * rim * (0.55 + 0.65 * uActive);',
    // riflesso diagonale che scorre
    '  float diag = uvf.x * 0.75 + (1.0 - uvf.y) * 0.25;',
    '  float hi = smoothstep(0.26, 0.0, abs(diag - (0.5 + 0.1 * sin(uTime * 0.22))));',
    '  col += vec3(0.55, 0.58, 0.85) * hi * 0.10;',
    // testo: acceso solo quando la card è quella davanti
    '  vec2 tuv = (uvf - 0.5) * uTextScale + 0.5;',
    '  float txt = 0.0;',
    '  if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) txt = texture2D(uText, tuv).a;',
    '  col = mix(col, mix(uColor, vec3(1.0), 0.55 + 0.35 * uActive), txt * (0.35 + 0.65 * uActive));',
    '  gl_FragColor = vec4(col * uFade, 1.0);',
    '}'
  ].join('\n');

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

  var orbit = new THREE.Group();     // card + bolle: questo gruppo si adatta
  scene.add(orbit);                  // alla finestra, la spina no

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
        uTime:      uTime,
        uViolet:    { value: VIOLET },
        uBlue:      { value: BLUE },
        uPink:      { value: PINK }
      },
      vertexShader: cardVert, fragmentShader: cardFrag,
      side: THREE.DoubleSide,
      // Opache e con depth write: è così che la spina può occluderle e loro
      // possono occludere la spina, senza trucchi CSS. `transparent` serve
      // solo a farle disegnare dopo il fondo, non a bucarle.
      transparent: true, depthWrite: true, depthTest: true
    });
    var mesh = new THREE.Mesh(cardGeo, mat);
    mesh.renderOrder = 0;
    orbit.add(mesh);
    return { mesh: mesh, mat: mat, tex: tex, def: def,
             phase: (i / CARDS.length) * Math.PI * 2 };
  });

  // --------------------------------------------------------------- bolle
  // Sfere vere, non point sprite: centro trasparente che lascia passare la
  // scena rifratta, bordo acceso di Fresnel, riflesso stretto. Poche e
  // distanziate — il brief chiede aria, non un campo di puntini.
  var bubbleGeo = new THREE.SphereGeometry(1, mobile ? 10 : 14, mobile ? 8 : 10);
  var bubbleFrag = [
    'uniform sampler2D uScene; uniform vec2 uRes; uniform vec3 uTint;',
    'uniform float uAppear; uniform float uAlpha;',
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);',
    // quello che sta dietro alla bolla, spostato dalla curvatura: rifrazione
    '  vec2 suv = gl_FragCoord.xy / uRes;',
    '  vec2 off = N.xy * 0.035;',
    '  vec3 refr = texture2D(uScene, suv + off).rgb;',
    '  vec3 col = refr * 1.05 + uTint * fres * 1.6;',
    // riflesso stretto dell\'ambiente in alto a sinistra
    '  vec3 L = normalize(vec3(-0.4, 0.8, 0.6));',
    '  col += vec3(0.9, 0.92, 1.0) * pow(max(dot(N, L), 0.0), 22.0) * 0.9;',
    '  float alpha = clamp(fres * 1.15 + 0.10, 0.0, 1.0) * uAlpha * uAppear;',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');
  var bubbleVert = [
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BUBBLE_TINTS = ['#8A3FFC', '#C43CFF', '#FF4BCB', '#3C8DFF', '#6B5CFF', '#FF2BD6'];
  var uAppear = { value: 0 };

  function makeBubbles(count){
    var list = [];
    for (var i = 0; i < count; i++) {
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uScene:  { value: rt.texture },
          uRes:    uRes,
          uTint:   { value: G.hexToVec3(BUBBLE_TINTS[i % BUBBLE_TINTS.length]) },
          uAppear: uAppear,
          uAlpha:  { value: 0.55 + Math.random() * 0.45 }
        },
        vertexShader: bubbleVert, fragmentShader: bubbleFrag,
        transparent: true, depthWrite: false, depthTest: true
      });
      var mesh = new THREE.Mesh(bubbleGeo, mat);
      mesh.renderOrder = 2;
      var r = Math.random();
      mesh.scale.setScalar(r < 0.15 ? 0.10 + Math.random() * 0.05
                                    : 0.028 + Math.random() * 0.05);
      orbit.add(mesh);
      list.push({
        mesh: mesh, mat: mat,
        // zona di emissione del brief: x -0.8..0.8, y -3.2..-2.7, z -0.5..0.5
        x0: -0.8 + Math.random() * 1.6,
        z0: -0.5 + Math.random() * 1.0,
        life: Math.random(),
        speed: 0.045 + Math.random() * 0.075,
        drift: (Math.random() - 0.5) * 0.9,
        curve: 0.15 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2
      });
    }
    return list;
  }
  var bubbles = makeBubbles(mobile ? 18 : CONFIG.bubbles);

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
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap; uniform sampler2D uScene; uniform vec2 uRes;',
      'uniform float uTime; uniform float uAppear; uniform vec2 uTexel;',
      'uniform vec3 uViolet; uniform vec3 uBlue; uniform vec3 uPink; uniform vec3 uTransmit;',
      'varying vec2 vUv;',
      'void main(){',
      // Micro-movimento delle UV: il vetro respira. Ampiezza sotto il mezzo
      // pixel di texture — qui c\'era il simplex noise di WC.glsl e costava
      // venti fps buoni, due seni fanno lo stesso.
      '  vec2 uv = vUv;',
      '  uv.x += sin(uv.y * 21.0 + uTime * 0.5) * 0.0014;',
      '  uv.y += sin(uv.x * 17.0 + uTime * 0.4) * 0.0010;',
      '  vec4 tex = texture2D(uMap, uv);',
      '  if (tex.a < 0.02) discard;',            // niente rettangolo nero
      '  float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));',
      // Normale finta: il gradiente della silhouette dice da che parte è
      // girata la superficie del vetro. Guida rifrazione e riflessi.
      '  float axm = texture2D(uMap, uv - vec2(uTexel.x * 2.0, 0.0)).a;',
      '  float axp = texture2D(uMap, uv + vec2(uTexel.x * 2.0, 0.0)).a;',
      '  float aym = texture2D(uMap, uv - vec2(0.0, uTexel.y * 2.0)).a;',
      '  float ayp = texture2D(uMap, uv + vec2(0.0, uTexel.y * 2.0)).a;',
      '  vec2 grad = vec2(axp - axm, ayp - aym);',
      '  float edge = clamp(length(grad) * 1.9, 0.0, 1.0);',
      '  vec3 N = normalize(vec3(-grad * 3.0, 0.55));',
      // RIFRAZIONE: si campiona la scena dietro, con i tre canali sfalsati.
      // È l\'aberrazione cromatica del brief, e costa due texture fetch in più.
      '  vec2 suv = gl_FragCoord.xy / uRes;',
      '  vec2 off = N.xy * (0.055 + lum * 0.05);',
      '  vec3 refr;',
      '  refr.r = texture2D(uScene, suv + off * 1.10).r;',
      '  refr.g = texture2D(uScene, suv + off).g;',
      '  refr.b = texture2D(uScene, suv + off * 0.90).b;',
      // trasmissione colorata: il vetro tinge quello che ci passa attraverso
      '  vec3 col = refr * mix(vec3(1.0), uTransmit, 0.45) * 1.15;',
      // RIFLESSI: sono già nell\'immagine di riferimento, che è cromo
      // iridescente. Si tengono, pesati sulla luminanza, non si sostituiscono.
      '  col += tex.rgb * (0.32 + pow(lum, 1.6) * 1.35);',
      // Fresnel sul bordo della silhouette: è lì che il vetro spesso accende
      '  float side = 0.5 + 0.5 * sin(vUv.y * 9.0 + uTime * 0.3);',
      '  col += mix(uBlue, uPink, side) * edge * 1.15;',
      '  col += uTransmit * edge * 0.35;',
      // la luce viola sta SOTTO: sale attraverso la struttura e si spegne
      '  float fromBelow = smoothstep(0.42, 0.0, vUv.y);',
      '  col += uViolet * fromBelow * (0.35 + lum * 1.1);',
      // L\'interno resta trasparente: l\'alpha piena la prendono bordi e
      // riflessi, il centro lascia passare la scena rifratta.
      '  float alpha = clamp(tex.a * (0.30 + edge * 0.85 + lum * 0.85), 0.0, 1.0);',
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
    // Più alta dell'inquadratura, di proposito: cima e fondo devono restare
    // fuori dal viewport. Non è un ritaglio — è il piano a essere più lungo.
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
      // Senza la spina la sezione non ha più un centro: meglio la versione
      // statica, che almeno dice le stesse sei cose.
      texState = 'failed';
      console.error('[WC] spine texture non caricata: ' + CONFIG.spineSrc);
      section.classList.remove('-live');
      section.classList.add('-static');
      stop();
    });
  }

  // -------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, orbitPhase = 0, appear = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();
  var activeCard = -1;

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

    // Camera quasi frontale: solo avvicinamento e un filo di quota. Nessuna
    // orbita — girarle intorno cambierebbe l'orientamento apparente della
    // spina, che il brief vieta.
    camera.position.set(
      0,
      CONFIG.camY + scroll * (CONFIG.camYEnd - CONFIG.camY),
      CONFIG.camZ + scroll * (CONFIG.camZEnd - CONFIG.camZ)
    );
    camera.lookAt(0, 0, 0);

    layoutCards(t, dt);
    stepBubbles(dt);

    // Passata 1: la scena senza la spina e senza le card che le stanno
    // davanti, dentro il render target. È quello che il vetro rifrange.
    spine.visible = false;
    var i;
    for (i = 0; i < cards.length; i++) cards[i].mesh.visible = cards[i].mesh.position.z < 0;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Passata 2: tutto, con la spina che campiona il render target.
    if (texState === 'ready') spine.visible = true;
    for (i = 0; i < cards.length; i++) cards[i].mesh.visible = true;
    renderer.render(scene, camera);
  }

  // UNA sola orbita circolare inclinata. Le quote diverse delle card non sono
  // messe a mano: escono dall'inclinazione dell'anello, che è il punto.
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
      // La card guarda in fuori dall'anello. La normale del piano è
      // (sin y, 0, cos y) e la direzione radiale è (cos a, 0, sin a): perché
      // coincidano l'imbardata è PI/2 - a, non a. Con a + PI/2 la card frontale
      // dava le spalle alla camera e si leggeva il testo speculare.
      c.mesh.rotation.set(0, Math.PI / 2 - a, CONFIG.orbitTilt * ca * 0.35);

      var depth = (sa + 1) * 0.5;                       // 1 = davanti
      var smooth = depth * depth * (3 - 2 * depth);
      var sc = 0.62 + smooth * 0.38;                    // brief: 0.55-0.8 dietro, 1 davanti
      c.mesh.scale.set(sc, sc, 1);
      c.mat.uniforms.uActive.value = smooth;
      c.mat.uniforms.uFade.value = (0.28 + smooth * 0.72) * appear;

      if (depth > bestDepth) { bestDepth = depth; best = i; }
    }

    if (best !== activeCard) {
      activeCard = best;
      if (indexEl) indexEl.textContent = ('0' + (best + 1)) + ' / 06';
    }
  }

  // Salgono dalla zona sotto la spina e si disperdono. Poche, distanziate,
  // con traiettorie diverse: verticali, in deriva, curve.
  function stepBubbles(dt){
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.life += dt * b.speed;
      if (b.life > 1) b.life -= 1;
      var y = -3.0 + b.life * 6.3;
      var spread = 0.35 + b.life * 1.1;                 // più su, più larghe
      b.mesh.position.set(
        b.x0 * spread + Math.sin(b.life * 6.0 + b.phase) * b.curve,
        y,
        b.z0 * spread + Math.cos(b.life * 4.4 + b.phase) * b.curve * 0.6
      );
      b.mesh.position.x += b.drift * b.life;
      b.mat.uniforms.uAlpha.value = (0.55 + 0.4 * Math.sin(b.phase))
        * Math.min(1, b.life / 0.12) * Math.min(1, (1 - b.life) / 0.18);
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
    bubbles.forEach(function(b){ b.mat.dispose(); });
    cardGeo.dispose(); bubbleGeo.dispose();
    spineGeo.dispose(); spineMat.dispose();
    bg.geometry.dispose(); bgMat.dispose();
    if (spineTex) spineTex.dispose();
    rt.dispose();
    renderer.dispose();
    section.classList.remove('-live');
  };
});
