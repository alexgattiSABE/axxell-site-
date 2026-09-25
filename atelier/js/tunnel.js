/* CAP 01 — l'hero è un tunnel di particelle attraversato dallo scroll.
 *
 * Sostituisce il campo di stelle 2D. La scena è "Tunnel" di GetLayers,
 * riportata su three.js r128 e ritinta sui token del sito; come per il cap. 03
 * il pass finale (fondo + fiamme d'angolo) è diventato un gradiente CSS, così
 * il canvas resta trasparente e la copy può stargli davanti senza un
 * rettangolo opaco in mezzo.
 *
 * La coreografia è una sola: prima entrano le parole, poi entra la visuale.
 *   p 0.00 → 0.40   ogni unità di copy (occhiello, parole del titolo, lead,
 *                   pulsante) si allontana verso il punto di fuga, sfalsata.
 *   p 0.34 → 1.00   la camera parte mentre le ultime parole sono ancora in
 *                   volo — la sovrapposizione evita il tempo morto fra i due
 *                   movimenti — e vola in fondo al tubo.
 *
 * Il volo delle parole vive su elementi suoi (`.wc-fly`, `.w`) e non sugli
 * stessi nodi che anima l'entrata dal loader: due animazioni che scrivono
 * `transform` sullo stesso elemento si sovrascriverebbero a vicenda.
 */
