/* CAP 05 — point-orb condiviso: la sfera di SABE come modulo di punti.
 *
 * La sfera è quella della sezione SABE del sito (`sabe.html`, canvas
 * `#sabeCanvas`): una sfera di Fibonacci a punti additivi, spostata lungo le
 * normali da due ottave di simplex, dipinta con un gradiente ciano→verde in
 * spazio VISTA (così il gradiente resta fisso allo schermo mentre la sfera
 * gira sotto) e bordi blu. Serve al robot per la PANCIA — l'anima dietro la
 * «A» del petto, con lo stesso meccanismo del cervello dentro la testa
 * (js/pointbrain.js, da cui questo file copia la forma: nucleo riusabile qui,
 * coreografia a chi lo usa).
 *
 * ## Da dove arriva
 * Portato da `axxell-3d.js` nella radice del repo (`ORB_CONFIG`, `SNOISE`,
 * `ORB_VERT`/`ORB_FRAG`, `buildOrbGeometry` e la parte di `mountOrb` che
 * costruisce geometria, uniform e `THREE.Points`). Quel file è un modulo ES
 * scritto per three r185: dalla sorgente arrivano SOLO le stringhe GLSL, i
 * numeri di configurazione e la geometria. NON sono portati — e non servono —
 * renderer, canvas, `attachResize`, il router a pagine, l'orologio di scroll e
 * il puntatore «a olio» legato al mouse della pagina. Le uniform del puntatore
 * restano (lo shader è verbatim) ferme al valore di riposo: `uEnergy` a 0
 * azzera tutto il ramo dell'olio.
 *
 * ## Le trappole (tutte già pagate, non ripeterle)
 * - **Raggio 1 + scale.** Lo shader ha soglie ASSOLUTE pensate per una sfera
 *   di raggio 1 (`uFadeNear` 1.7, `uFadeFar` 3.1, il foro `bore` 0.36, gli
 *   offset di spawn 1.3–1.9). La geometria si costruisce SEMPRE a raggio 1 e
 *   la misura vera la dà `points.scale`: passare 60 unità al costruttore
 *   manderebbe `vEdgeFade` a zero e non si vedrebbe niente.
 * - **`uAssemble` = 1.** A 0 i punti stanno al punto di spawn davanti alla
 *   camera: la sfera non esiste. Nella pagina di SABE è la rampa d'ingresso
 *   animata, qui non serve.
 * - **Il reveal passa da `uAppear`**, che il fragment moltiplica sull'alpha
 *   finale: spegne i punti senza spostarli. `uOut` (dissolvenza esplosa) e
 *   `uCore` (foro passante) restano a 0 — deformano.
 * - **`uCursor` non va mai lasciata a (0,0,0)**: nel vertex c'è un
 *   `normalize(uCursor)`, e `normalize(vec3(0))` fa NaN di tutto il vertex.
 * - **`uCamLocal` è la camera in coordinate LOCALI della sfera** (ci pensa
 *   `update`), non in coordinate mondo.
 * - **`depthTest` resta acceso**: nella pagina di SABE è spento perché lì la
 *   sfera è sola sulla sua canvas; dentro il robot deve stare dietro al
 *   torso e alla «A».
 *
 * ## Dimensione dei punti
 * `gl_PointSize = uSize * uPR / (-mv.z)`: non segue né lo zoom né il fov, e
 * non sa niente della scala della scena. La camera del robot sta a ~1000
 * unità con `zoom` 2 — la `uSize` di SABE (~18, camera a 3,1 unità) darebbe
 * punti invisibili. La taratura, come per il cervello in js/robot.js:
 *
 *     fovScale  = tan(22.5°) / (tan(fov/2) / zoom)
 *     pointSize = 0.03 * alturaCanvasCss * raggioMondo * fovScale
 *
 * dove 0.03 = 27/900 è la regola di SABE stessa (`uSize = baseSize ·
 * lato/900`, `baseSize` 27 sul suo tier desktop): a raggio 1, canvas 900 px,
 * fov 45° e zoom 1 la formula restituisce esattamente la `uSize` della pagina
 * di SABE. Tiene costante il rapporto fra il diametro di un punto e il
 * diametro della sfera a schermo, cioè la GRANA — l'unica cosa che conta nel
 * confronto a occhio.
 *
 * Definito a livello di parse (come pointbrain.js): è già su `WC` quando gli
 * init delle sezioni girano, qualunque sia l'ordine degli <script>.
 */
