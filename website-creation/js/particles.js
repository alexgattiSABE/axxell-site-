/* CAP 06 — un solo sistema di particelle che cambia forma.
 *
 * Sono i primi due atti del template "Vesper" di GetLayers — la sfera e la
 * galassia a spirale — portati da react-three-fiber a three.js r128 e ritinti
 * sui token del sito. Il terzo atto (il cervello a nuvola di punti) resta
 * fuori: è l'unico che richiede un GLB esterno, e questa pagina non carica
 * modelli.
 *
 * Le due forme non si dissolvono l'una nell'altra. La sfera si sfalda in
 * lenzuola che se ne vanno lungo una normale disturbata dal rumore, e la
 * galassia si monta *contemporaneamente* da polvere che arriva da fuori
 * campo: per un tratto sono vive entrambe, ed è quella sovrapposizione a
 * farle leggere come una cosa sola che si trasforma.
 *
 * La camera è una e viaggia fra le due: la sfera è authorata vicina (z 3.8),
 * la galassia lontanissima (z 48). Invece di riscalare una delle due forme
 * per farla stare accanto all'altra, si muove il punto di vista — così
 * ciascuna resta alla scala per cui è stata disegnata.
 *
 * Come nelle altre due sezioni WebGL: niente post-processing, canvas
 * trasparente, fondo in CSS.
 */
