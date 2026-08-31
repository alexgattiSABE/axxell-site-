/* CAP 05 — point-brain condiviso.
 *
 * Il "cervello di punti" nasce nel capitolo Vesper (js/vesper.js, sezione
 * `brain/`): una superficie campionata per AREA da una mesh cotta, disegnata
 * come nuvola di sprite additivi con uno shader che le dà gradiente, sinapsi
 * che divampano, respiro e uno scoppio (`uExplode`). Task 5 lo rimette DENTRO
 * la testa di vetro del robot (js/robot.js), agganciato al `headGroup` così si
 * muove in sincrono con la testa e si accende quando la testa guarda il cursore.
 *
 * Per non avere due copie dello stesso shader, il NUCLEO riusabile vive qui:
 *   - il campionamento di superficie pesato per area (`sampleSurface`);
 *   - la generazione procedurale di una nuvola cervello-forme quando non c'è una
 *     mesh da campionare (`sampleCloud`);
 *   - il materiale a punti (vertex/fragment shader, verbatim da vesper.js).
 *
 * La COREOGRAFIA resta a chi lo usa: Vesper continua a pilotare da sé le sue
 * uniform (orologio 0→4, raduno, outro, cursore) passando il suo stesso oggetto
 * `uniforms` a `create`; il robot usa invece l'`update(dt, reveal)` incluso, che
 * fa l'unica cosa che gli serve — respirare e accendersi/spegnersi con `reveal`.
 *
 * Definito a livello di parse (non dentro un WC.register): così è già su `WC`
 * quando gli init delle sezioni girano (boot su DOMContentLoaded), qualunque sia
 * l'ordine reciproco degli <script> di vesper.js e robot.js.
 */
window.WC = window.WC || {};