WC.register('tunnel', function(ctx){
  var section = document.getElementById('cap01');
  var pin     = document.getElementById('wcHeroPin');
  var canvas  = document.getElementById('wcTunnel');
  var content = document.getElementById('wcHeroContent');
  var title   = document.querySelector('.wc-hero-title');
  var cta     = document.getElementById('wcHeroCta');
  var cue     = document.querySelector('.wc-scroll-cue');
  if (!section || !pin || !title) return;

  var G = WC.glsl;
  var cleanups = [];

  // ---------------------------------------------------------------- entrata
  var items = WC.splitWords(title);
  gsap.set(items, { yPercent: 110 });

  // `enter` gira dopo il ritorno di questa funzione, quando gsap.matchMedia ha
  // già chiuso la raccolta del contesto: i tween creati lì non vengono
  // revertiti da soli e vanno raccolti a mano.
  var entered = [];
  function enter(){
    if (!ctx.motionOk) { gsap.set(items, { yPercent: 0 }); return; }
    entered.push(
      gsap.to(items, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: .05 }),
      gsap.fromTo('.wc-hero-content .lead, #wcHeroCta',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: .8, ease: 'power2.out', stagger: .1, delay: .35 }),
      gsap.fromTo('.wc-scroll-cue span', { yPercent: -100 },
        { yPercent: 250, duration: 1.8, ease: 'power1.inOut', repeat: -1 })
    );
  }
  if (WC.loaded) enter();
  else document.addEventListener('wc:loaded', enter, { once: true });
  cleanups.push(function(){
    document.removeEventListener('wc:loaded', enter);
    entered.forEach(function(t){ t.kill(); });
    entered.length = 0;
  });

  // ------------------------------------------------------- volo automatico
  // Il pulsante non porta a un'ancora: porta *dentro*. Scorre da solo fino in
  // fondo al tunnel, poi lascia lo scroll all'utente. Lenis interrompe da sé
  // uno scrollTo programmato appena arriva un input reale, quindi non serve
  // sbloccare niente a mano.
  function tunnelEnd(){
    return Math.max(0, section.offsetTop + section.offsetHeight - window.innerHeight);
  }
  function flyThrough(e){
    if (e) e.preventDefault();
    var end = tunnelEnd();
    if (!ctx.motionOk) { window.scrollTo(0, end); return; }
    if (WC.lenis) {
      WC.lenis.scrollTo(end, {
        duration: 5.5,
        easing: function(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
      });
    } else {
      window.scrollTo({ top: end, behavior: 'smooth' });
    }
  }
  if (cta) {
    cta.addEventListener('click', flyThrough);
    cleanups.push(function(){ cta.removeEventListener('click', flyThrough); });
  }

  // --- CTA magnetica (desktop) ---
  if (ctx.motionOk && ctx.desktop && cta) {
    var onMagnet = function(e){
      var r = cta.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      var dist = Math.hypot(dx, dy);
      var pull = dist < 140 ? 1 - dist / 140 : 0;
      gsap.to(cta, { x: dx * .35 * pull, y: dy * .35 * pull,
                     duration: .5, ease: 'power3.out' });
    };
    window.addEventListener('mousemove', onMagnet);
    cleanups.push(function(){ window.removeEventListener('mousemove', onMagnet); });
  }

  // ------------------------------------------------------------ coreografia
  // Ordine di volo = ordine di lettura. Le parole del titolo sono `.w`
  // (l'involucro), non `.wi`: `.wi` porta già l'entrata dal loader.
  var units = [];
  Array.prototype.forEach.call(content.children, function(child){
    if (child === title) {
      Array.prototype.push.apply(units, child.querySelectorAll('.w'));
    } else {
      units.push(child);
    }
  });

  var WORDS_END = 0.40, FLY_START = 0.34;
  var lastDelay = 0.55;                       // quota di fase A spesa in stagger
  var stepDelay = units.length > 1 ? lastDelay / (units.length - 1) : 0;

  function choreograph(p){
    var wordsP = G.clamp01(p / WORDS_END);
    var brightest = 0;
    for (var i = 0; i < units.length; i++) {
      var pi = G.clamp01((wordsP - i * stepDelay) / (1 - lastDelay));
      var e = Math.pow(pi, 1.8);              // accelera: risucchiate, non spinte
      var alpha = 1 - G.smoothstep(0.35, 0.95, pi);
      units[i].style.transform = 'translateZ(' + (-e * 2600).toFixed(1) + 'px)';
      units[i].style.opacity = alpha.toFixed(3);
      if (alpha > brightest) brightest = alpha;
    }
    // Un pulsante invisibile ma ancora raggiungibile col Tab è una trappola:
    // sparisce davvero, non solo alla vista.
    content.style.visibility = wordsP > 0.92 ? 'hidden' : '';
    // Il velo dura quanto l'ultima cosa ancora leggibile, non quanto la media:
    // legandolo al progresso complessivo spariva mentre il lead era ancora
    // pieno, cioè proprio dove serviva.
    pin.style.setProperty('--scrim', brightest.toFixed(3));
    if (cue) cue.style.opacity = (1 - G.smoothstep(0, 0.14, p)).toFixed(3);
  }

  // Reduced-motion: niente WebGL, niente volo. La sezione torna alta quanto
  // basta a leggerla e la copy resta ferma dov'è.
  if (!ctx.motionOk || typeof THREE === 'undefined' || !canvas) {
    section.classList.add('-static');
    return function(){ cleanups.forEach(function(f){ f(); }); };
  }

  // ---------------------------------------------------------------- three
  var wide = window.innerWidth;
  var seg  = wide > 1440 ? [150, 380] : wide > 1024 ? [130, 320] : wide > 640 ? [100, 240] : [70, 170];
  var maxDpr = wide > 1024 ? 1.75 : 1.25;

  var CONFIG = {
    // Colori ORIGINALI della scene "Tunnel" di GetLayers, ripresi dal suo
    // CONFIG: parete da viola profondo a ciano, motes azzurri. Erano stati
    // ritinti sui token del sito (verde -> ciano); l'utente ha chiesto di
    // tornare alla proposta di GetLayers.
    colorLow: '#180a3a',
    colorHigh: '#2bf0ff',
    atmoColor: '#8fe6ff',
    atmoCount: wide > 1024 ? 300 : 160,
    atmoSize: 24,
    atmoSpeed: 1.0,
    opacity: 1.44,
    pointSize: 5,
    brightness: 0.4,
    swirl: 0.39,
    spin: 0.065,
    scale: 0.17,
    scrollFly: 34,
    scrollSwirl: 1.5,
    scrollRoll: 0.05,
    steer: 0.6,
    parallax: 0.12,
    pointerRadius: 2.4,
    pointerStrength: 0.8
  };

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0, 0, 20);

  var uniforms = {
    uTime:          { value: 0 },
    uAppear:        { value: 0 },
    uColLow:        { value: G.hexToVec3(CONFIG.colorLow) },
    uColHigh:       { value: G.hexToVec3(CONFIG.colorHigh) },
    uOpacity:       { value: CONFIG.opacity },
    uSize:          { value: CONFIG.pointSize },
    uBrightness:    { value: CONFIG.brightness },
    uSwirl:         { value: CONFIG.swirl },
    uScale:         { value: CONFIG.scale },
    uCursor:        { value: new THREE.Vector3() },
    uRepelRadius:   { value: CONFIG.pointerRadius },
    uRepelStrength: { value: CONFIG.pointerStrength },
    uActivity:      { value: 0 }
  };

  // La sfera è solo un reticolo di semi: il vertex shader ne arrotola le
  // coordinate in un cilindro. Va de-indicizzata — THREE.Points onora
  // l'indice e ridisegnerebbe ogni vertice ~6 volte sopra sé stesso.
  var geometry = new THREE.SphereGeometry(4.2, seg[0], seg[1]);
  geometry.setIndex(null);

  var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: [
      'uniform float uTime; uniform float uSize; uniform float uSwirl; uniform float uScale;',
      'uniform vec3 uColLow; uniform vec3 uColHigh;',
      'uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;',
      'varying float vFade; varying vec3 vColor;',
      G.SNOISE,
      'void main(){',
      '  vec3 wp = vec3(position.x * 7.0, 0.0, position.z * 25.0);',
      '  wp.x += position.y * 6.0;',
      '  float wn = snoise(vec3(wp.x * 0.08, wp.z * 0.08, uTime * 0.15)) * 2.0;',
      '  wn += snoise(vec3(wp.x * 0.16, wp.z * 0.16, uTime * 0.3)) * 0.8;',
      '  float tunnelR = 12.0;',
      '  float currentSliceRadius = sqrt(max(0.0, 17.64 - position.z * position.z));',
      '  float maxSliceWidth = 9.2195 * currentSliceRadius;',
      '  float normalizedX = wp.x / (maxSliceWidth + 0.001);',
      '  float tunnelAngle = normalizedX * 3.14159265;',
      '  float jitterAngle = snoise(vec3(position.x * 15.0, position.y * 15.0, uTime * 0.1)) * 0.35;',
      '  float jitterZ = snoise(vec3(position.y * 15.0, position.z * 15.0, uTime * 0.1)) * 4.0;',
      '  float ambientSwirl = snoise(vec3(position.x * 5.0, position.y * 5.0, uTime * 0.2)) * 3.0;',
      '  tunnelAngle += jitterAngle + ambientSwirl * uSwirl;',
      '  float dynamicR = tunnelR - wn;',
      '  vec3 tunnelPos = vec3(dynamicR * sin(tunnelAngle), -dynamicR * cos(tunnelAngle), wp.z + jitterZ);',
      '  vec3 finalPos = tunnelPos * uScale;',
      '  vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);',
      '  vec3 toP = modelPosition.xyz - uCursor;',
      '  float fall = smoothstep(uRepelRadius, 0.0, length(toP));',
      '  modelPosition.xyz += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * uActivity;',
      '  vec4 mvPosition = viewMatrix * modelPosition;',
      '  vColor = mix(uColLow, uColHigh, clamp(smoothstep(-3.0, 3.0, position.y + position.x * 0.5), 0.0, 1.0));',
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
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  scene.add(group);

  var atmo = G.makeAtmosphere({ count: CONFIG.atmoCount, size: CONFIG.atmoSize,
                                speed: CONFIG.atmoSpeed, color: CONFIG.atmoColor });
  scene.add(atmo.points);

  var pointer = G.makePointer();
  cleanups.push(function(){ pointer.dispose(); });

  var scrollTarget = 0, scroll = 0, rollPhase = 0, appear = 0;
  var dpr = 1, size = { w: 1, h: 1 };
  var running = false, raf = 0, last = performance.now();

  function resize(){
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
    var t = now / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    appear = Math.min(1, appear + dt / 1.4);

    // Il volo della camera parte prima che le parole abbiano finito, e viene
    // rimappato su 0→1 così la corsa nel tubo usa tutto il resto dello scroll.
    var fly = G.clamp01((scroll - FLY_START) / (1 - FLY_START));

    uniforms.uTime.value = t;
    uniforms.uAppear.value = appear;
    uniforms.uSwirl.value = CONFIG.swirl * (1 + fly * CONFIG.scrollSwirl);

    var mx = pointer.ndc.x, my = pointer.ndc.y;
    camera.position.set(mx * CONFIG.parallax, my * CONFIG.parallax, 20 - fly * CONFIG.scrollFly);
    camera.lookAt(mx * CONFIG.steer, my * CONFIG.steer, camera.position.z - 12);

    pointer.step(camera, dt, 0, 0, camera.position.z - 12);
    uniforms.uCursor.value.copy(pointer.world);
    uniforms.uActivity.value = pointer.activity;

    rollPhase += dt * (CONFIG.spin + fly * CONFIG.scrollRoll);
    group.rotation.z = rollPhase;

    atmo.step(t, camera, dpr, size.h);
    choreograph(scroll);
    renderer.render(scene, camera);
  }

  function start(){ if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

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
  start();

  var onResize = function(){ resize(); };
  window.addEventListener('resize', onResize);
  cleanups.push(function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    geometry.dispose(); material.dispose();
    atmo.dispose(); renderer.dispose();
    content.style.visibility = '';
    units.forEach(function(u){ u.style.transform = ''; u.style.opacity = ''; });
  });

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
