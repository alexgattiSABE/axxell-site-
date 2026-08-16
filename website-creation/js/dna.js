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
  var canvas  = document.getElementById('wcDnaCanvas');
  if (!section || !canvas) return;

  // Reduced-motion o niente WebGL: il capitolo resta com'era, testo su nero.
  // Il canvas non va nemmeno inizializzato.
  if (!ctx.motionOk || typeof THREE === 'undefined') {
    canvas.style.display = 'none';
    return;
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
    scrollTwist: 0.9,
    scrollSpin: 1.8,
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
    uTime:          { value: 0 },
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

  var scrollTarget = 0, scroll = 0, spinPhase = 0, appear = 0;
  var dpr = 1, size = { w: 1, h: 1 };
  var running = false, raf = 0, last = performance.now();

  function resize(){
    var r = section.getBoundingClientRect();
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
    var t = now / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    appear = Math.min(1, appear + dt / 1.4);

    uniforms.uTime.value = t;
    uniforms.uAppear.value = appear;
    uniforms.uTwist.value = CONFIG.twist * (1 + scroll * CONFIG.scrollTwist);

    var mx = pointer.ndc.x, my = pointer.ndc.y;
    camera.position.set(mx * CONFIG.parallax, my * CONFIG.parallax, 8.67);
    // Dritto davanti a sé, NON verso l'elica: puntandola la camera la
    // rimetterebbe al centro dell'inquadratura e `offsetX` non sposterebbe
    // niente — è quello che faceva finire i punti sopra il testo.
    camera.lookAt(0, 0, 0);

    pointer.step(camera, dt, 0, 0, 0);
    uniforms.uCursor.value.copy(pointer.world);
    uniforms.uActivity.value = pointer.activity;

    // L'elica scende mentre si scorre: sembra che si salga lungo il filamento.
    group.position.y = -scroll * CONFIG.scrollClimb;
    spinPhase += dt * (CONFIG.spin + scroll * CONFIG.scrollSpin);
    group.rotation.y = spinPhase;

    atmo.step(t, camera, dpr, size.h);
    renderer.render(scene, camera);
  }

  function start(){ if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  resize();

  // Nessun pin: il manifesto è un blocco di testo che si legge scorrendo, e
  // bloccarlo a schermo per far girare l'elica lo trasformerebbe in una sosta.
  // Il progresso è quello dell'attraversamento della sezione.
  var stScroll = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onUpdate: function(self){ scrollTarget = self.progress; },
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });

  var onResize = function(){ resize(); };
  window.addEventListener('resize', onResize);

  cleanups.push(function(){
    stop();
    stScroll.kill();
    window.removeEventListener('resize', onResize);
    geometry.dispose(); material.dispose();
    atmo.dispose(); renderer.dispose();
  });

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