window.WC = window.WC || {};

WC.pointOrb = (function () {
  /* Decodifica hex sRGB → lineare. Stessa funzione (e stessa ragione) di
   * `hexToLinear` in js/pointbrain.js: il renderer del robot ricodifica
   * lineare→sRGB in uscita (`outputEncoding = sRGBEncoding`), come quello
   * della pagina di SABE (`outputColorSpace = SRGBColorSpace`), quindi i
   * colori devono entrare LINEARI o sbiadiscono. Duplicata invece di
   * importata: così questo file non dipende dall'ordine di caricamento di
   * pointbrain.js. In axxell-3d.js la stessa cosa è scritta come
   * `new THREE.Color(hex)` — in three r185 quel costruttore fa la
   * decodifica da solo, in r128 (il nostro) no. */
  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function hexToLinear(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    return new THREE.Vector3(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
  }

  /* Art direction, verbatim da ORB_CONFIG di axxell-3d.js, con sopra gli
   * scostamenti che la sezione SABE applica nel suo `mountOrb` (sabe.html):
   * è quella la sfera da copiare, non il default del file. I colori sono i
   * token del sito: --cyan #00d4ff e --green #00e8a2. Si ri-tinta da qui,
   * mai toccando gli shader. */
  var ORB = {
    colorTop:      '#00e8a2',
    colorBottom:   '#00d4ff',
    colorEdge:     '#0077b3',
    deform:        0.185,   // ORB_CONFIG: 0.135 — sabe.html lo alza a 0.185
                            // («in un riquadro piccolo il movimento di
                            // superficie va amplificato per restare
                            // leggibile»): la nostra pancia è ancora più
                            // piccola, vale lo stesso motivo.
    brightness:    1.24,
    opacity:       1,
    pointerRadius: 1.76,
    oilBulge:      0.58,    // ORB_CONFIG: 0.46 — sabe.html
    oilRipple:     0.34,
    oilDrag:       0.95,
    rippleFreq:    11,
    rippleSpeed:   4,
    iridescence:   0.72,    // ORB_CONFIG: 0.6 — sabe.html
    fadeNear:      1.7,
    fadeFar:       3.1,
    // Rotazione della pagina di SABE (spin 0.21, tilt 0.46). NON è una
    // uniform e `update` non la applica: la posa la decide chi monta la
    // sfera, come per il cervello dentro la testa.
    spin:          0.21,
    tilt:          0.46
  };

  /* ─── Rumore simplex 3D (Ashima) — verbatim da axxell-3d.js ───────────── */
  var SNOISE = [
    'vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C = vec2(1.0/6.0, 1.0/3.0);',
    '  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
    '  vec3 i = floor(v + dot(v, C.yyy));',
    '  vec3 x0 = v - i + dot(i, C.xxx);',
    '  vec3 g = step(x0.yzx, x0.xyz);',
    '  vec3 l = 1.0 - g;',
    '  vec3 i1 = min(g.xyz, l.zxy);',
    '  vec3 i2 = max(g.xyz, l.zxy);',
    '  vec3 x1 = x0 - i1 + C.xxx;',
    '  vec3 x2 = x0 - i2 + C.yyy;',
    '  vec3 x3 = x0 - D.yyy;',
    '  i = mod289(i);',
    '  vec4 p = permute(permute(permute(',
    '      i.z + vec4(0.0, i1.z, i2.z, 1.0))',
    '      + i.y + vec4(0.0, i1.y, i2.y, 1.0))',
    '      + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
    '  float n_ = 0.142857142857;',
    '  vec3 ns = n_ * D.wyz - D.xzx;',
    '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
    '  vec4 x_ = floor(j * ns.z);',
    '  vec4 y_ = floor(j - 7.0 * x_);',
    '  vec4 x = x_ * ns.x + ns.yyyy;',
    '  vec4 y = y_ * ns.x + ns.yyyy;',
    '  vec4 h = 1.0 - abs(x) - abs(y);',
    '  vec4 b0 = vec4(x.xy, y.xy);',
    '  vec4 b1 = vec4(x.zw, y.zw);',
    '  vec4 s0 = floor(b0)*2.0 + 1.0;',
    '  vec4 s1 = floor(b1)*2.0 + 1.0;',
    '  vec4 sh = -step(h, vec4(0.0));',
    '  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;',
    '  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;',
    '  vec3 p0 = vec3(a0.xy, h.x);',
    '  vec3 p1 = vec3(a0.zw, h.y);',
    '  vec3 p2 = vec3(a1.xy, h.z);',
    '  vec3 p3 = vec3(a1.zw, h.w);',
    '  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
    '  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
    '  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);',
    '  m = m * m;',
    '  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
    '}'
  ].join('\n');

  /* ─── Vertex — verbatim da ORB_VERT, con UNA sola modifica ─────────────
   * `vVert`/`vSide` (le coordinate su cui il fragment dipinge il gradiente,
   * i bordi blu e le calotte) nella sorgente sono `mv.y` e `abs(mv.x)`
   * GREZZE: lì funzionano perché la sfera ha raggio 1 ed è nell'origine, con
   * la camera che la guarda in asse — quindi in spazio vista vanno da −1 a 1.
   * Dentro il robot la sfera è scalata (raggio in unità mondo) e sta nella
   * pancia, fuori asse rispetto alla camera: `mv.y` varrebbe decine di unità
   * e tutte le soglie del fragment (`vt` 0..1, il bordo a 0.72–1.15, la
   * calotta a 0.55–1.05) saturerebbero — sfera tutta blu, gradiente perso.
   * Qui le stesse due quantità sono misurate DAL CENTRO della sfera e in
   * unità di raggio: a raggio 1 nell'origine il risultato è identico alla
   * sorgente (centreMv = 0, scala = 1), a qualunque altra scala è quello che
   * la sorgente intendeva. Nessun'altra riga è stata toccata. */
  var VERT = [
    'uniform float uTime, uSize, uPR, uDeform, uOut, uAssemble, uCore;',
    'uniform vec3  uCentre, uCamLocal, uCursor, uCursorVel;',
    'uniform float uEnergy, uPointerRadius, uOilBulge, uOilRipple, uOilDrag;',
    'uniform float uRippleFreq, uRippleSpeed;',
    'uniform float uFadeNear, uFadeFar;',
    '',
    'attribute vec3 aRandom;',
    'varying float vAlpha, vLit, vVert, vSide, vOil, vEdgeFade;'
  ].join('\n') + '\n' + SNOISE + '\n' + [
    '',
    'void main(){',
    '  vec3 p = position;',
    '',
    '  float n1 = snoise(p * 1.6 + vec3(0.0, uTime * 0.18, 0.0));',
    '  float n2 = snoise(p * 3.3 - vec3(uTime * 0.12));',
    '  float disp = n1 * 0.72 + n2 * 0.28;',
    '  vec3 pos = p * (1.0 + uDeform * disp);',
    '',
    '  float lit = smoothstep(-0.25, 0.5, disp);',
    '  vLit = lit;',
    '',
    '  vec3 axis = normalize(uCamLocal);',
    '  float axial = dot(pos, axis);',
    '  float radial = length(pos - axis * axial);',
    '  float bore = mix(0.36, 0.56, uCore) * (1.0 + disp * 0.55);',
    '  float hole = smoothstep(bore, bore + 0.10, radial);',
    '',
    '  // Ingresso: i punti arrivano dalla camera e si radunano sulla sfera.',
    '  float delay = (aRandom.z + 0.5) * 0.55;',
    '  float t = clamp((uAssemble - delay) / (1.0 - delay), 0.0, 1.0);',
    '  float ease = 1.0 - pow(1.0 - t, 3.0);',
    '  vec3 spawn = uCamLocal * 0.92 + vec3(aRandom.x * 1.9, -1.7 + aRandom.y * 1.3, 0.0);',
    '  pos = mix(spawn, pos, ease);',
    '  float assembleFade = ease;',
    '',
    '  // Dissolvenza radiale. In fase di ingresso i punti nascono sparsi vicino',
    '  // alla camera e coprono tutta la canvas: senza questa sfumatura vengono',
    '  // tagliati di netto dal bordo del riquadro.',
    '  vEdgeFade = 1.0 - smoothstep(uFadeNear, uFadeFar, length(pos));',
    '',
    '  float out2 = uOut * uOut;',
    '  vec3 flow = normalize(p + aRandom * 0.4);',
    '  float sheet = snoise(p * 1.9 + vec3(uTime * 0.25));',
    '  float ripple = sin(length(p) * 6.0 - uTime * 1.6 + sheet * 3.0);',
    '  pos += flow * (out2 * (9.0 + sheet * 5.0 + ripple * 1.6));',
    '  pos += vec3(sheet, ripple, sheet * ripple) * uOut * 0.55;',
    '',
    '  // Olio: disturbo viscoso fisso in spazio MONDO (non ruota con la sfera).',
    '  // Fermo dentro il robot: uEnergy resta 0 e azzera tutto il ramo.',
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
    '',
    '  vec4 mv = viewMatrix * wpos;',
    '  gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = uSize * uPR * (1.0 / max(0.1, -mv.z));',
    '',
    '  // MODIFICA (vedi il commento sopra il vertex): dal centro della sfera e',
    '  // in unità di raggio, non in unità mondo.',
    '  vec4 centreMv = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
    '  float mScale = max(1e-6, length(modelMatrix[0].xyz));',
    '  vVert = (mv.y - centreMv.y) / mScale;',
    '  vSide = abs(mv.x - centreMv.x) / mScale;',
    '',
    '  float depth = pos.z * 0.5 + 0.5;',
    '  float outFade = 1.0 - smoothstep(0.0, 0.92, uOut);',
    '',
    '  // Soglie minime su alpha e colore: il blend è additivo, ma su fondo quasi',
    '  // nero un punto che collassa rivela il fondo e si legge come una macchia.',
    '  vAlpha = hole * (0.28 + 0.32 * depth) * (0.38 + 0.72 * lit) * outFade * assembleFade;',
    '}'
  ].join('\n');

  /* ─── Fragment — verbatim da ORB_FRAG ──────────────────────────────────
   * `uAppear` moltiplica SOLO l'alpha finale: è la via giusta per accendere e
   * spegnere la sfera (il reveal della pancia) senza toccarne la forma. */
  var FRAG = [
    'precision highp float;',
    'uniform vec3  uColTop, uColBottom, uColEdge;',
    'uniform float uBrightness, uOpacity, uAppear, uIri;',
    'varying float vAlpha, vLit, vVert, vSide, vOil, vEdgeFade;',
    '',
    'void main(){',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float d = length(uv);',
    '  if (d > 0.5) discard;',
    '  float soft = smoothstep(0.5, 0.0, d);',
    '  soft = soft * soft * 1.2;',
    '  float core = smoothstep(0.13, 0.0, d);',
    '',
    '  float vt = clamp(vVert * 0.5 + 0.5, 0.0, 1.0);',
    '  vec3 col = mix(uColBottom, uColTop, vt);',
    '  col = mix(col, uColEdge, smoothstep(0.72, 1.15, vSide));',
    '',
    '  col *= (0.78 + 0.42 * vLit);',
    '  col += smoothstep(0.6, 1.0, vLit) * core * vec3(0.45);',
    '',
    '  float cap = smoothstep(0.55, 1.05, abs(vVert));',
    '  col += col * cap * 1.1;',
    '  float capA = 1.0 + 0.6 * cap;',
    '',
    '  float oilMask = clamp(vOil, 0.0, 1.0);',
    '  vec3 iri = 0.5 + 0.5 * cos(6.2831853 * (vOil * 2.4 + abs(vVert) * 0.3 + vec3(0.0, 0.33, 0.67)));',
    '  col = mix(col, iri, oilMask * uIri);',
    '  col += oilMask * 0.3;',
    '',
    '  col *= uBrightness;',
    '  gl_FragColor = vec4(col, soft * vAlpha * capA * uOpacity * uAppear * vEdgeFade * (1.0 + oilMask * 0.5));',
    '}'
  ].join('\n');

  /* ─── Geometria: sfera di Fibonacci ────────────────────────────────────
   * Verbatim da buildOrbGeometry di axxell-3d.js, meno il parametro `radius`:
   * qui è SEMPRE 1 (vedi la trappola in testa al file). */
  function buildOrbGeometry(count) {
    var positions = new Float32Array(count * 3);
    var randoms = new Float32Array(count * 3);
    var golden = Math.PI * (3 - Math.sqrt(5));

    for (var i = 0; i < count; i++) {
      var y = 1 - (i / (count - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = golden * i;
      positions[i * 3] = Math.cos(th) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(th) * r;
      randoms[i * 3] = Math.random() - 0.5;
      randoms[i * 3 + 1] = Math.random() - 0.5;
      randoms[i * 3 + 2] = Math.random() - 0.5;
    }

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));
    return geometry;
  }

  /* Le uniform della sfera di SABE: i colori della sezione (ciano in basso,
   * verde in alto, bordo blu) convertiti con `hexToLinear`, e il resto della
   * configurazione di ORB.
   *
   * Fissate qui una volta per tutte, con il perché:
   *   uAssemble 1  la sfera c'è già (a 0 i punti stanno al punto di spawn)
   *   uOut 0       niente dissolvenza esplosa (deforma)
   *   uCore 0      niente foro passante (deforma)
   *   uAppear 0    spenta a riposo: la accende `update(dt, reveal)`
   *   uEnergy 0    puntatore «a olio» fermo — non lo portiamo dentro il robot
   *   uCursor      (0,0,1): direzione di riposo, MAI il vettore nullo
   *   uCamLocal    (0,0,1) finché `update` non riceve la camera vera
   *   uSize/uPR    li sovrascrive `create` con pointSize e pixelRatio */
  function sabeOrbUniforms() {
    return {
      uTime:          { value: 0 },
      uPR:            { value: 1 },
      uSize:          { value: 18 },
      uDeform:        { value: ORB.deform },
      uOut:           { value: 0 },
      uAssemble:      { value: 1 },
      uCore:          { value: 0 },
      uCentre:        { value: new THREE.Vector3() },
      uCamLocal:      { value: new THREE.Vector3(0, 0, 1) },
      uColTop:        { value: hexToLinear(ORB.colorTop) },
      uColBottom:     { value: hexToLinear(ORB.colorBottom) },
      uColEdge:       { value: hexToLinear(ORB.colorEdge) },
      uBrightness:    { value: ORB.brightness },
      uOpacity:       { value: ORB.opacity },
      uAppear:        { value: 0 },
      uCursor:        { value: new THREE.Vector3(0, 0, 1) },
      uCursorVel:     { value: new THREE.Vector3() },
      uEnergy:        { value: 0 },
      uPointerRadius: { value: ORB.pointerRadius },
      uOilBulge:      { value: ORB.oilBulge },
      uOilRipple:     { value: ORB.oilRipple },
      uOilDrag:       { value: ORB.oilDrag },
      uRippleFreq:    { value: ORB.rippleFreq },
      uRippleSpeed:   { value: ORB.rippleSpeed },
      uIri:           { value: ORB.iridescence },
      uFadeNear:      { value: ORB.fadeNear },
      uFadeFar:       { value: ORB.fadeFar }
    };
  }

  /* `depthTest: true` — l'unica differenza di materiale rispetto alla pagina
   * di SABE, dove è false perché lì la sfera è sola sulla sua canvas. Dentro
   * il robot deve stare DIETRO il torso e la «A». */
  function createMaterial(uniforms) {
    return new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });
  }

  /* create(opts) -> { points, material, uniforms, geometry, update(dt, reveal, camera) }
   *   opts.count       numero di punti (default 20000)
   *   opts.radius      raggio in unità MONDO: va su `points.scale`, non nella
   *                    geometria (vedi le trappole in testa al file)
   *   opts.pointSize   `uSize`, dalla formula in testa al file
   *   opts.pixelRatio  `uPR`: renderer.getPixelRatio(), da riaggiornare a ogni
   *                    resize se il pixel ratio cambia
   *   opts.uniforms    oggetto uniforms già pronto (default: quelle di SABE)
   *
   * update(dt, reveal, camera): avanza l'orologio del rumore (`uTime`), scrive
   *   il reveal 0..1 in `uAppear` e riporta camera e centro nello spazio in cui
   *   lo shader li vuole (`uCamLocal` locale alla sfera, `uCentre` in mondo).
   *   La POSA (rotazione, posizione) resta a chi monta la sfera, come per il
   *   cervello dentro la testa: nella pagina di SABE è
   *   `rotation.y = t * 0.21` e `rotation.x = sin(t * 0.1) * 0.46`. */
  function create(opts) {
    opts = opts || {};
    var count = opts.count || 20000;
    var radius = opts.radius || 1;

    var uniforms = opts.uniforms || sabeOrbUniforms();
    if (opts.pointSize) uniforms.uSize.value = opts.pointSize;
    if (opts.pixelRatio) uniforms.uPR.value = opts.pixelRatio;

    var geometry = buildOrbGeometry(count);
    var material = createMaterial(uniforms);
    var points = new THREE.Points(geometry, material);
    // Geometria a raggio 1, misura vera dalla scala dell'oggetto.
    points.scale.setScalar(radius);
    // I punti escono dalla sfera (deform + dimensione della sprite): il culling
    // sul solo bounding sphere della geometria li taglierebbe di netto.
    points.frustumCulled = false;

    var time = 0;
    var camLocal = new THREE.Vector3();
    var centro = new THREE.Vector3();

    return {
      points: points,
      material: material,
      uniforms: uniforms,
      geometry: geometry,
      update: function (dt, reveal, camera) {
        time += (dt || 0);
        uniforms.uTime.value = time;
        var r = reveal == null ? 0 : (reveal < 0 ? 0 : reveal > 1 ? 1 : reveal);
        uniforms.uAppear.value = r;

        points.updateWorldMatrix(true, false);
        uniforms.uCentre.value.copy(centro.setFromMatrixPosition(points.matrixWorld));
        if (camera) {
          camLocal.copy(camera.position);
          points.worldToLocal(camLocal);
          // Mai il vettore nullo: nel vertex c'è normalize(uCamLocal).
          if (camLocal.lengthSq() < 1e-8) camLocal.set(0, 0, 1);
          uniforms.uCamLocal.value.copy(camLocal);
        }
      }
    };
  }

  return {
    create: create,
    sabeOrbUniforms: sabeOrbUniforms,
    createMaterial: createMaterial,
    buildOrbGeometry: buildOrbGeometry,
    config: ORB
  };
})();
