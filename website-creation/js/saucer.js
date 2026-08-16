/* LUMINOUS SAUCER — un disco sospeso su un prato notturno.
 *
 * Portato da `luminous-saucer/luminous-saucer.html` (GetLayers), riscritto per
 * il nostro impianto vanilla. I valori del CONFIG qui sotto sono quelli del
 * CONFIG originale, non riaccordati a occhio.
 *
 * ── IL MODELLO ─────────────────────────────────────────────────────────────
 * Il disco nell'originale sta INLINE, in base64, dentro un tag <script>: sono
 * 2,4 MB dei 2,5 del file, ed è compresso Draco con 261.790 triangoli.
 * Spedirlo così avrebbe voluto dire imbarcare il decoder Draco in WASM per
 * ogni visitatore e fargli decomprimere un quarto di milione di triangoli sul
 * telefono. La decompressione si paga UNA volta, offline: vedi
 * `scripts/pack-saucer-glb.md`. Qui arriva un GLB normale da 47.122 triangoli.
 *
 * Il caricatore è lo stesso parser scritto a mano di `spine.js`, allargato:
 * lì bastavano posizioni e indici, qui servono anche normali, UV e le tre
 * texture WebP che il file si porta dentro nei bufferView. Restano quaranta
 * righe di parser invece di un GLTFLoader intero — e soprattutto restano zero
 * script di terze parti in più su una pagina che ne ha già parecchi.
 *
 * ── PERCHÉ IL MATERIALE NON È PBR ──────────────────────────────────────────
 * Il modello ha base color, normal e metallic-roughness, quindi chiederebbe un
 * `MeshStandardMaterial` e un impianto di luci — che questa pagina non ha:
 * tutte le altre scene sono shader che si illuminano da soli.
 * L'originale stesso non lo tratta come PBR: prende la base color, la scurisce
 * (`hullDark`) e riaccende SOLO i pixel sopra una soglia di luminanza
 * (`lampThresh`), che sono le lampade dipinte nella texture. È notte: della
 * fusoliera si vedono le luci, non il metallo. Faccio lo stesso, con una key
 * light debole per non perdere del tutto il volume.
 *
 * ── L'ERBA ─────────────────────────────────────────────────────────────────
 * 40.000 fili, una draw call: `InstancedBufferGeometry`, un filo di 4 segmenti
 * replicato con posizione, rotazione e altezza per istanza. Il vento è nel
 * vertex shader e piega solo la punta (peso = altezza²), perché un filo che si
 * piega anche alla radice sembra gomma. L'illuminazione è la distanza dal
 * centro del raggio: sotto il cono l'erba è accesa, fuori è quasi nera.
 */
