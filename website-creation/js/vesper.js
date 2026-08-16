/* CAP. 04 — VESPER. Una sfera di punti che si tocca.
 *
 * Scena "Orb" del progetto Vesper (Textura), portata da React Three Fiber al
 * three r128 globale del sito. Nell'originale l'orb è la forma d'apertura della
 * home e la sua coreografia è guidata da una timeline di scroll: qui è la stessa
 * cosa, con lo scroll della sezione al posto della timeline.
 *
 * Perché sta qui e non è la terza fase del warp: il warp con "sfera e galassia"
 * mostra un RIORDINO — le stesse particelle che cambiano forma. Questo capitolo
 * mostra un'altra cosa, cioè una superficie che reagisce al dito. Sono due
 * dimostrazioni diverse e chiedono due sezioni.
 *
 * La forma non è una mesh: è una sfera di Fibonacci (distribuzione uniforme, non
 * la griglia lat/lon che addensa i poli) i cui punti vengono spinti lungo la
 * normale da due ottave di simplex. Tre fasi ci scorrono sopra, tutte legate
 * allo scroll:
 *
 *   uAssemble  i punti arrivano dalla camera e si posano sulla sfera, ognuno
 *              con il suo ritardo: si raduna, non compare.
 *   uCore      un foro passante lungo l'asse di vista. È misurato in spazio
 *              OGGETTO, quindi il bordo segue la superficie deformata e ondeggia
 *              con lei invece di essere un cerchio netto stampato sopra.
 *   uOut       la dissoluzione: i punti scorrono verso l'esterno a lenzuoli, con
 *              un'onda che viaggia, così si sfalda invece di esplodere.
 *
 * L'"olio" del cursore vive in spazio MONDO e non gira con la sfera: la sfera
 * ruota sotto la gobba, che resta dove sta il dito. È il dettaglio che fa
 * sembrare la superficie un liquido e non una texture che scorre.
 */
