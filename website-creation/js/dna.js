/* CAP 03 — doppia elica in WebGL, guidata dallo scroll, con le parole in orbita.
 *
 * L'elica è la scene "DNA Helix" di GetLayers, riportata su three.js r128 e
 * ritinta con i token del sito. Due differenze volute rispetto al sorgente:
 *
 * 1. Niente EffectComposer. Il sorgente monta tre composer (bloom, torus,
 *    pass finale) per un unico oggetto: su questa pagina ci sono altre due
 *    sezioni WebGL, e tre render target a piena risoluzione qui dentro le
 *    affamerebbero. Il fondo e le fiamme d'angolo del pass finale sono
 *    diventati un gradiente CSS, quindi il canvas resta trasparente.
 * 2. Trasparente serve anche alle parole: metà orbita passa DIETRO l'elica.
 *    Con un fondo opaco in WebGL sarebbe impossibile, perché il DOM non si
 *    interlaccia con il canvas. Ogni parola esiste in due strati — uno sotto
 *    e uno sopra il canvas — e i due si scambiano l'opacità sulla silhouette.
 *
 * La geometria è solo un reticolo di semi: il vertex shader ne hasha la
 * posizione per decidere se quel punto è filamento A, filamento B o piolo.
 * La sfera va de-indicizzata (THREE.Points onora l'indice, e ridisegnerebbe
 * ogni vertice ~6 volte esattamente sopra sé stesso).
 */