WC.register('particles', function(ctx){
  var section = document.getElementById('cap06');
  var pin     = document.getElementById('wcPartPin');
  var canvas  = document.getElementById('wcPartCanvas');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;

  if (!ctx.motionOk || typeof THREE === 'undefined') {
    section.classList.add('-static');
    return;
  }

  // ------------------------------------------------------------ parametri
  var wide = window.innerWidth;
  var T = wide > 1440 ? { orb: 18000, orbSize: 28, camZ: 3.8, gseg: [140, 360], dpr: 1.75 }
        : wide > 1024 ? { orb: 13000, orbSize: 27, camZ: 3.8, gseg: [120, 300], dpr: 1.6 }
        : wide > 640  ? { orb:  9000, orbSize: 24, camZ: 4.5, gseg: [95, 235],  dpr: 1.25 }
        :               { orb:  5500, orbSize: 21, camZ: 5.4, gseg: [65, 160],  dpr: 1.1 };

  var ORB = {
    colorTop: '#00e8a2', colorBottom: '#0077b8', colorEdge: '#005c8f',
    deform: 0.135, brightness: 1.24, opacity: 1, spin: 0.17, tilt: 0.39,
    pointerRadius: 1.76, oilBulge: 0.46, oilRipple: 0.34, oilDrag: 0.95,
    rippleFreq: 11, rippleSpeed: 4, iridescence: 0.6, radius: 1
  };
  var GAL = {
    colorEdge: '#00e8a2', colorCore: '#00d4ff',
    opacity: 0.55, pointSize: 6, brightness: 1.02, armSpin: 0.4,
    tilt: -0.5, scale: 0.18, cameraZ: 48, dive: 30, diveTilt: 0.5,
    parallax: 4, pointerRadius: 5, pointerStrength: 2
  };
  var ORB_PARALLAX = 0.35;

  // --------------------------------------------------------------- clock
  // Un solo orologio 0→1 sullo scroll della sezione. Le rampe qui sotto sono
  // quelle del sorgente, rimappate: gli agganci fra una forma e l'altra sono
  // tarati su queste sovrapposizioni e non vanno "puliti".
  function smootherstep(x){ var t = G.clamp01(x); return t*t*t*(t*(t*6 - 15) + 10); }

  function sample(p){
    var orbOut     = G.clamp01((p - 0.12) / 0.42);
    var galaxyIn   = G.clamp01((p - 0.16) / 0.46);
    var galaxyDive = G.clamp01((p - 0.32) / 0.50);
    var galaxyOut  = G.clamp01((p - 0.76) / 0.24);

    var dissolve = smootherstep(orbOut);
    var appear   = smootherstep(G.smoothstep(0.55, 0.95, galaxyIn));
    // Le stelle sono già in viaggio mentre `appear` è ancora piccolo: questa
    // ritarda apposta rispetto a quella, così il disco lo si vede radunarsi
    // invece che comparire già fatto.
    var assemble = 1 - smootherstep(G.smoothstep(0.5, 1.0, galaxyIn));
    var blow     = smootherstep(G.clamp01((galaxyOut - 0.5) * 2));
    return {
      dissolve: dissolve,
      orbAlpha: 1 - dissolve,
      appear: appear,
      assemble: assemble,
      blow: blow,
      dive: galaxyDive,
      presence: appear * (1 - blow)
    };
  }

  // --------------------------------------------------------------- three
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 0, T.camZ);

  // ----- SFERA: distribuzione di Fibonacci, spostata lungo le normali -----
  var orbGeo = (function(count, radius){
    var positions = new Float32Array(count * 3);
    var randoms = new Float32Array(count * 3);
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < count; i++) {
      var y = 1 - (i / (count - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = golden * i;
      positions[i*3]   = Math.cos(th) * r * radius;
      positions[i*3+1] = y * radius;
      positions[i*3+2] = Math.sin(th) * r * radius;
      randoms[i*3]   = Math.random() - 0.5;
      randoms[i*3+1] = Math.random() - 0.5;
      randoms[i*3+2] = Math.random() - 0.5;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));
    return g;
  })(T.orb, ORB.radius);

  var orbU = {
    uTime: { value: 0 }, uPR: { value: 1 }, uSize: { value: T.orbSize },
    uDeform: { value: ORB.deform }, uOut: { value: 0 }, uAssemble: { value: 0 },
    uCentre: { value: new THREE.Vector3() },
    uCamLocal: { value: new THREE.Vector3(0, 0, 1) },
    uColTop: { value: G.hexToVec3(ORB.colorTop) },
    uColBottom: { value: G.hexToVec3(ORB.colorBottom) },
    uColEdge: { value: G.hexToVec3(ORB.colorEdge) },
    uBrightness: { value: ORB.brightness }, uOpacity: { value: ORB.opacity },
    uAppear: { value: 1 },
    uCursor: { value: new THREE.Vector3(0, 0, ORB.radius) },
    uCursorVel: { value: new THREE.Vector3() }, uEnergy: { value: 0 },
    uPointerRadius: { value: ORB.pointerRadius },
    uOilBulge: { value: ORB.oilBulge }, uOilRipple: { value: ORB.oilRipple },
    uOilDrag: { value: ORB.oilDrag }, uRippleFreq: { value: ORB.rippleFreq },
    uRippleSpeed: { value: ORB.rippleSpeed }, uIri: { value: ORB.iridescence }
  };

  var orbMat = new THREE.ShaderMaterial({
    uniforms: orbU,
    vertexShader: [
      'uniform float uTime; uniform float uSize; uniform float uPR; uniform float uDeform;',
      'uniform float uOut; uniform float uAssemble;',
      'uniform vec3 uCentre; uniform vec3 uCamLocal; uniform vec3 uCursor; uniform vec3 uCursorVel;',
      'uniform float uEnergy; uniform float uPointerRadius; uniform float uOilBulge;',
      'uniform float uOilRipple; uniform float uOilDrag; uniform float uRippleFreq; uniform float uRippleSpeed;',
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
      // Ingresso: ogni punto parte dalla camera con un ritardo suo, così la
      // nuvola si raduna invece di scivolare dentro tutta insieme.
      '  float delay = (aRandom.z + 0.5) * 0.55;',
      '  float t = clamp((uAssemble - delay) / (1.0 - delay), 0.0, 1.0);',
      '  float ease = 1.0 - pow(1.0 - t, 3.0);',
      '  vec3 spawn = uCamLocal * 0.92 + vec3(aRandom.x * 1.9, -1.7 + aRandom.y * 1.3, 0.0);',
      '  pos = mix(spawn, pos, ease);',
      '  float assembleFade = ease;',
      // Dissolvenza: lenzuola che se ne vanno, non un'esplosione uniforme.
      '  float out2 = uOut * uOut;',
      '  vec3 flow = normalize(p + aRandom * 0.4);',
      '  float sheet = snoise(p * 1.9 + vec3(uTime * 0.25));',
      '  float ripple = sin(length(p) * 6.0 - uTime * 1.6 + sheet * 3.0);',
      '  float travel = out2 * (9.0 + sheet * 5.0 + ripple * 1.6);',
      '  pos += flow * travel;',
      '  pos += vec3(sheet, ripple, sheet * ripple) * uOut * 0.55;',
      // Olio: disturbo viscoso fissato nello spazio MONDO (non gira con la sfera).
      '  vec4 wpos = modelMatrix * vec4(pos, 1.0);',
      '  vec3 wN = normalize(wpos.xyz - uCentre);',
      '  float ang = acos(clamp(dot(wN, normalize(uCursor)), -1.0, 1.0));',
      '  float fall = smoothstep(uPointerRadius, 0.0, ang);',
      '  float bulge = fall * fall;',
      '  float oilRipple = sin(ang * uRippleFreq - uTime * uRippleSpeed) * fall;',
      '  float oil = (bulge * uOilBulge + oilRipple * uOilRipple) * uEnergy;',
      '  wpos.xyz += wN * oil;',
      '  wpos.xyz += uCursorVel * fall * uOilDrag * uEnergy;',
      '  vOil = (bulge + max(oilRipple, 0.0) * 0.5) * uEnergy;',
      '  vec4 mv = viewMatrix * wpos;',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = uSize * uPR * (1.0 / max(0.1, -mv.z));',
      '  vVert = mv.y; vSide = abs(mv.x);',
      '  float depth = pos.z * 0.5 + 0.5;',
      '  float outFade = 1.0 - smoothstep(0.0, 0.92, uOut);',
      // Pavimenti su alpha e colore: il blending è additivo, un punto non può
      // disegnare nero — ma su fondo quasi nero un punto che collassa scopre
      // il fondo e legge come una macchia, non come una particella piu' fioca.
      '  vAlpha = (0.28 + 0.32 * depth) * (0.38 + 0.72 * lit) * outFade * assembleFade;',
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
      // Nucleo stretto e alone sottile: sommare additivamente macchie larghe
      // e' cio' che leggeva "saponoso".
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
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
  });

  var orbGroup = new THREE.Group();
  var orbPoints = new THREE.Points(orbGeo, orbMat);
  orbPoints.frustumCulled = false;
  orbGroup.add(orbPoints);
  scene.add(orbGroup);

  // ----- GALASSIA: la sfera è solo un reticolo di semi -----
  var galGeo = new THREE.SphereGeometry(4.2, T.gseg[0], T.gseg[1]);
  // Il conto dei duplicati va fatto PRIMA di togliere l'indice. THREE.Points
  // onora l'indice: ogni vertice verrebbe disegnato ~6 volte esattamente
  // sopra sé stesso. Il blending è lineare, quindi N sprite coincidenti di
  // alpha `a` sommano esattamente `N·a`: scalando l'opacità per il fattore di
  // duplicazione si riottiene la stessa immagine facendo un sesto del lavoro.
  var galVerts = galGeo.attributes.position.count;
  var galDupes = galGeo.index ? galGeo.index.count / galVerts : 1;
  galGeo.setIndex(null);

  var galU = {
    uTime: { value: 0 }, uAppear: { value: 0 }, uFade: { value: 1 },
    uBlow: { value: 0 }, uAssemble: { value: 1 },
    uColEdge: { value: G.hexToVec3(GAL.colorEdge) },
    uColCore: { value: G.hexToVec3(GAL.colorCore) },
    uOpacity: { value: GAL.opacity * galDupes },
    uSize: { value: GAL.pointSize }, uBrightness: { value: GAL.brightness },
    uArmSpin: { value: GAL.armSpin }, uScale: { value: GAL.scale },
    uCursor: { value: new THREE.Vector3() },
    uRepelRadius: { value: GAL.pointerRadius },
    uRepelStrength: { value: GAL.pointerStrength },
    uActivity: { value: 0 }
  };

  var galMat = new THREE.ShaderMaterial({
    uniforms: galU,
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
      // Montaggio: ogni stella arriva da lontano lungo un vettore suo, con un
      // ritardo suo. Il raggio di partenza è in unità locali; molto più largo
      // di così e il guscio in arrivo racchiude la camera.
      '  float delay = gRnd4 * 0.45;',
      '  float at = clamp((1.0 - uAssemble - delay) / (1.0 - delay), 0.0, 1.0);',
      '  float aEase = 1.0 - pow(1.0 - at, 3.0);',
      '  vec3 spawn = galaxyPos + blowDir * 70.0 + vec3(0.0, (gRnd3 - 0.5) * 26.0, 0.0);',
      '  galaxyPos = mix(spawn, galaxyPos, aEase);',
      '  galaxyPos += blowDir * uBlow * 90.0;',
      '  vec3 finalPos = galaxyPos * uScale;',
      '  vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);',
      '  vec3 toP = modelPosition.xyz - uCursor;',
      '  float fall = smoothstep(uRepelRadius, 0.0, length(toP));',
      '  modelPosition.xyz += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * uActivity;',
      '  vec4 mvPosition = viewMatrix * modelPosition;',
      '  vColor = mix(uColEdge, uColCore, clamp(smoothstep(80.0, 0.0, galaxyR), 0.0, 1.0));',
      '  float isOrb = step(0.98, fract(gRnd1 * 77.77));',
      '  float starSize = mix(1.0, 3.0, isOrb);',
      '  vFade = mix(0.7, 1.0, isOrb);',
      '  gl_PointSize = max(uSize * starSize * (10.0 / -mvPosition.z), 1.5);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '}'
    ].join('\n'),
    fragmentShader: [
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
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });

  var galGroup = new THREE.Group();
  var galPoints = new THREE.Points(galGeo, galMat);
  galPoints.frustumCulled = false;
  galGroup.add(galPoints);
  scene.add(galGroup);

  // ------------------------------------------------------- olio sul cursore
  // Traccia il cursore sulla superficie della sfera, lo fa arrancare
  // (viscosità) e accumula un'energia che sale col movimento e decade piano.
  var oil = (function(radius){
    var smooth = new THREE.Vector3(0, 0, radius);
    var prev = new THREE.Vector3(0, 0, radius);
    var velocity = new THREE.Vector3(), rawVel = new THREE.Vector3();
    var ndc = new THREE.Vector3(), dir = new THREE.Vector3();
    var originToCentre = new THREE.Vector3(), target = new THREE.Vector3(), radial = new THREE.Vector3();
    var state = { energy: 0, idle: 0 };
    return {
      cursor: smooth, velocity: velocity,
      get energy(){ return state.energy; },
      step: function(cam, px, py, centre, enabled, delta){
        var ease = function(base){ return 1 - Math.pow(1 - base, delta * 60); };
        target.copy(smooth);
        if (enabled) {
          ndc.set(px, py, 0.5).unproject(cam);
          dir.copy(ndc).sub(cam.position).normalize();
          originToCentre.copy(cam.position).sub(centre);
          var b = 2 * dir.dot(originToCentre);
          var c = originToCentre.lengthSq() - radius * radius;
          var disc = b * b - 4 * c;
          if (disc >= 0) {
            var tt = (-b - Math.sqrt(disc)) / 2;
            target.copy(originToCentre).addScaledVector(dir, tt);
          } else {
            var tc = Math.max(0, -dir.dot(originToCentre));
            target.copy(originToCentre).addScaledVector(dir, tc).normalize().multiplyScalar(radius);
          }
        }
        prev.copy(smooth);
        smooth.lerp(target, ease(0.1));
        // Solo lo strisciamento tangenziale: la componente radiale va tolta.
        rawVel.subVectors(smooth, prev).multiplyScalar(2.5);
        radial.copy(smooth).normalize();
        rawVel.addScaledVector(radial, -rawVel.dot(radial));
        if (rawVel.length() > 0.6) rawVel.setLength(0.6);
        velocity.lerp(rawVel, ease(0.16));
        var speed = smooth.distanceTo(prev);
        var drive = Math.max(0, Math.min(1, speed * 8));
        if (drive > state.energy) state.energy += (drive - state.energy) * ease(0.08);
        else state.energy *= Math.pow(0.97, delta * 60);
        state.idle = speed < 0.0005 ? state.idle + delta : 0;
        if (!enabled || state.idle > 2.5) state.energy *= Math.pow(0.9, delta * 60);
      }
    };
  })(ORB.radius);

  var pointer = G.makePointer();

  // ----------------------------------------------------------------- loop
  var scrollTarget = 0, scroll = 0, intro = 0;
  var size = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();
  var camLocal = new THREE.Vector3(), centre = new THREE.Vector3();
  var interactive = wide > 900;

  function resize(){
    var r = pin.getBoundingClientRect();
    size.w = Math.max(1, r.width); size.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, T.dpr);
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

    scroll += (scrollTarget - scroll) * G.damp(0.07, dt);
    intro = Math.min(1, intro + dt / 1.6);
    var s = sample(scroll);

    pointer.step(camera, dt, 0, 0, 0);

    // --- camera condivisa ---
    var galaxyZ = GAL.cameraZ - s.dive * GAL.dive;
    var targetZ = T.camZ + (galaxyZ - T.camZ) * s.presence;
    camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 8);
    var sway = ORB_PARALLAX + (GAL.parallax - ORB_PARALLAX) * s.presence;
    var tx = interactive ? pointer.ndc.x * sway * intro : 0;
    var ty = interactive ? pointer.ndc.y * sway * 0.55 * intro : 0;
    var follow = Math.min(1, dt * 3);
    camera.position.x += (tx - camera.position.x) * follow;
    camera.position.y += (ty - camera.position.y) * follow;
    camera.lookAt(0, 0, 0);

    // --- sfera ---
    orbU.uTime.value = t;
    orbU.uPR.value = dpr;
    orbU.uAssemble.value = intro;
    orbU.uOut.value = s.dissolve;
    orbPoints.rotation.y = t * ORB.spin;
    orbPoints.rotation.x = Math.sin(t * 0.1) * ORB.tilt;
    // La camera nello spazio dei punti. I punti girano, quindi va ricalcolata
    // DOPO la rotazione qui sopra, e serve una matrice mondo fresca.
    orbPoints.updateMatrixWorld();
    camLocal.copy(camera.position);
    orbPoints.worldToLocal(camLocal);
    orbU.uCamLocal.value.copy(camLocal);
    centre.set(0, orbGroup.position.y, 0);
    orbU.uCentre.value.copy(centre);
    oil.step(camera, pointer.ndc.x, pointer.ndc.y, centre, interactive, dt);
    orbU.uCursor.value.copy(oil.cursor);
    orbU.uCursorVel.value.copy(oil.velocity);
    orbU.uEnergy.value = oil.energy;
    var orbVisible = intro > 0.001 && s.orbAlpha > 0.002;
    if (orbGroup.visible !== orbVisible) orbGroup.visible = orbVisible;

    // --- galassia ---
    galU.uTime.value = t;
    galU.uAppear.value = s.appear;
    galU.uBlow.value = s.blow;
    galU.uFade.value = 1 - s.blow;
    galU.uAssemble.value = s.assemble;
    galGroup.rotation.x = -(GAL.tilt + s.dive * GAL.diveTilt);
    galGroup.rotation.z = interactive ? pointer.ndc.x * 0.12 : 0;
    galU.uCursor.value.copy(pointer.world);
    galU.uActivity.value = interactive ? pointer.activity : 0;
    // Le stelle stanno già arrivando mentre `appear` è piccolo: senza il
    // secondo termine la polvere in avvicinamento sarebbe invisibile.
    var galVisible = (s.appear > 0.001 || s.assemble < 0.999) && s.blow < 0.999;
    if (galGroup.visible !== galVisible) galGroup.visible = galVisible;

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

  var onResize = function(){ resize(); };
  window.addEventListener('resize', onResize);

  return function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    pointer.dispose();
    orbGeo.dispose(); orbMat.dispose();
    galGeo.dispose(); galMat.dispose();
    renderer.dispose();
  };
});