WC.register('saucer', function(ctx){
  var section = document.getElementById('capSaucer');
  var pin     = document.getElementById('wcSaucerPin');
  var canvas  = document.getElementById('wcSaucerCanvas');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;

  var CONFIG = {
    glbSrc: 'assets/saucer.glb',
    grassDiffuse: 'assets/grass0.jpg',
    grassAlpha:   'assets/grass1.jpg',
    // cielo
    bgTop: '#010301', bgBottom: '#020F09', bgGlow: '#093A1E',
    bgGlowY: 0.15, bgGlowStr: 0.20,
    bgHorizon: '#0B3A24', bgHorizonY: 0.34, bgHorizonStr: 0.16,
    starColor: '#C6EFDC', starStr: 0.6, starDensity: 58, starTwinkle: 1.6,
    // disco
    saucerScale: 2.0, saucerY: 4.5, saucerTilt: -0.13, saucerSpin: 0.05,
    bobAmount: 0.09, bobSpeed: 0.55,
    hullDark: 0.14, lampColor: '#BFFFD8', lampStr: 2.8, lampThresh: 0.66,
    keyStr: 0.45, ambient: 0.22,
    haloColor: '#8AFFC6', haloStr: 0.32, haloSize: 5.5,
    // raggio
    beamColor: '#4DFFAB', beamTopR: 0.40, beamBotR: 1.30,
    beamWall: 0.42, beamCore: 0.5, beamNoise: 0.09, beamSpeed: 0.32, beamFade: 0.62,
    beamRayCount: 14, beamRayStr: 0.5, beamRaySpeed: 0.22, beamRaySharp: 2.4,
    // terra
    poolColor: '#5BFFB0', poolRadius: 2.1, poolStr: 0.5,
    grassRoot: '#010703', grassTip: '#0A3D18', grassLit: '#2FC76A',
    grassCount: 40000, grassArea: 4.5, grassHeight: 0.10, grassWidth: 0.005,
    litRadius: 1.45, litStr: 0.78, windSpeed: 1.3, windStr: 0.035,
    mistColor: '#0C3A22', mistStr: 0.65, mistHeight: 2.4, mistSpeed: 0.05,
    // camera
    fov: 42, camY: 1.15, camZ: 7.4, camTargetY: 2.6, parallax: 0.30,
    // lo scroll avvicina la camera e alza il raggio
    scrollDolly: 2.4
  };

  var reduced = !ctx.motionOk || typeof THREE === 'undefined';
  if (reduced) { section.classList.add('-static'); return; }

  var wide   = window.innerWidth;
  var mobile = wide <= 640;
  var maxDpr = wide > 1024 ? 1.6 : 1.35;
  // 40.000 fili su un telefono sono 40.000 istanze da trasformare a ogni
  // fotogramma dentro una GPU che ne ha già un'altra scena da disegnare.
  var nGrass = mobile ? 9000 : (wide <= 1024 ? 20000 : CONFIG.grassCount);

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 200);

  var uTime = { value: 0 };
  var uRes  = { value: new THREE.Vector2(1, 1) };
  var uFade = { value: 0 };
  var uBeam = { value: 1 };

  var C = {
    bgTop: G.hexToVec3(CONFIG.bgTop), bgBottom: G.hexToVec3(CONFIG.bgBottom),
    bgGlow: G.hexToVec3(CONFIG.bgGlow), bgHorizon: G.hexToVec3(CONFIG.bgHorizon),
    star: G.hexToVec3(CONFIG.starColor), lamp: G.hexToVec3(CONFIG.lampColor),
    halo: G.hexToVec3(CONFIG.haloColor), beam: G.hexToVec3(CONFIG.beamColor),
    pool: G.hexToVec3(CONFIG.poolColor), root: G.hexToVec3(CONFIG.grassRoot),
    tip: G.hexToVec3(CONFIG.grassTip), lit: G.hexToVec3(CONFIG.grassLit),
    mist: G.hexToVec3(CONFIG.mistColor)
  };

  // ---------------------------------------------------------------- cielo
  // Un piano appeso alla camera. Le stelle sono procedurali, su una griglia:
  // una texture di stelle a questa densità sarebbe un file in più per un
  // risultato che due funzioni di hash danno gratis.
  var skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uRes: uRes, uTime: uTime,
      uTop: { value: C.bgTop }, uBot: { value: C.bgBottom },
      uGlow: { value: C.bgGlow }, uHor: { value: C.bgHorizon },
      uStar: { value: C.star }
    },
    vertexShader: 'void main(){ gl_Position = vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec2 uRes; uniform float uTime;',
      'uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uGlow; uniform vec3 uHor; uniform vec3 uStar;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / uRes;',
      '  vec3 col = mix(uBot, uTop, smoothstep(0.0, 1.0, uv.y));',
      // Due sollevamenti: uno basso e stretto (il bagliore che sale da dietro
      // la collina) e uno più alto e largo, che dà profondità al cielo.
      '  col += uGlow * exp(-pow((uv.y - ' + CONFIG.bgGlowY.toFixed(3) + ') / 0.16, 2.0)) * ' + CONFIG.bgGlowStr.toFixed(3) + ';',
      '  col += uHor  * exp(-pow((uv.y - ' + CONFIG.bgHorizonY.toFixed(3) + ') / 0.26, 2.0)) * ' + CONFIG.bgHorizonStr.toFixed(3) + ';',
      // Stelle: una per cella di griglia, in posizione casuale dentro la cella.
      '  vec2 g = uv * ' + CONFIG.starDensity.toFixed(1) + ' * vec2(uRes.x / uRes.y, 1.0);',
      '  vec2 cell = floor(g), f = fract(g);',
      '  float h = hash(cell);',
      '  vec2 sp = vec2(hash(cell + 3.1), hash(cell + 7.7));',
      '  float d = length(f - sp);',
      // Solo una cella su tre ha una stella, se no il cielo è una retina.
      '  float on = step(0.66, h);',
      '  float tw = 0.55 + 0.45 * sin(uTime * ' + CONFIG.starTwinkle.toFixed(2) + ' + h * 40.0);',
      // Le stelle si spengono verso il basso: vicino all'orizzonte c'è foschia.
      '  float s = on * smoothstep(0.16, 0.0, d) * tw * smoothstep(0.12, 0.55, uv.y);',
      '  col += uStar * s * ' + CONFIG.starStr.toFixed(2) + ';',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'),
    depthWrite: false, depthTest: false
  });
  var sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  camera.add(sky); scene.add(camera);

  // ----------------------------------------------------------------- erba
  // Un filo: un piano stretto e alto, 4 giunti, replicato 40.000 volte. Gli
  // attributi per istanza sono posizione sul disco, rotazione e altezza.
  var grassGeo = new THREE.InstancedBufferGeometry();
  (function(){
    var joints = 4;
    var base = new THREE.PlaneGeometry(CONFIG.grassWidth * 2, CONFIG.grassHeight, 1, joints);
    // Il piano nasce centrato: si trasla in su di mezza altezza perché il filo
    // deve crescere DA terra, non essere infilzato a metà.
    base.translate(0, CONFIG.grassHeight / 2, 0);
    grassGeo.index = base.index;
    grassGeo.setAttribute('position', base.attributes.position);
    grassGeo.setAttribute('uv', base.attributes.uv);

    var off = new Float32Array(nGrass * 3);
    var rot = new Float32Array(nGrass);
    var sca = new Float32Array(nGrass);
    for (var i = 0; i < nGrass; i++) {
      // sqrt sul raggio: senza, i fili si ammassano al centro del disco.
      var r = Math.sqrt(Math.random()) * CONFIG.grassArea;
      var a = Math.random() * Math.PI * 2;
      off[i*3] = Math.cos(a) * r; off[i*3+1] = 0; off[i*3+2] = Math.sin(a) * r;
      rot[i] = Math.random() * Math.PI;
      sca[i] = 0.6 + Math.random() * 1.7;
    }
    grassGeo.setAttribute('aOff',  new THREE.InstancedBufferAttribute(off, 3));
    grassGeo.setAttribute('aRot',  new THREE.InstancedBufferAttribute(rot, 1));
    grassGeo.setAttribute('aScale',new THREE.InstancedBufferAttribute(sca, 1));
    grassGeo.instanceCount = nGrass;
    grassGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CONFIG.grassArea * 1.5);
  })();

  var texLoader = new THREE.TextureLoader();
  var grassDiff = texLoader.load(CONFIG.grassDiffuse);
  var grassAlpha = texLoader.load(CONFIG.grassAlpha);
  [grassDiff, grassAlpha].forEach(function(t){
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false;
  });

  var grassMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uTime, uFade: uFade, uBeam: uBeam,
      uDiff: { value: grassDiff }, uAlpha: { value: grassAlpha },
      uRoot: { value: C.root }, uTip: { value: C.tip }, uLit: { value: C.lit }
    },
    vertexShader: [
      'attribute vec3 aOff; attribute float aRot; attribute float aScale;',
      'uniform float uTime;',
      'varying vec2 vUv; varying float vH; varying float vLit;',
      'void main(){',
      '  vUv = uv;',
      '  vH = uv.y;',                       // 0 alla radice, 1 in punta
      '  vec3 p = position;',
      '  p.y *= aScale;',
      // Il vento piega solo la punta: il peso va col QUADRATO dell'altezza. Con
      // un peso lineare il filo si piega anche alla radice e sembra gomma.
      '  float w = vH * vH;',
      '  float ph = aOff.x * 1.7 + aOff.z * 2.3;',
      '  p.x += sin(uTime * ' + CONFIG.windSpeed.toFixed(2) + ' + ph) * ' + CONFIG.windStr.toFixed(4) + ' * w * aScale * 12.0;',
      '  p.z += cos(uTime * ' + (CONFIG.windSpeed * 0.7).toFixed(2) + ' + ph) * ' + CONFIG.windStr.toFixed(4) + ' * w * aScale * 7.0;',
      // Rotazione del filo attorno al proprio asse, così non sono tutti
      // paralleli e il prato non fa moiré.
      '  float c = cos(aRot), s = sin(aRot);',
      '  vec3 r = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);',
      '  vec3 wp = r + aOff;',
      // Quanto è illuminato: distanza dall'asse del raggio, che è l'origine.
      '  vLit = 1.0 - smoothstep(0.0, ' + CONFIG.litRadius.toFixed(2) + ', length(aOff.xz));',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uDiff; uniform sampler2D uAlpha;',
      'uniform vec3 uRoot; uniform vec3 uTip; uniform vec3 uLit;',
      'uniform float uFade; uniform float uBeam;',
      'varying vec2 vUv; varying float vH; varying float vLit;',
      'void main(){',
      '  float a = texture2D(uAlpha, vUv).r;',
      '  if (a < 0.25) discard;',            // la sagoma del filo sta nell'alpha
      '  vec3 col = mix(uRoot, uTip, vH);',
      '  col *= 0.55 + 0.75 * texture2D(uDiff, vUv).g;',
      // Il verde acceso arriva solo sotto il cono, e in proporzione a quanto è
      // acceso il raggio: se il raggio si spegne, si spegne anche il prato.
      '  col += uLit * vLit * ' + CONFIG.litStr.toFixed(2) + ' * uBeam * (0.35 + vH * 0.9);',
      '  gl_FragColor = vec4(col, uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true, side: THREE.DoubleSide
  });
  var grass = new THREE.Mesh(grassGeo, grassMat);
  grass.frustumCulled = false;
  scene.add(grass);

  // ---------------------------------------------------------------- terra
  var groundMat = new THREE.ShaderMaterial({
    uniforms: { uPool: { value: C.pool }, uFade: uFade, uBeam: uBeam },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uPool; uniform float uFade; uniform float uBeam;',
      'varying vec2 vP;',
      'void main(){',
      '  float d = length(vP);',
      // La pozza di luce dove il raggio tocca terra. Sotto l'erba, che ci
      // cresce dentro: è lei a farla leggere come luce sul suolo e non come un
      // disco appoggiato sopra.
      '  float pool = exp(-pow(d / ' + CONFIG.poolRadius.toFixed(2) + ', 2.0)) * ' + CONFIG.poolStr.toFixed(2) + ' * uBeam;',
      '  vec3 col = vec3(0.004, 0.012, 0.008) + uPool * pool;',
      '  gl_FragColor = vec4(col, uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true
  });
  var ground = new THREE.Mesh(new THREE.CircleGeometry(CONFIG.grassArea + 3, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;                 // sotto la base dei fili
  scene.add(ground);

  // --------------------------------------------------------------- raggio
  var beamH = CONFIG.saucerY;
  var beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uTime, uFade: uFade, uBeam: uBeam, uCol: { value: C.beam } },
    vertexShader: 'varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform float uTime; uniform vec3 uCol; uniform float uFade; uniform float uBeam;',
      'varying vec2 vUv; varying float vY;',
      'void main(){',
      // Il cono si spegne scendendo: la luce si diluisce nel volume.
      '  float f = pow(vY, ' + CONFIG.beamFade.toFixed(2) + ');',
      // I raggi angolari che ruotano dentro il cono. Senza, il raggio è un cono
      // di tinta piatta e sembra plastica.
      '  float rays = pow(abs(sin(vUv.x * 3.14159 * ' + CONFIG.beamRayCount.toFixed(1) + ' + uTime * ' + CONFIG.beamRaySpeed.toFixed(2) + ')), ' + CONFIG.beamRaySharp.toFixed(2) + ');',
      '  float a = ' + CONFIG.beamWall.toFixed(2) + ' * f;',
      '  a += rays * ' + CONFIG.beamRayStr.toFixed(2) + ' * f * 0.5;',
      '  a += sin(vY * 22.0 - uTime * ' + CONFIG.beamSpeed.toFixed(2) + ' * 8.0) * ' + CONFIG.beamNoise.toFixed(3) + ';',
      '  gl_FragColor = vec4(uCol, max(0.0, a) * uFade * uBeam);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  var beam = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.beamTopR, CONFIG.beamBotR, beamH, 40, 1, true), beamMat);
  beam.position.y = beamH / 2;
  scene.add(beam);

  // ---------------------------------------------------------------- alone
  var haloMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: C.halo }, uFade: uFade },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uCol; uniform float uFade; varying vec2 vUv;',
      'void main(){',
      '  float d = length(vUv - 0.5) * 2.0;',
      '  float a = exp(-d * d * 3.2) * ' + CONFIG.haloStr.toFixed(2) + ';',
      '  gl_FragColor = vec4(uCol, a * uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var halo = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.haloSize, CONFIG.haloSize), haloMat);
  halo.position.y = CONFIG.saucerY;
  scene.add(halo);

  // --------------------------------------------------------------- nebbia
  var mistMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uTime, uCol: { value: C.mist }, uFade: uFade },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform float uTime; uniform vec3 uCol; uniform float uFade; varying vec2 vUv;',
      'void main(){',
      '  float band = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.55, vUv.y);',
      '  float drift = 0.5 + 0.5 * sin(vUv.x * 6.0 + uTime * ' + CONFIG.mistSpeed.toFixed(3) + ' * 6.0);',
      '  gl_FragColor = vec4(uCol, band * drift * ' + CONFIG.mistStr.toFixed(2) + ' * 0.5 * uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var mist = new THREE.Mesh(new THREE.PlaneGeometry(26, CONFIG.mistHeight * 2), mistMat);
  mist.position.set(0, CONFIG.mistHeight * 0.5, -6);
  scene.add(mist);

  // ---------------------------------------------------------------- disco
  var saucer = new THREE.Group();
  saucer.position.y = CONFIG.saucerY;
  saucer.rotation.z = CONFIG.saucerTilt;
  saucer.scale.setScalar(CONFIG.saucerScale);
  saucer.visible = false;
  scene.add(saucer);

  var hullMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null }, uFade: uFade,
      uDark: { value: CONFIG.hullDark },
      uLamp: { value: C.lamp }, uLampStr: { value: CONFIG.lampStr },
      uThresh: { value: CONFIG.lampThresh },
      uKey: { value: CONFIG.keyStr }, uAmb: { value: CONFIG.ambient }
    },
    vertexShader: [
      'varying vec2 vUv; varying vec3 vN;',
      'void main(){',
      '  vUv = uv; vN = normalize(normalMatrix * normal);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uMap; uniform float uDark; uniform vec3 uLamp;',
      'uniform float uLampStr; uniform float uThresh; uniform float uKey;',
      'uniform float uAmb; uniform float uFade;',
      'varying vec2 vUv; varying vec3 vN;',
      'void main(){',
      '  vec3 base = texture2D(uMap, vUv).rgb;',
      // È NOTTE: della fusoliera si vede pochissimo. La base color viene
      // schiacciata, e a riaccendersi sono solo i pixel sopra soglia — che
      // nella texture sono le lampade dipinte.
      '  vec3 col = base * uDark;',
      '  float lum = dot(base, vec3(0.299, 0.587, 0.114));',
      '  float lampMask = smoothstep(uThresh, uThresh + 0.14, lum);',
      '  col += uLamp * lampMask * uLampStr;',
      // Una key light debole da sopra: senza, il disco è una sagoma piatta e
      // non si capisce che è un solido.
      '  float key = max(dot(normalize(vN), normalize(vec3(-0.3, 0.9, 0.35))), 0.0);',
      '  col += base * (uAmb + key * uKey);',
      '  gl_FragColor = vec4(col, uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: true, side: THREE.DoubleSide
  });

  var glbState = 'idle', saucerGeo = null, saucerTex = null;

  /* Parser GLB, la versione allargata.
   * In `spine.js` bastavano posizioni e indici. Qui servono anche le normali,
   * le UV e le immagini che il file si porta dentro nei bufferView — che sono
   * WebP, quindi si passano al browser come Blob e le decodifica lui.
   */
  function parseGlb(buf){
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('non è un GLB');
    var off = 12, json = null, binOff = -1;
    while (off + 8 <= dv.byteLength) {
      var len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
      else if (type === 0x004E4942) binOff = off + 8;
      off += 8 + len;
    }
    if (!json || binOff < 0) throw new Error('GLB senza chunk JSON o BIN');
    var prim = json.meshes[0].primitives[0];
    if (!prim || prim.indices === undefined) throw new Error('mesh non indicizzata');

    /* Lettore di accessor che regge anche i bufferView INTERLACCIATI.
     *
     * In `spine.js` bastava rifiutarli, perché quel file non ne aveva. Questo
     * sì: passando dal decompressore Draco, gli attributi sono stati riscritti
     * intrecciati — posizione, normale e UV dello stesso vertice uno dietro
     * l'altro, e poi quelli del vertice dopo. Leggerli come se fossero
     * contigui darebbe una mesh esplosa, non un errore, ed è per questo che
     * qui c'era un `throw` invece di una lettura ottimista.
     * Quando il passo coincide con la dimensione dell'elemento i dati SONO
     * contigui, e allora si punta direttamente al buffer senza copiare niente.
     */
    function read(accIdx, Ctor, comps){
      var acc = json.accessors[accIdx], bv = json.bufferViews[acc.bufferView];
      var base = binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0);
      var bytes = Ctor.BYTES_PER_ELEMENT;
      var stride = bv.byteStride || 0;
      if (!stride || stride === bytes * comps) return new Ctor(buf, base, acc.count * comps);

      var getter = Ctor === Float32Array ? 'getFloat32'
                 : Ctor === Uint32Array  ? 'getUint32'
                 : Ctor === Uint16Array  ? 'getUint16' : 'getUint8';
      var src = new DataView(buf), out = new Ctor(acc.count * comps);
      for (var i = 0; i < acc.count; i++)
        for (var c = 0; c < comps; c++)
          out[i * comps + c] = src[getter](base + i * stride + c * bytes, true);
      return out;
    }
    var iT = json.accessors[prim.indices].componentType;
    var IdxCtor = iT === 5125 ? Uint32Array : iT === 5123 ? Uint16Array : Uint8Array;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(read(prim.attributes.POSITION, Float32Array, 3), 3));
    if (prim.attributes.NORMAL !== undefined)
      geo.setAttribute('normal', new THREE.BufferAttribute(read(prim.attributes.NORMAL, Float32Array, 3), 3));
    else geo.computeVertexNormals();
    if (prim.attributes.TEXCOORD_0 !== undefined)
      geo.setAttribute('uv', new THREE.BufferAttribute(read(prim.attributes.TEXCOORD_0, Float32Array, 2), 2));
    geo.setIndex(new THREE.BufferAttribute(read(prim.indices, IdxCtor, 1), 1));
    geo.center();

    // La base color, presa dal bufferView e data al browser come Blob. Il
    // materiale la usa sia per il colore sia per trovare le lampade.
    var tex = null;
    var mat = json.materials && json.materials[0];
    var texIdx = mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
    if (texIdx) {
      var t = json.textures[texIdx.index];
      var src = t.source !== undefined ? t.source
              : (t.extensions && t.extensions.EXT_texture_webp && t.extensions.EXT_texture_webp.source);
      if (src !== undefined) {
        var img = json.images[src], bv2 = json.bufferViews[img.bufferView];
        var bytes = new Uint8Array(buf, binOff + (bv2.byteOffset || 0), bv2.byteLength);
        var url = URL.createObjectURL(new Blob([bytes], { type: img.mimeType || 'image/webp' }));
        tex = new THREE.TextureLoader().load(url, function(){ URL.revokeObjectURL(url); });
        tex.flipY = false;                    // glTF ha l'origine UV in alto
        tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
      }
    }
    return { geo: geo, tex: tex };
  }

  function loadSaucer(){
    if (glbState !== 'idle') return;
    glbState = 'loading';
    fetch(CONFIG.glbSrc).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function(buf){
      var out = parseGlb(buf);
      saucerGeo = out.geo; saucerTex = out.tex;
      hullMat.uniforms.uMap.value = out.tex;
      saucer.add(new THREE.Mesh(out.geo, hullMat));
      saucer.visible = true;
      glbState = 'ready';
    }).catch(function(err){
      glbState = 'failed';
      console.error('[WC] disco non caricato: ' + CONFIG.glbSrc, err);
    });
  }

  // ---------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, fade = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();
  var mx = 0, my = 0, tmx = 0, tmy = 0;

  function resize(){
    var r = pin.getBoundingClientRect();
    rect.w = Math.max(1, r.width); rect.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.w, rect.h, false);
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();
    uRes.value.set(rect.w * dpr, rect.h * dpr);
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var t = now / 1000;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    fade = Math.min(1, fade + dt / 1.1);
    uTime.value = t; uFade.value = fade;

    // Il disco galleggia e gira lentamente. Questo SÌ va nel tempo e non nello
    // scroll: un oggetto che sta fermo appeso in aria è un fermo immagine, e
    // il galleggiamento è quello che dice che sta volando.
    var bob = Math.sin(t * CONFIG.bobSpeed) * CONFIG.bobAmount;
    saucer.position.y = CONFIG.saucerY + bob;
    saucer.rotation.y = t * CONFIG.saucerSpin;
    halo.position.y = saucer.position.y;
    halo.quaternion.copy(camera.quaternion);

    // Lo scroll avvicina la camera e accende il raggio.
    uBeam.value = G.clamp01((scroll - 0.08) / 0.32);
    mx += (tmx - mx) * G.damp(0.09, dt);
    my += (tmy - my) * G.damp(0.09, dt);
    camera.position.set(mx * CONFIG.parallax, CONFIG.camY + my * CONFIG.parallax * 0.5,
                        CONFIG.camZ - scroll * CONFIG.scrollDolly);
    camera.lookAt(0, CONFIG.camTargetY, 0);

    renderer.render(scene, camera);
  }

  function start(){ if (running || document.hidden || glbState === 'failed') return;
    loadSaucer(); running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  var onMove = function(e){
    tmx = (e.clientX / window.innerWidth - 0.5) * 2;
    tmy = -(e.clientY / window.innerHeight - 0.5) * 2;
  };

  section.classList.add('-live');
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
  var onVis = function(){ if (document.hidden) stop(); else if (stLife.isActive) start(); };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  if (ctx.desktop) document.addEventListener('mousemove', onMove);

  return function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('mousemove', onMove);
    [skyMat, grassMat, groundMat, beamMat, haloMat, mistMat, hullMat].forEach(function(m){ m.dispose(); });
    [sky, grass, ground, beam, halo, mist].forEach(function(o){ o.geometry.dispose(); });
    if (saucerGeo) saucerGeo.dispose();
    if (saucerTex) saucerTex.dispose();
    grassDiff.dispose(); grassAlpha.dispose();
    renderer.dispose();
    section.classList.remove('-live');
  };
});