WC.register('dna', function(ctx){
  var section = document.getElementById('cap03');
  var pin     = document.getElementById('wcDnaPin');
  var canvas  = document.getElementById('wcDnaCanvas');
  var orbitEl = document.getElementById('wcDnaOrbit');
  if (!section || !pin || !canvas || !orbitEl) return;

  var G = WC.glsl;

  var WORDS = ['TIPOGRAFIA','MOTION','WEBGL','SCROLL','SHADER','PERFORMANCE','ACCESSIBILITÀ','INTERAZIONE'];

  var CONFIG = {
    // Ritinta sui token: ciano --cyan → verde --green, tenuti scuri perché
    // il blending è additivo e i punti si sommano.
    colorLow: '#00303d',
    colorHigh: '#00382a',
    atmoColor: '#7fe4ff',
    atmoCount: 520,
    atmoSize: 22,
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
    pointerStrength: 0.2
  };

  // --- le parole, in due strati ---
  var back = document.createElement('div');
  var front = document.createElement('div');
  back.className = 'wc-dna-layer -back';
  front.className = 'wc-dna-layer -front';
  var pairs = WORDS.map(function(w, i){
    var mk = function(layer){
      var s = document.createElement('span');
      s.className = 'wc-dna-word';
      s.textContent = w;
      layer.appendChild(s);
      return s;
    };
    return {
      b: mk(back), f: mk(front),
      phase: (i / WORDS.length) * Math.PI * 2,
      // Le quote verticali non sono casuali: alternate, così le parole non
      // si accavallano quando due orbite si incrociano di fronte.
      y: ((i % 4) - 1.5) * 0.42,
      rx: 0.86 + (i % 3) * 0.09
    };
  });
  orbitEl.appendChild(back);
  orbitEl.appendChild(front);

  var reduced = !ctx.motionOk || typeof THREE === 'undefined';
  if (reduced) {
    // Nessun WebGL, nessuna orbita: le parole restano dove il CSS le mette
    // (una colonna leggibile) e la sezione perde solo il movimento.
    orbitEl.classList.add('-static');
    section.classList.add('-static');
    return;
  }

  // ---------------------------------------------------------------- three
  var wide = window.innerWidth;
  var seg  = wide > 1440 ? [150, 380] : wide > 1024 ? [130, 320] : wide > 640 ? [100, 240] : [70, 170];
  var maxDpr = wide > 1024 ? 1.75 : 1.25;

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
      'uniform float uTime; uniform float uSize; uniform float uTwist; uniform float uWaveAmt;',
      'uniform float uScale; uniform float uFloat;',
      'uniform vec3 uColLow; uniform vec3 uColHigh;',
      'uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;',
      'varying float vFade; varying vec3 vColor;',
      G.SNOISE,
      'void main(){',
      '  float stretchedY = position.y * 7.0 - 8.0;',
      '  float rnd1 = random(position);',
      '  float rnd2 = random(position + vec3(1.0));',
      '  float rnd3 = random(position + vec3(2.0));',
      '  float t = stretchedY + sin(uTime * 0.8 + rnd1 * 6.28318) * uFloat;',
      '  float twist = t * uTwist;',
      '  float dnaRadius = 1.0;',
      '  float strandThickness = 0.35;',
      '  vec3 dnaPos;',
      '  if (rnd1 < 0.40) {',
      '    vec3 core = vec3(dnaRadius * cos(twist), t, dnaRadius * sin(twist));',
      '    dnaPos = core + vec3(rnd1 - 0.2, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * strandThickness;',
      '  } else if (rnd1 < 0.80) {',
      '    vec3 core = vec3(dnaRadius * cos(twist + 3.14159), t, dnaRadius * sin(twist + 3.14159));',
      '    dnaPos = core + vec3(rnd1 - 0.6, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * strandThickness;',
      '  } else {',
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
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  scene.add(group);

  var atmo = G.makeAtmosphere({ count: CONFIG.atmoCount, size: CONFIG.atmoSize,
                                speed: CONFIG.atmoSpeed, color: CONFIG.atmoColor });
  scene.add(atmo.points);

  var pointer = G.makePointer();

  // ---------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, spinPhase = 0, appear = 0;
  var _centre = new THREE.Vector3();
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();

  // L'elica sta a destra, la copy a sinistra. Su viewport strette torna al
  // centro, perché lì la copy le sta sopra e non di fianco.
  function helixOffset(){ return window.innerWidth > 900 ? 1.55 : 0; }

  function resize(){
    var r = pin.getBoundingClientRect();
    rect.w = Math.max(1, r.width); rect.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.w, rect.h, false);
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();
    group.position.x = helixOffset();
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = now / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    appear = Math.min(1, appear + dt / 1.2);

    uniforms.uTime.value = t;
    uniforms.uAppear.value = appear;
    uniforms.uTwist.value = CONFIG.twist * (1 + scroll * CONFIG.scrollTwist);

    camera.position.set(pointer.ndc.x * CONFIG.parallax, pointer.ndc.y * CONFIG.parallax, 8.67);
    camera.lookAt(group.position.x, 0, 0);

    // Il vuoto sotto il cursore, proiettato sul piano dell'elica.
    pointer.step(camera, dt, group.position.x, 0, 0);
    uniforms.uCursor.value.copy(pointer.world);
    uniforms.uActivity.value = pointer.activity;

    group.position.y = -scroll * CONFIG.scrollClimb;
    spinPhase += dt * (CONFIG.spin + scroll * CONFIG.scrollSpin);
    group.rotation.y = spinPhase;

    atmo.step(t, camera, dpr, rect.h);
    layoutWords(t);
    renderer.render(scene, camera);
  }

  // Le parole orbitano attorno al punto in cui l'elica cade sullo schermo,
  // che si ricava proiettando il suo centro con la stessa camera — non con
  // una costante, che si scollerebbe al variare di aspect e parallasse.
  function layoutWords(t){
    _centre.set(group.position.x, 0, 0).project(camera);
    var cx = (_centre.x * 0.5 + 0.5) * rect.w;
    var cy = (-_centre.y * 0.5 + 0.5) * rect.h;
    var unit = Math.min(rect.w, rect.h);
    var ring = unit * 0.34;

    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var ang = p.phase + t * 0.16 + scroll * Math.PI * 1.4;
      var x = cx + Math.cos(ang) * ring * p.rx;
      var y = cy + p.y * unit * 0.22 + Math.sin(ang * 0.5 + i) * unit * 0.03;
      var depth = (Math.sin(ang) + 1) / 2;             // 0 = dietro, 1 = davanti
      var scale = 0.72 + depth * 0.42;
      var alpha = 0.16 + depth * 0.84;
      var mixF  = depth * depth * (3 - 2 * depth);     // smoothstep sulla silhouette
      var tf = 'translate3d(' + (x.toFixed(1)) + 'px,' + (y.toFixed(1)) + 'px,0) translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';
      p.f.style.transform = tf;
      p.b.style.transform = tf;
      p.f.style.opacity = (alpha * mixF).toFixed(3);
      p.b.style.opacity = (alpha * (1 - mixF)).toFixed(3);
    }
  }

  function start(){ if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  resize();

  // Due trigger separati: uno pinna e misura il progresso, l'altro monta e
  // smonta il loop. Il canvas non deve disegnare mentre la sezione è fuori
  // schermo — su questa pagina ci sono altre due sezioni WebGL.
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
  window.addEventListener('resize', onResize);

  return function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    pointer.dispose();
    geometry.dispose(); material.dispose();
    atmo.dispose(); renderer.dispose();
    orbitEl.textContent = '';
  };
});
