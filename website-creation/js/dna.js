/* CAP 02 — dietro il manifesto scorre una doppia elica.
 *
 * Il capitolo era testo su nero e basta: l'unico punto della pagina in cui si
 * afferma un metodo, e l'unico senza niente che si muova. L'elica sta a destra,
 * fuori dalla colonna di testo (`.wc-manifesto-text` è larga 22ch), così le due
 * cose non si contendono lo stesso spazio: si legge a sinistra, si guarda a
 * destra.
 *
 * Scena "DNA Helix" di GetLayers, portata da three 0.143 a modulo ES sul r128
 * globale che usa il resto della pagina. Come per il tunnel e il warp NON
 * arriva il post-processing dell'originale (tre EffectComposer, due
 * UnrealBloom e un pass finale con le fiamme d'angolo): erano quattro passate
 * a schermo intero per una sezione che è, prima di tutto, un blocco di testo
 * da leggere. Restano i punti in additive su fondo trasparente — il nero è
 * quello della pagina, non un rettangolo dipinto dal canvas.
 *
 * La forma non è modellata: la geometria è solo un reticolo di semi. Il vertex
 * shader legge tre numeri casuali per punto e lo assegna a uno dei tre gruppi —
 * il 40% al primo filamento, il 40% al secondo (mezzo giro più in là), il 20%
 * ai pioli che li legano. Per questo la sfera va de-indicizzata: THREE.Points
 * onora l'indice e ridisegnerebbe ogni vertice sei volte sopra sé stesso.
 *
 * Lo scroll fa scendere l'elica davanti alla camera e stringe le spire; il
 * cursore fa parallasse e scosta i filamenti al suo passaggio.
 */