WC.register('vesper', function(ctx){
  var section = document.getElementById('capVesper');
  var pin     = document.getElementById('wcVesperPin');
  var canvas  = document.getElementById('wcVesperCanvas');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;
  var cleanups = [];

  var wide = window.innerWidth;
  var mobile = wide <= 640 || matchMedia('(pointer:coarse)').matches;

  // Gli scaglioni sono quelli di `adaptive.ts` del progetto originale.
  var COUNT = wide > 1600 ? 23000 : wide > 1200 ? 17000 : wide > 640 ? 11000 : 6500;
  var PSIZE = wide > 1600 ? 28    : wide > 1200 ? 27    : wide > 640 ? 24    : 21;
  var maxDpr = wide > 1024 ? 1.75 : 1.25;

  var CONFIG = {
    // Palette originale di Vesper: menta in alto, viola-blu sotto e ai bordi.
    colorTop: '#52ffa5',
    colorBottom: '#582eff',
    colorEdge: '#582eff',
    deform: 0.135,
    brightness: 1.24,
    opacity: 1,
    spin: 0.17,
    tilt: 0.39,
    pointerRadius: 1.76,
    oilBulge: 0.46,
    oilRipple: 0.34,
    oilDrag: 0.95,
    rippleFreq: 11,
    rippleSpeed: 4,
    iridescence: 0.6,
    radius: 1,
    approach: 2.6,      // quanto si avvicina alla camera lungo lo scroll
    distortGain: 3.4,   // e quanto gonfia il rumore mentre arriva
    camZ: 4.2,
    // Fasi, in quota di scroll della sezione. In fila e non sovrapposte: il
    // raduno, il foro e lo sfaldamento sono tre letture che si annullano se
    // capitano insieme (stessa ragione delle fasi del warp).
    phaseAssemble: 0.22,   // entro qui si è radunata
    phaseCoreIn:   0.42,   // poi si apre il foro
    phaseCoreOut:  0.68,
    // Lo sfaldamento parte presto (0.70 e non 0.80) perché il pin è a
    // `pinSpacing: false`: la sezione dopo scorre SOPRA questa invece di
    // aspettare il suo turno, e negli ultimi punti di scroll copre il canvas.
    // Finendo entro ~0.95 la dissoluzione si vede tutta.
    phaseOut:      0.70
  };

  // Reduced-motion o niente WebGL: resta la copy, che è già la versione
  // leggibile del capitolo.
  if (!ctx.motionOk || typeof THREE === 'undefined') {
    section.classList.add('-static');
    return;
  }

  /* ---- geometria: sfera di Fibonacci ----
   * y scorre linearmente da 1 a -1 e l'angolo avanza di un giro aureo a ogni
   * punto: è quello che dà passo costante fra un punto e il successivo su tutta
   * la superficie. Con lat/lon i punti si ammasserebbero ai poli. */
  var positions = new Float32Array(COUNT * 3);
  var randoms   = new Float32Array(COUNT * 3);
  var golden = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < COUNT; i++) {
    var y  = 1 - (i / (COUNT - 1)) * 2;
    var rr = Math.sqrt(Math.max(0, 1 - y * y));
    var th = golden * i;
    positions[i*3]   = Math.cos(th) * rr * CONFIG.radius;
    positions[i*3+1] = y * CONFIG.radius;
    positions[i*3+2] = Math.sin(th) * rr * CONFIG.radius;
    randoms[i*3]   = Math.random() - 0.5;
    randoms[i*3+1] = Math.random() - 0.5;
    randoms[i*3+2] = Math.random() - 0.5;
  }
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRandom',  new THREE.BufferAttribute(randoms, 3));

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, CONFIG.camZ);

  var uniforms = {
    uTime:          { value: 0 },
    uPR:            { value: 1 },
    uSize:          { value: PSIZE },
    uDeform:        { value: CONFIG.deform },
    uOut:           { value: 0 },
    uAssemble:      { value: 0 },
    uCore:          { value: 0 },
    uCentre:        { value: new THREE.Vector3() },
    uCamLocal:      { value: new THREE.Vector3(0, 0, 1) },
    uColTop:        { value: G.hexToVec3(CONFIG.colorTop) },
    uColBottom:     { value: G.hexToVec3(CONFIG.colorBottom) },
    uColEdge:       { value: G.hexToVec3(CONFIG.colorEdge) },
    uBrightness:    { value: CONFIG.brightness },
    uOpacity:       { value: CONFIG.opacity },
    uAppear:        { value: 1 },
    uCursor:        { value: new THREE.Vector3(0, 0, CONFIG.radius) },
    uCursorVel:     { value: new THREE.Vector3() },
    uEnergy:        { value: 0 },
    uPointerRadius: { value: CONFIG.pointerRadius },
    uOilBulge:      { value: CONFIG.oilBulge },
    uOilRipple:     { value: CONFIG.oilRipple },
    uOilDrag:       { value: CONFIG.oilDrag },
    uRippleFreq:    { value: CONFIG.rippleFreq },
    uRippleSpeed:   { value: CONFIG.rippleSpeed },
    uIri:           { value: CONFIG.iridescence }
  };

  var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
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

  var group = new THREE.Group();
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  scene.add(group);

  /* ---- il puntatore "oleoso" ----
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
        ptr.lerp(new THREE.Vector2(ndcX, ndcY), ease(0.11));
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
  })(CONFIG.radius);

  // Il puntatore in NDC relativo alla sezione: il canvas non è tutta la pagina.
  var ndcX = 0, ndcY = 0, hasPointer = false;
  var onMove = function(e){
    var r = pin.getBoundingClientRect();
    ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1);
    hasPointer = true;
  };
  window.addEventListener('mousemove', onMove, { passive: true });
  cleanups.push(function(){ window.removeEventListener('mousemove', onMove); });

  var scrollTarget = 0, scroll = 0;
  var dpr = 1, size = { w: 1, h: 1 };
  var running = false, raf = 0, last = performance.now();
  var centre = new THREE.Vector3(), camLocal = new THREE.Vector3();

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

    uniforms.uTime.value = t;
    uniforms.uPR.value = dpr;
    uniforms.uAssemble.value = G.clamp01(scroll / CONFIG.phaseAssemble);
    uniforms.uCore.value = G.clamp01((scroll - CONFIG.phaseCoreIn) /
                                     (CONFIG.phaseCoreOut - CONFIG.phaseCoreIn));
    uniforms.uOut.value = G.clamp01((scroll - CONFIG.phaseOut) / (1 - CONFIG.phaseOut));

    points.rotation.y = t * CONFIG.spin;
    points.rotation.x = Math.sin(t * 0.1) * CONFIG.tilt;

    // "Entrare nell'ignoto": invece di allontanarsi, la sfera viene verso la
    // camera e il rumore che la deforma si gonfia, così si sforma arrivando.
    var approach = G.clamp01((scroll - CONFIG.phaseCoreIn) / (1 - CONFIG.phaseCoreIn));
    group.position.z = 0.8 * CONFIG.approach * approach;
    uniforms.uDeform.value = CONFIG.deform * (1 + approach * CONFIG.distortGain);

    // La camera nello spazio dei punti. Il foro e il punto di nascita sono
    // entrambi in spazio oggetto e i punti ruotano: va ricalcolata DOPO la
    // rotazione qui sopra, e serve una matrice mondo fresca.
    points.updateMatrixWorld();
    camLocal.copy(camera.position);
    points.worldToLocal(camLocal);
    uniforms.uCamLocal.value.copy(camLocal);
    centre.set(0, group.position.y, group.position.z);
    uniforms.uCentre.value.copy(centre);

    oil.step(camera, ndcX, ndcY, centre, hasPointer && !mobile, dt);
    uniforms.uCursor.value.copy(oil.cursor);
    uniforms.uCursorVel.value.copy(oil.velocity);
    uniforms.uEnergy.value = oil.energy;

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
    geometry.dispose(); material.dispose(); renderer.dispose();
  });

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