WC.pointBrain = (function () {
  // hex '#rrggbb' o intero 0xRRGGBB o THREE.Vector3 → Vector3 di byte grezzi
  // (nessuna decodifica sRGB, come fa WC.glsl.hexToVec3: il renderer del sito
  // lascia l'output in spazio lineare — vedi il commento in js/glsl.js).
  function toVec3(c) {
    if (c && c.isVector3) return c.clone();
    var n = (typeof c === 'string') ? parseInt(c.slice(1), 16) : (c | 0);
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  /* ------------------------------------------------------------------ shader
   * Verbatim dal brainMaterial di js/vesper.js: spostato, non riscritto. Chi lo
   * usa fornisce l'oggetto uniforms — Vesper il suo (palette + coreografia
   * complete), il robot quello di default qui sotto. */
  var VERT = [
    'attribute float aSeed; attribute float aOcclusion; attribute vec3 aNormal;',
    'uniform float iTime; uniform float iResolutionY; uniform float uSize; uniform float uSynapseRate;',
    'uniform float uCenterRadius; uniform float uFlowSpeed; uniform float uFlowAmount;',
    'uniform vec3 uHighlightPos; uniform float uHighlightRadius; uniform float uHighlightStrength;',
    'uniform float uExplode; uniform float uExplodeDist;',
    'uniform vec2 uMouse; uniform float uCursor; uniform float uAspect; uniform float uCursorRadius;',
    'varying float vSeed; varying float vSynapse; varying float vHemi; varying float vDepth;',
    'varying float vFrontness; varying float vCenterness; varying float vOcclusion; varying float vHighlight;',
    'varying float vFar; varying float vCursor; varying vec3 vWorldPos;',
    'void main() {',
    '  vSeed = aSeed; vOcclusion = aOcclusion;',
    '  vec3 p = position; vWorldPos = p; vHemi = step(0.0, p.x);',
    '  vHighlight = (1.0 - smoothstep(0.0, uHighlightRadius, distance(position, uHighlightPos))) * uHighlightStrength;',
    '  vec3 focalDir = normalize(uHighlightPos + vec3(1e-5));',
    '  float align = dot(normalize(position + vec3(1e-5)), focalDir);',
    '  vFar = smoothstep(0.55, -0.35, align);',
    '  vec3 rad = normalize(p + vec3(1e-5));',
    '  float breathe = sin(iTime * 1.6 + aSeed * 6.0) * 0.012;',
    '  p += rad * breathe;',
    '  vec3 nrm = normalize(aNormal + vec3(1e-5));',
    '  vec3 ref = abs(nrm.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);',
    '  vec3 tA = normalize(cross(nrm, ref));',
    '  vec3 tB = cross(nrm, tA);',
    '  float ph = iTime * uFlowSpeed + aSeed * 6.2831;',
    '  vec3 loopDir = tA * cos(ph) + tB * sin(ph);',
    '  p += loopDir * uFlowAmount;',
    '  vec3 exDir = normalize(rad + vec3(sin(aSeed * 41.0), cos(aSeed * 57.0), sin(aSeed * 73.0)) * 0.45);',
    '  p += exDir * uExplode * uExplodeDist;',
    '  float period = mix(3.0, 9.0, aSeed);',
    '  float firePhase = aSeed * period;',
    '  float ft = mod(iTime + firePhase, period);',
    '  float fire = pow(clamp(1.0 - ft / 0.4, 0.0, 1.0), 2.5);',
    '  if (aSeed > uSynapseRate) fire = 0.0;',
    '  vSynapse = fire;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vec4 centerMv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
    '  float rel = centerMv.z - mv.z;',
    '  vFrontness = clamp(rel * 0.6 + 0.5, 0.0, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  vec4 centerClip = projectionMatrix * centerMv;',
    '  vec2 centerNDC = centerClip.xy / max(0.0001, centerClip.w);',
    '  vec2 pNDC = gl_Position.xy / max(0.0001, gl_Position.w);',
    '  float screenDist = length(pNDC - centerNDC);',
    '  vCenterness = 1.0 - clamp(screenDist / max(0.05, uCenterRadius), 0.0, 1.0);',
    '  vec2 dMouse = pNDC - uMouse; dMouse.x *= uAspect;',
    '  vCursor = (1.0 - smoothstep(0.0, uCursorRadius, length(dMouse))) * uCursor;',
    '  float baseSize = uSize * (iResolutionY / 720.0) * (200.0 / -mv.z);',
    // I lampi di sinapsi divampano più piccoli della sorgente (era fire * 2.5):
    // uno scintillio, non un flash.
    '  gl_PointSize = baseSize * (1.0 + fire * 0.8 + vHighlight * 1.8 + vCursor * 1.3);',
    '  vDepth = -mv.z;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec3 uCool; uniform vec3 uWarm; uniform vec3 uEdgeColor; uniform vec3 uCenterColor;',
    'uniform float uCenterFalloff; uniform vec3 uSynapse; uniform float iAlpha; uniform float uGlow;',
    'uniform float uDepthDarkness; uniform vec3 uDeepColor; uniform float uOcclusionStrength;',
    'uniform vec3 uHighlightColor; uniform float uHighlightStrength; uniform float uFocusFadeStrength;',
    'uniform float uIsolateStrength; uniform float uExplode; uniform vec3 uCursorColor;',
    'varying float vSeed; varying float vSynapse; varying float vHemi; varying float vDepth;',
    'varying float vFrontness; varying float vCenterness; varying float vOcclusion; varying float vHighlight;',
    'varying float vFar; varying float vCursor; varying vec3 vWorldPos;',
    'void main() {',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float r = length(p);',
    '  if (r > 0.5) discard;',
    '  float core = pow(smoothstep(0.5, 0.0, r), 2.2);',
    '  float t = pow(vCenterness, max(0.05, uCenterFalloff));',
    // Gradiente verticale pieno come sull'orb: freddo in basso, caldo in alto.
    // Regge tutta la forma (la vecchia tinta al 35% su base color-bordo si
    // leggeva piatta); sfuma verso l'interno scuro, e il bordo esterno è
    // rialzato col colore di silhouette.
    '  float vt = clamp(smoothstep(-0.7, 0.9, vWorldPos.y) + vSeed * 0.12, 0.0, 1.0);',
    '  vec3 grad = mix(uCool, uWarm, vt);',
    '  vec3 base = mix(grad, uCenterColor, t);',
    '  base = mix(base, uEdgeColor, (1.0 - t) * 0.18);',
    '  base = mix(base, uDeepColor, clamp(vOcclusion * uOcclusionStrength, 0.0, 1.0));',
    '  vec3 col = base + uSynapse * vSynapse * 2.0;',
    '  col = mix(col, uHighlightColor, vHighlight * 0.5);',
    '  col += uHighlightColor * vHighlight * 0.7;',
    '  float nonFocus = (1.0 - vHighlight) * uHighlightStrength;',
    '  col = mix(col, uDeepColor, nonFocus * uIsolateStrength);',
    '  float depthMul = mix(1.0 - uDepthDarkness, 1.0, vFrontness);',
    '  col *= depthMul;',
    '  float alphaOut = core * iAlpha * mix(1.0 - uDepthDarkness * 0.7, 1.0, vFrontness);',
    '  alphaOut *= 1.0 + vHighlight * 0.8;',
    '  float focusDim = 1.0 - uHighlightStrength * uFocusFadeStrength * vFar;',
    '  col *= focusDim; alphaOut *= focusDim;',
    '  col += uCursorColor * vCursor * 0.8;',
    '  alphaOut += vCursor * core * 0.32;',
    '  alphaOut *= 1.0 - smoothstep(0.0, 1.0, uExplode) * 0.8;',
    '  gl_FragColor = vec4(col * uGlow, alphaOut);',
    '}'
  ].join('\n');

  /* Campionamento di superficie pesato per AREA, con normali geometriche.
   * Verbatim da `buildBrainGeometry` di js/vesper.js — legge array grezzi
   * (positions Float32, indices Uint16/Uint32) invece dell'oggetto decodificato,
   * così può servire sia il contenitore cotto di Vesper sia una BufferGeometry
   * qualunque. L'area cumulata evita che un'estrazione uniforme sovracampioni i
   * grappoli di triangoli minuscoli e faccia grumi. */
  function sampleSurface(verts, indices, count, radius) {
    var triangleCount = indices.length / 3;
    var cdf = new Float32Array(triangleCount);
    var total = 0, t, a, b, c;
    for (t = 0; t < triangleCount; t++) {
      a = indices[t * 3] * 3; b = indices[t * 3 + 1] * 3; c = indices[t * 3 + 2] * 3;
      var ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
      var vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
      total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * 0.5;
      cdf[t] = total;
    }
    for (t = 0; t < triangleCount; t++) cdf[t] /= total;

    var positions = new Float32Array(count * 3);
    var normals = new Float32Array(count * 3);
    var seeds = new Float32Array(count);
    // `aOcclusion` esiste per non scomporre il layout degli attributi del
    // materiale; il modello non porta occlusione, resta a zero.
    var occlusion = new Float32Array(count);

    for (var s = 0; s < count; s++) {
      var pick = Math.random(), lo = 0, hi = triangleCount - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cdf[mid] < pick) lo = mid + 1; else hi = mid; }
      a = indices[lo * 3] * 3; b = indices[lo * 3 + 1] * 3; c = indices[lo * 3 + 2] * 3;

      var u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      var w = 1 - u - v;

      positions[s * 3]     = (w * verts[a]     + u * verts[b]     + v * verts[c])     * radius;
      positions[s * 3 + 1] = (w * verts[a + 1] + u * verts[b + 1] + v * verts[c + 1]) * radius;
      positions[s * 3 + 2] = (w * verts[a + 2] + u * verts[b + 2] + v * verts[c + 2]) * radius;

      var e1x = verts[b] - verts[a], e1y = verts[b + 1] - verts[a + 1], e1z = verts[b + 2] - verts[a + 2];
      var e2x = verts[c] - verts[a], e2y = verts[c + 1] - verts[a + 1], e2z = verts[c + 2] - verts[a + 2];
      var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      var len = Math.hypot(nx, ny, nz) || 1;
      normals[s * 3] = nx / len; normals[s * 3 + 1] = ny / len; normals[s * 3 + 2] = nz / len;

      seeds[s] = Math.random();
    }

    return buildGeometry(positions, normals, seeds, occlusion);
  }

  /* Nuvola cervello-forme SENZA mesh: per il robot, dove non campioniamo un
   * modello. Un guscio ellissoidale increspato (gyri finti da qualche seno) con
   * un po' di spessore verso l'interno: a punti additivi dentro il vetro legge
   * come un cervellino luminoso, senza il costo di caricare e campionare una mesh
   * (il brief chiede `{count, radius, color}`, niente sampleFrom). */
  function sampleCloud(count, radius) {
    var positions = new Float32Array(count * 3);
    var normals = new Float32Array(count * 3);
    var seeds = new Float32Array(count);
    var occlusion = new Float32Array(count);
    var golden = Math.PI * (3 - Math.sqrt(5));
    // ellissoide: un filo più stretto in larghezza (x) che in profondità, e più
    // basso (y), per stare dentro la calotta della testa senza sbordare di lato.
    var ex = 0.92, ey = 0.82, ez = 1.0;
    for (var i = 0; i < count; i++) {
      var y = 1 - (i / (count - 1)) * 2;
      var rr = Math.sqrt(Math.max(0, 1 - y * y));
      var th = golden * i;
      var dx = Math.cos(th) * rr, dy = y, dz = Math.sin(th) * rr;
      // Circonvoluzioni: modula il raggio con qualche seno delle direzioni.
      var wr = 1
        + 0.11 * Math.sin(dx * 7.0) * Math.sin(dz * 6.0)
        + 0.08 * Math.sin(dy * 8.0 + dx * 4.0);
      // Spessore: alcuni punti tirati verso l'interno danno volume alla nuvola.
      var shell = 0.70 + 0.30 * Math.random();
      var rad = radius * wr * shell;
      positions[i * 3]     = dx * rad * ex;
      positions[i * 3 + 1] = dy * rad * ey;
      positions[i * 3 + 2] = dz * rad * ez;
      var nl = Math.hypot(dx, dy, dz) || 1;
      normals[i * 3] = dx / nl; normals[i * 3 + 1] = dy / nl; normals[i * 3 + 2] = dz / nl;
      seeds[i] = Math.random();
    }
    return buildGeometry(positions, normals, seeds, occlusion);
  }

  function buildGeometry(positions, normals, seeds, occlusion) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aNormal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    g.setAttribute('aOcclusion', new THREE.BufferAttribute(occlusion, 1));
    return g;
  }

  // Uniform di default (percorso robot): la piena tavolozza dello shell del
  // brain, tinta su un solo `color`. `reveal` (via update → iAlpha) è ciò che
  // la accende; a riposo `uExplode` è 0, i punti stanno sulla superficie.
  function defaultUniforms(color) {
    var col = toVec3(color !== undefined ? color : 0x8bd6ff);
    var cool = col.clone().multiplyScalar(0.42);
    return {
      iTime:              { value: 0 },
      iAlpha:             { value: 0 },
      iResolutionY:       { value: 720 },
      uCool:              { value: cool },
      uWarm:              { value: col.clone() },
      uEdgeColor:         { value: col.clone() },
      uCenterColor:       { value: new THREE.Vector3(0, 0, 0) },
      uSynapse:           { value: new THREE.Vector3(0.90, 1.0, 1.0) },
      uDeepColor:         { value: new THREE.Vector3(0.01, 0.02, 0.05) },
      uCursorColor:       { value: col.clone() },
      uHighlightColor:    { value: col.clone() },
      uCenterRadius:      { value: 0.37 },
      uCenterFalloff:     { value: 4 },
      uSize:              { value: 0.067 },
      uSynapseRate:       { value: 0.12 },
      uFlowSpeed:         { value: 2.3 },
      uFlowAmount:        { value: 0.02 },
      uGlow:              { value: 1.5 },
      uDepthDarkness:     { value: 0.85 },
      uOcclusionStrength: { value: 0 },
      uHighlightPos:      { value: new THREE.Vector3(0, 0, 0) },
      uHighlightRadius:   { value: 0.6 },
      uHighlightStrength: { value: 0 },
      uFocusFadeStrength: { value: 0.55 },
      uIsolateStrength:   { value: 0.88 },
      uExplode:           { value: 0 },
      uExplodeDist:       { value: 5 },
      uMouse:             { value: new THREE.Vector2(-10, -10) },
      uCursor:            { value: 0 },
      uAspect:            { value: 1 },
      uCursorRadius:      { value: 0.1 }
    };
  }

  /* Decodifica del contenitore cotto del cervello di Vesper (VBRN):
   * VERBATIM da decodeBrainMesh in js/vesper.js — 'VBRN' + versione + conteggi,
   * posizioni int16 (frazioni del raggio unitario) e indici uint16. Spostata
   * qui così anche il robot (js/robot.js) può campionare LA STESSA mesh cotta
   * (assets/brain-mesh.bin) di Vesper e leggere identico, invece della nuvola
   * procedurale generica. Vesper continua a usare la sua copia locale. */
  function decodeBrainMesh(buffer) {
    var view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x4e524256) throw new Error('brain mesh: magic errato');
    if (view.getUint32(4, true) !== 1) throw new Error('brain mesh: versione non supportata');
    var vertexCount = view.getUint32(8, true);
    var indexCount = view.getUint32(12, true);
    var quantised = new Int16Array(buffer, 16, vertexCount * 3);
    var positions = new Float32Array(vertexCount * 3);
    for (var k = 0; k < positions.length; k++) positions[k] = quantised[k] / 32767;
    var indexBase = 16 + vertexCount * 3 * 2;
    var indices = new Uint16Array(buffer.slice(indexBase, indexBase + indexCount * 2));
    return { positions: positions, indices: indices };
  }

  /* Le uniform del cervello di Vesper — la sua PALETTE esatta (gradiente
   * viola→menta, sinapsi, ecc.), copiata verbatim da BRAIN/brainUniforms in
   * js/vesper.js. Serve al robot per rendere il cervello AESTHETICAMENTE
   * IDENTICO a quello di Vesper (correzione utente ref1: prima usava una
   * nuvola procedurale con tinta unica). A differenza di Vesper — che pilota
   * da sé la sua coreografia — il robot passa queste uniform a create() e usa
   * l'update(dt, reveal) incluso: iTime/iAlpha/uExplode vengono guidate da lì
   * (uExplode resta 0, i punti riposano sulla superficie; iAlpha = reveal
   * della lente Lithos). uSize di partenza è quella di Vesper (0.067) ma il
   * robot la sovrascrive in base alla distanza reale della camera. */
  function vesperBrainUniforms() {
    return {
      iTime:              { value: 0 },
      iAlpha:             { value: 0 },
      iResolutionY:       { value: 720 },
      uCool:              { value: toVec3('#582eff') },
      uWarm:              { value: toVec3('#52ffa5') },
      uEdgeColor:         { value: toVec3('#582eff') },
      uCenterColor:       { value: toVec3('#000000') },
      uSynapse:           { value: toVec3('#eafff8') },
      uDeepColor:         { value: toVec3('#02040e') },
      uCursorColor:       { value: toVec3('#6bfdff') },
      uHighlightColor:    { value: toVec3('#2563eb') },
      uCenterRadius:      { value: 0.37 },
      uCenterFalloff:     { value: 4 },
      uSize:              { value: 0.067 },
      uSynapseRate:       { value: 0.1 },
      uFlowSpeed:         { value: 2.3 },
      uFlowAmount:        { value: 0.025 },
      uGlow:              { value: 1.4 },
      uDepthDarkness:     { value: 1 },
      uOcclusionStrength: { value: 0 },
      uHighlightPos:      { value: new THREE.Vector3(0, 0, 0) },
      uHighlightRadius:   { value: 0.6 },
      uHighlightStrength: { value: 0 },
      uFocusFadeStrength: { value: 0.55 },
      uIsolateStrength:   { value: 0.88 },
      uExplode:           { value: 0 },
      uExplodeDist:       { value: 5 },
      uMouse:             { value: new THREE.Vector2(-10, -10) },
      uCursor:            { value: 0 },
      uAspect:            { value: 1 },
      uCursorRadius:      { value: 0.1 }
    };
  }

  function createMaterial(uniforms) {
    return new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }

  /* create(opts) -> { points, update(dt, reveal), material, uniforms, geometry }
   *   opts.count     numero di punti (default 4000)
   *   opts.radius    raggio della forma in unità locali (default 1)
   *   opts.color     tinta unica del percorso di default (numero o '#hex')
   *   opts.sampleFrom  THREE.Mesh da campionare per area (come fa Vesper); se
   *                    assente si genera una nuvola procedurale.
   *   opts.uniforms  oggetto uniforms già pronto (Vesper passa il suo, con la
   *                  sua palette completa e la sua coreografia: in quel caso
   *                  `update` non va usato — chi lo passa pilota da sé).
   *
   * update(dt, reveal): fa respirare la nuvola (iTime) e la accende/spegne con
   *   `reveal` 0..1 (→ iAlpha); a riposo `uExplode` resta 0. È il percorso del
   *   robot; Vesper lo ignora e guida le sue uniform nel proprio loop. */
  function create(opts) {
    opts = opts || {};
    var count = opts.count || 4000;
    var radius = opts.radius || 1;

    var geometry;
    if (opts.sampleFrom && opts.sampleFrom.geometry) {
      var g = opts.sampleFrom.geometry;
      var pos = g.attributes.position.array;
      var idx;
      if (g.index) {
        idx = g.index.array;
      } else {
        // Geometria non indicizzata: indici sequenziali (triangoli 0,1,2,...).
        var n = g.attributes.position.count;
        idx = new Uint32Array(n);
        for (var k = 0; k < n; k++) idx[k] = k;
      }
      geometry = sampleSurface(pos, idx, count, radius);
    } else {
      geometry = sampleCloud(count, radius);
    }

    var uniforms = opts.uniforms || defaultUniforms(opts.color);
    var material = createMaterial(uniforms);
    var points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    var time = 0;
    return {
      points: points,
      material: material,
      uniforms: uniforms,
      geometry: geometry,
      update: function (dt, reveal) {
        time += (dt || 0);
        var r = reveal == null ? 0 : (reveal < 0 ? 0 : reveal > 1 ? 1 : reveal);
        uniforms.iTime.value = time;
        uniforms.iAlpha.value = r;
        uniforms.uExplode.value = 0;
      }
    };
  }

  return {
    create: create,
    sampleSurface: sampleSurface,
    sampleCloud: sampleCloud,
    createMaterial: createMaterial,
    decodeBrainMesh: decodeBrainMesh,
    vesperBrainUniforms: vesperBrainUniforms
  };
})();
