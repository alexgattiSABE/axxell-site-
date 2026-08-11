/* Pezzi condivisi dalle sezioni WebGL (cap. 01 tunnel, cap. 03 elica).
 *
 * Sta qui e non dentro core.js perché core.js è il motore del motion — Lenis,
 * ScrollTrigger, routing reduced-motion — e non deve sapere che esiste three.js.
 * Le sezioni restano indipendenti fra loro: dipendono da questo, non l'una
 * dall'altra. */
WC.glsl = (function(){

  // Simplex noise 3D di Ashima, la stessa implementazione che portano le scene
  // sorgente. Duplicarla in due shader costerebbe ~1.4KB per copia.
  var SNOISE = [
    'vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}',
    'float snoise(vec3 v){',
    '  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
    '  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);',
    '  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;',
    '  vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);',
    '  vec3 x1 = x0 - i1 + 1.0 * C.xxx; vec3 x2 = x0 - i2 + 2.0 * C.xxx; vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;',
    '  i = mod(i, 289.0);',
    '  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
    '  float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;',
    '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
    '  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);',
    '  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);',
    '  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);',
    '  vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));',
    '  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;',
    '  vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);',
    '  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
    '  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
    '  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;',
    '  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
    '}',
    'float random(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }'
  ].join('\n');

  // Le scene sorgente girano su WebGL1Renderer senza output encoding, quindi
  // caricano i byte del colore grezzi. r128 fa lo stesso di default: convertire
  // in lineare qui li slaverebbe.
  function hexToVec3(hex){
    var n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  // Smorzamento indipendente dal frame rate: `base` è la frazione chiusa in
  // 1/60 s, così il feel è identico a 30, 60 o 120 fps.
  function damp(base, dt){ return 1 - Math.pow(1 - base, dt * 60); }

  function clamp01(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(a, b, x){ var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

  // Il pulviscolo ambientale: motes alla deriva agganciati alla camera.
  // Identico nelle due scene sorgente, quindi vive qui.
  function makeAtmosphere(opts){
    var N = opts.count;
    var positions = new Float32Array(N * 3), sizes = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      positions[i*3]   = 2*Math.random()-1;
      positions[i*3+1] = 2*Math.random()-1;
      positions[i*3+2] = 2*Math.random()-1;
      sizes[i] = opts.size * (0.4 + Math.random());
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:  { value: 0 },
        uColor: { value: hexToVec3(opts.color) },
        uResY:  { value: 900 }
      },
      vertexShader: [
        'attribute float size; uniform float uTime; uniform float uResY; varying float vA;',
        'vec3 warp(vec3 p, float t){ float c=0.9,a=1.9,b=0.02,s=0.05; p*=2.0;',
        '  p.x+=c*sin(s*t+a*p.y)+t*b; p.y+=c*cos(s*t+a*p.x); p.y+=c*sin(s*t+a*p.z)+t*b;',
        '  p.z+=c*cos(s*t+a*p.y); p.z+=c*sin(s*t+a*p.x)+t*b; p.x+=c*cos(s*t+a*p.z);',
        '  return cos(p+vec3(1.0,2.0,4.0)); }',
        'void main(){',
        '  vec3 v = position*4.0 + warp(position, uTime)*1.2;',
        '  vec4 mv = modelViewMatrix * vec4(v, 1.0);',
        '  float r = length(v);',
        '  vA = (1.0 - smoothstep(5.0, 6.5, r)) * smoothstep(0.0, 0.5, -mv.z);',
        '  gl_PointSize = max(size * uResY / 900.0 / -mv.z, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; varying float vA;',
        'void main(){ vec2 p = gl_PointCoord - 0.5; float l = length(p); if (l > 0.5) discard;',
        '  float tex = smoothstep(0.5, 0.0, l); gl_FragColor = vec4(uColor * tex, tex * vA * 0.6); }'
      ].join('\n'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    });
    var pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return {
      points: pts,
      material: mat,
      step: function(t, camera, dpr, height){
        mat.uniforms.uTime.value = t * opts.speed * 8;
        mat.uniforms.uResY.value = height * dpr;
        pts.position.copy(camera.position);
      },
      dispose: function(){ g.dispose(); mat.dispose(); }
    };
  }

  // Il "vuoto" sotto il cursore, condiviso: proietta il puntatore sul piano
  // z = `planeZ` in coordinate mondo, e tiene un'attività che decade da sola
  // quando il mouse sta fermo — senza, la parete resta scavata per sempre.
  function makePointer(){
    var targetNdc = { x: 0, y: 0 }, ndc = { x: 0, y: 0 };
    var active = false, lastMove = performance.now(), activity = 0;
    var world = new THREE.Vector3(), _n = new THREE.Vector3(),
        _d = new THREE.Vector3(), _t = new THREE.Vector3();

    function onMove(e){
      targetNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
      targetNdc.y = -((e.clientY / window.innerHeight) * 2 - 1);
      active = true; lastMove = performance.now();
    }
    function onLeave(){ active = false; }
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseout', onLeave, { passive: true });

    return {
      ndc: ndc,
      world: world,
      get activity(){ return activity; },
      step: function(camera, dt, restX, restY, planeZ){
        var k = damp(0.08, dt);
        ndc.x += (targetNdc.x - ndc.x) * k;
        ndc.y += (targetNdc.y - ndc.y) * k;

        _t.set(restX, restY, planeZ);
        if (active) {
          _n.set(ndc.x, ndc.y, 0.5).unproject(camera);
          _d.copy(_n).sub(camera.position).normalize();
          if (Math.abs(_d.z) > 1e-4) {
            var tt = (planeZ - camera.position.z) / _d.z;
            if (tt > 0 && isFinite(tt)) _t.copy(camera.position).addScaledVector(_d, tt);
          }
        }
        world.lerp(_t, damp(0.12, dt));
        var idle = (performance.now() - lastMove) / 1000;
        activity += (((active && idle < 3) ? 1 : 0) - activity) * damp(0.06, dt);
      },
      dispose: function(){
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseout', onLeave);
      }
    };
  }

  return {
    SNOISE: SNOISE,
    hexToVec3: hexToVec3,
    damp: damp,
    clamp01: clamp01,
    smoothstep: smoothstep,
    makeAtmosphere: makeAtmosphere,
    makePointer: makePointer
  };
})();