WC.register('dna', function(ctx){
  var section = document.getElementById('cap02');
  var pin     = document.getElementById('wcManifestoPin');
  var canvas  = document.getElementById('wcDnaCanvas');
  var orbitEl = document.getElementById('wcDnaOrbit');
  if (!section || !pin || !canvas) return;

  // Le parole in orbita attorno all'elica. Ogni parola esiste in DUE copie, una
  // sotto il canvas e una sopra, che si scambiano l'opacità a seconda di dove
  // sta lungo il giro: è l'unico modo per farla passare davvero DIETRO l'elica,
  // perché il DOM non si interlaccia con un canvas — o sta tutto sopra, o tutto
  // sotto. Il canvas è trasparente proprio per questo.
  // Sedici e non più otto: con otto, su una spirale lunga due giri e mezzo, si
  // vedevano due parole per volta e il filo sembrava spoglio. A sedici la
  // spirale si legge come una scia continua senza che nessuna copra l'altra —
  // le quote sono equidistanti (`offset: i / WORDS.length`), quindi il passo si
  // stringe da solo quando se ne aggiungono.
  // Qualità, non tecnologie. Prima erano i nomi del mestiere (WEBGL, SHADER,
  // RESPONSIVE, SEO): dicevano con cosa è fatto un sito, mentre il capitolo
  // parla di cosa deve ottenere. Il manifesto qui accanto dice «cosa capisce
  // nei primi tre secondi, cosa lo convince» — queste sono quelle cose lì.
  var WORDS = ['ORIGINALITÀ','STILE','UNICITÀ','CARATTERE','IDENTITÀ','PRESENZA',
               'CHIAREZZA','PRECISIONE','ELEGANZA','AUDACIA','CURA','INTENZIONE',
               'RITMO','EQUILIBRIO','TENSIONE','MEMORIA'];
  var pairs = [];

  // Reduced-motion o niente WebGL: il capitolo resta com'era, testo su nero, e
  // le parole diventano una lista in fila sotto il manifesto — leggibile, ferma.
  if (!ctx.motionOk || typeof THREE === 'undefined') {
    canvas.style.display = 'none';
    if (orbitEl) {
      orbitEl.classList.add('-static');
      WORDS.forEach(function(w){
        var s = document.createElement('span');
        s.className = 'wc-dna-word';
        s.textContent = w;
        orbitEl.appendChild(s);
      });
    }
    return;
  }

  if (orbitEl) {
    var back  = document.createElement('div'); back.className  = 'wc-dna-layer -back';
    var front = document.createElement('div'); front.className = 'wc-dna-layer -front';
    pairs = WORDS.map(function(w, i){
      var mk = function(layer){
        var s = document.createElement('span');
        s.className = 'wc-dna-word';
        s.textContent = w;
        layer.appendChild(s);
        return s;
      };
      return {
        b: mk(back), f: mk(front),
        // Sfasate in modo uniforme lungo la spirale: se partissero insieme
        // sarebbero un anello di otto parole, non una scia.
        offset: i / WORDS.length,
        phase: (i % 3) * 2.1,
        rx: 0.86 + (i % 3) * 0.09
      };
    });
    orbitEl.appendChild(back);
    orbitEl.appendChild(front);
  }

  var G = WC.glsl;
  var cleanups = [];

  var wide = window.innerWidth;
  // Come nel tunnel: il reticolo di semi si scala con la finestra. Cambia la
  // densità dei punti, non la forma — la posizione di ognuno esce dal suo hash.
  var seg    = wide > 1440 ? [140, 420] : wide > 1024 ? [120, 340] : [90, 240];
  var maxDpr = wide > 1024 ? 1.75 : 1.25;

  // Valori originali della scena GetLayers. Quelli del pass finale (bgColor,
  // flameColor, flameAmt) non compaiono: vivevano nel post-processing che qui
  // non c'è.
  var CONFIG = {
    colorLow: '#04123a',      // blu profondo in basso...
    colorHigh: '#27043e',     // ...viola in alto
    atmoColor: '#7fe6ff',
    atmoCount: wide > 1024 ? 320 : 160,
    atmoSize: 24,
    atmoSpeed: 0.4,
    opacity: 2,
    pointSize: 4,
    brightness: 1.15,
    twist: 0.65,
    waveAmt: 0.7,
    dnaFloat: 0.95,
    spin: 0.18,
    scale: 0.63,
    scrollClimb: 9.5,
    /* ⚠️ LA FORMA NON CAMBIA MAI. L'elica si muove come un CORPO RIGIDO: sale,
     * gira, si inclina. Non si stringe e non ondeggia.
     *
     * C'è stato un passaggio in cui `scrollTwist` portava la torsione da 0.65 a
     * 1.82 lungo lo scroll: le spire si stringevano, e quello non è un
     * movimento, è un rimodellamento — l'oggetto diventava un altro oggetto
     * mentre lo guardavi. Tolto.
     *
     * Un'elica però è periodica: girarla attorno al proprio asse o traslarla
     * lungo di esso la lascerebbe identica a sé stessa, e il movimento rigido
     * non si vedrebbe. Quello che lo rende visibile è `shapeTime` qui sotto: il
     * rumore che piega i filamenti viene congelato a un valore FISSO invece di
     * scorrere, quindi la piega diventa parte della forma. Con una piega
     * asimmetrica dentro, la rotazione si vede eccome — ed è sempre la stessa
     * elica che gira, non una che si deforma. */
    shapeTime: 3.2,          // l'istante a cui il rumore viene congelato
    scrollSpin: 1.8,
    scrollTilt: 0.16,        // rad: ~9°, quanto basta senza portarla sul testo
    // ---- le parole in orbita ----
    wordRing: 0.20,          // raggio del giro, in frazioni del lato corto
    wordSpan: 1.25,          // altezza percorsa, in altezze di sezione
    wordTurns: 2.2,          // giri completi in una discesa: è questo che la fa SPIRALE
    wordScrollTurns: 1.0,    // quanto avanza la spirale attraversando la sezione
    /* ⚠️ NIENTE MOTO A RIPOSO: il capitolo si muove SOLO mentre si scorre.
     * Niente qui dentro legge l'orologio — nemmeno il pulviscolo, che prende il
     * suo tempo dallo scroll come tutto il resto. Fermo il dito, si ferma tutto
     * (restano l'assestamento dello smorzamento, mezzo secondo, e la reazione al
     * cursore, che è risposta a un input e non moto proprio). */
    scrollAtmoTime: 9,       // "secondi" di deriva del pulviscolo per traversata
    parallax: 1,
    pointerRadius: 2.2,
    pointerStrength: 0.2,
    // Aggiunto qui, non c'era nell'originale: l'originale aveva l'elica al
    // centro di una pagina vuota, qui deve stare accanto a un testo. Con la
    // camera a z 8.67 e fov 45 un'unità vale ~100 px in orizzontale, quindi
    // 2.2 la porta circa 220 px a destra del centro — fuori dalla colonna.
    offsetX: 2.2
  };

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0, 0, 8.67);

  var uniforms = {
    // Congelato: è la piega fissa che rende visibile la rotazione. Vedi la nota
    // su `shapeTime` nel CONFIG.
    uTime:          { value: CONFIG.shapeTime },
    uAppear:        { value: 0 },
    uColLow:        { value: G.hexToVec3(CONFIG.colorLow) },
    uColHigh:       { value: G.hexToVec3(CONFIG.colorHigh) },
    uOpacity:       { value: CONFIG.opacity },
    uSize:          { value: CONFIG.pointSize },
    uBrightness:    { value: CONFIG.brightness },
    uTwist:         { value: CONFIG.twist },
    uWaveAmt:       { value: CONFIG.waveAmt },
    uFloat:         { value: CONFIG.dnaFloat },
    uScale:         { value: CONFIG.scale },
    uCursor:        { value: new THREE.Vector3() },
    uRepelRadius:   { value: CONFIG.pointerRadius },
    uRepelStrength: { value: CONFIG.pointerStrength },
    uActivity:      { value: 0 }
  };

  var geometry = new THREE.SphereGeometry(4.2, seg[0], seg[1]);
  geometry.setIndex(null);

  var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: [
      'uniform float uTime; uniform float uSize; uniform float uTwist;',
      'uniform float uWaveAmt; uniform float uScale; uniform float uFloat;',
      'uniform vec3 uColLow; uniform vec3 uColHigh;',
      'uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;',
      'varying float vFade; varying vec3 vColor;',
      G.SNOISE,
      'void main(){',
      // La sfera viene stirata in un segmento verticale lungo: `t` è la quota
      // del punto lungo l'elica, e ci si somma un respiro sfasato per punto.
      '  float stretchedY = position.y * 7.0 - 8.0;',
      '  float rnd1 = random(position);',
      '  float rnd2 = random(position + vec3(1.0));',
      '  float rnd3 = random(position + vec3(2.0));',
      '  float t = stretchedY + sin(uTime * 0.8 + rnd1 * 6.28318) * uFloat;',
      '  float twist = t * uTwist;',
      '  float dnaRadius = 1.0;',
      '  float strandThickness = 0.35;',
      '  vec3 dnaPos;',
      '  if (rnd1 < 0.40) {',                    // primo filamento
      '    vec3 core = vec3(dnaRadius * cos(twist), t, dnaRadius * sin(twist));',
      '    dnaPos = core + vec3(rnd1 - 0.2, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * strandThickness;',
      '  } else if (rnd1 < 0.80) {',             // secondo, mezzo giro più in là
      '    vec3 core = vec3(dnaRadius * cos(twist + 3.14159), t, dnaRadius * sin(twist + 3.14159));',
      '    dnaPos = core + vec3(rnd1 - 0.6, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * strandThickness;',
      '  } else {',                              // pioli: a quote discrete, non continue
      '    float rungT = (rnd1 - 0.80) * 5.0;',
      '    float discreteT = floor(t * 2.5) / 2.5;',
      '    float discreteTwist = discreteT * uTwist;',
      '    vec3 p1 = vec3(dnaRadius * cos(discreteTwist), discreteT, dnaRadius * sin(discreteTwist));',
      '    vec3 p2 = vec3(dnaRadius * cos(discreteTwist + 3.14159), discreteT, dnaRadius * sin(discreteTwist + 3.14159));',
      '    dnaPos = mix(p1, p2, rungT) + vec3(rnd1 - 0.9, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * 0.10;',
      '  }',
      '  dnaPos.x += snoise(vec3(0.0, t * 0.2, uTime * 0.2)) * uWaveAmt;',
      '  dnaPos.z += snoise(vec3(t * 0.2, 0.0, uTime * 0.2)) * uWaveAmt;',
      '  vec3 finalPos = (dnaPos - vec3(0.0, -8.0, 0.0)) * uScale;',
      '  vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);',
      '  vec3 toP = modelPosition.xyz - uCursor;',
      '  float fall = smoothstep(uRepelRadius, 0.0, length(toP));',
      '  modelPosition.xyz += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * uActivity;',
      '  vec4 mvPosition = viewMatrix * modelPosition;',
      '  vColor = mix(uColLow, uColHigh, clamp(smoothstep(-20.0, 12.0, t), 0.0, 1.0));',
      '  vFade = 1.0;',
      '  gl_PointSize = max(uSize * (10.0 / -mvPosition.z), 1.5);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uOpacity; uniform float uBrightness; uniform float uAppear;',
      'varying float vFade; varying vec3 vColor;',
      'void main(){',
      '  vec2 xy = gl_PointCoord - 0.5;',
      '  float ll = length(xy);',
      '  if (ll > 0.5) discard;',
      '  float a = smoothstep(0.5, 0.1, ll);',
      '  gl_FragColor = vec4(vColor * uBrightness, vFade * a * uOpacity * uAppear);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });

  var group = new THREE.Group();
  group.position.x = CONFIG.offsetX;
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  scene.add(group);

  var atmo = G.makeAtmosphere({ count: CONFIG.atmoCount, size: CONFIG.atmoSize,
                                speed: CONFIG.atmoSpeed, color: CONFIG.atmoColor });
  scene.add(atmo.points);

  var pointer = G.makePointer();
  cleanups.push(function(){ pointer.dispose(); });

  var scrollTarget = 0, scroll = 0, appear = 0;
  var dpr = 1, size = { w: 1, h: 1 };
  var running = false, raf = 0, last = performance.now();

  function resize(){
    // Il riquadro è quello del PIN, alto una schermata — non quello della
    // sezione, che è alta 260svh e darebbe un canvas due volte e mezzo troppo
    // alto, con l'elica schiacciata dentro.
    var r = pin.getBoundingClientRect();
    size.w = Math.max(1, r.width); size.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    // La comparsa segue lo scroll: legata all'orologio, avrebbe continuato a
    // schiarire da sola dopo che il dito si è fermato.
    appear = G.clamp01(scroll / 0.05);

    // `uTime` e `uTwist` NON si toccano più a ogni frame: sono la forma, e la
    // forma è quella. Restano al valore che hanno preso alla costruzione.
    uniforms.uAppear.value = appear;

    var mx = pointer.ndc.x, my = pointer.ndc.y;
    camera.position.set(mx * CONFIG.parallax, my * CONFIG.parallax, 8.67);
    // Dritto davanti a sé, NON verso l'elica: puntandola la camera la
    // rimetterebbe al centro dell'inquadratura e `offsetX` non sposterebbe
    // niente — è quello che faceva finire i punti sopra il testo.
    camera.lookAt(0, 0, 0);

    pointer.step(camera, dt, 0, 0, 0);
    uniforms.uCursor.value.copy(pointer.world);
    uniforms.uActivity.value = pointer.activity;

    // Le tre uniche cose che si muovono, e sono tutte e tre RIGIDE: l'elica
    // sale, gira e si inclina. Il corpo che gira è sempre lo stesso.
    group.position.y = -scroll * CONFIG.scrollClimb;
    // La rotazione non si accumula più con dt: è una funzione dello scroll,
    // altrimenti l'elica continuerebbe a girare da ferma.
    group.rotation.y = scroll * (CONFIG.spin + CONFIG.scrollSpin);
    group.rotation.z = scroll * CONFIG.scrollTilt;

    atmo.step(scroll * CONFIG.scrollAtmoTime, camera, dpr, size.h);
    layoutWords();
    renderer.render(scene, camera);
  }

  /* Le parole percorrono una SPIRALE, non un cerchio: mentre girano attorno
   * all'asse scendono anche lungo di esso, come farebbe un punto sul filamento.
   * `u` è la quota lungo la discesa (0 in alto, 1 in basso) e l'angolo esce da
   * lei — sono legati, ed è quello che distingue una spirale da un anello.
   *
   * Il centro non è una costante: si ricava proiettando il centro dell'elica con
   * la stessa camera, altrimenti al variare di aspetto e parallasse le parole si
   * scollano dalla cosa attorno a cui dovrebbero girare. */
  var _centre = new THREE.Vector3();

  function layoutWords(){
    if (!pairs.length) return;
    _centre.set(group.position.x, 0, 0).project(camera);
    var cx = (_centre.x * 0.5 + 0.5) * size.w;
    var unit = Math.min(size.w, size.h);
    var ring = unit * CONFIG.wordRing;
    var span = size.h * CONFIG.wordSpan;
    var top  = size.h * 0.5 - span * 0.5;

    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var u = p.offset + scroll * CONFIG.wordScrollTurns;
      u -= Math.floor(u);                                  // si richiude su sé stessa
      var ang = p.phase + u * CONFIG.wordTurns * Math.PI * 2;
      var x = cx + Math.cos(ang) * ring * p.rx;
      var y = top + u * span;
      var depth = (Math.sin(ang) + 1) / 2;                 // 0 dietro l'elica, 1 davanti
      var scale = 0.72 + depth * 0.42;
      // Dissolvenza ai due capi: la spirale si richiude, e senza questa una
      // parola sparirebbe in basso per ricomparire in alto di scatto.
      var edge = G.smoothstep(0, 0.12, u) * (1 - G.smoothstep(0.88, 1, u));
      var alpha = (0.16 + depth * 0.84) * edge * appear;
      var mixF = depth * depth * (3 - 2 * depth);          // smoothstep sulla silhouette
      var tf = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)' +
               ' translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';
      p.f.style.transform = tf;
      p.b.style.transform = tf;
      p.f.style.opacity = (alpha * mixF).toFixed(3);
      p.b.style.opacity = (alpha * (1 - mixF)).toFixed(3);
    }
  }

  function start(){ if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  resize();

  /* PIN. Qui prima c'era il contrario, e il commento diceva che bloccare il
   * manifesto a schermo lo avrebbe trasformato in una sosta. Vale se durante la
   * sosta non succede niente: qui in quei 160svh il testo si accende parola per
   * parola, le spire si stringono e sedici parole scendono in spirale. Non è
   * una sosta, è il tempo del capitolo — e senza pin non c'era modo di darglielo,
   * perché il canvas scorreva via insieme alla sezione.
   *
   * `pinSpacing: false` come in tutti gli altri capitoli della pagina: lo spazio
   * di scroll ce l'ha già la sezione (260svh in sections.css), e lasciare che
   * ScrollTrigger ne aggiunga altro darebbe una schermata vuota in fondo. */
  var stPin = ScrollTrigger.create({
    trigger: section, start: 'top top', end: 'bottom bottom',
    pin: pin, pinSpacing: false, anticipatePin: 1,
    onUpdate: function(self){ scrollTarget = self.progress; }
  });
  // Il loop vive e muore con la sezione in quadro: il pin misura il progresso,
  // questo accende e spegne. Sono due cose diverse e vogliono due trigger —
  // il pin comincia quando la sezione tocca il bordo alto, ma il canvas si deve
  // vedere già da quando entra dal basso.
  var stLife = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });

  var onResize = function(){ resize(); };
  window.addEventListener('resize', onResize);

  cleanups.push(function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    geometry.dispose(); material.dispose();
    atmo.dispose(); renderer.dispose();
    if (orbitEl) orbitEl.textContent = '';
  });

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
