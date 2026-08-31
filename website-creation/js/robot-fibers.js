/* CAP 05 — fibre luminose lungo le braccia ("i fasci").
 *
 * REWORK (Task 6, dopo revisione): la prima versione ancorava le curve ai
 * tre `joints` di WC.robotParts.split (Task 2) — shoulder/elbow/wrist sono
 * lì SOLO il centro X/Z del bounding-box dell'intero gruppo-braccio, quindi
 * una linea perfettamente VERTICALE (shoulder.x === elbow.x === wrist.x)
 * dentro un braccio che invece si piega in X. Risultato a schermo: barre
 * dritte fluttuanti fra braccio e busto, sempre in vista (depthTest:false),
 * mai sulla superficie del braccio — vedi task-6-report.md, sezione
 * "Concerns" della prima consegna.
 *
 * Questa versione ricava il percorso DIRETTAMENTE dalla mesh del braccio:
 *
 * 1. Si campionano i vertici reali (spazio MODEL-LOCALE, ogni mesh-braccio è
 *    figlia diretta di `model` — gerarchia piatta, vedi robot-parts.js — si
 *    applica `mesh.matrix`, la trasformazione locale rispetto a quel
 *    parent).
 * 2. Si usa la direzione shoulder→wrist (`joints`, Task 2) solo come SEME
 *    dell'asse lungo cui affettare — non come percorso. Si affettano i
 *    vertici in ~9 fette lungo quell'asse; il CENTROIDE reale di ogni fetta
 *    (media dei vertici che ci cadono dentro) segue la vera sezione del
 *    braccio in quel punto, piega inclusa — a differenza della linea dei
 *    giunti, il centroide si sposta in X quando il braccio si piega in X.
 * 3. Ogni centroide viene spinto verso l'esterno (superficie visibile del
 *    braccio, non il suo asse interno) lungo una direzione fissa per
 *    braccio — "lontano dal busto, leggermente verso la camera" — di una
 *    distanza pari all'estensione reale dei vertici di quella fetta in
 *    quella direzione (l'80° percentile delle proiezioni, non il vertice
 *    più lontano in assoluto, per non farsi tirare fuori da un singolo
 *    vertice di dettaglio/bullone).
 * 4. Da questa polilinea "in superficie" si costruiscono 2 tubi Catmull-Rom
 *    vicini (fascio stretto, non barre larghe), con `depthTest` NORMALE —
 *    ora che le fibre corrono davvero sulla pelle del braccio hanno senso
 *    fisico rispetto al resto della scena: quando il robot ruota, il
 *    braccio lontano nasconde le proprie fibre dietro il busto.
 *
 * Il modulo consuma `{ joints, armL, armR }`: `joints` (Task 2) resta il
 * seme dell'asse per lato, `armL`/`armR` (le mesh-braccio vere, anch'esse
 * da WC.robotParts.split) sono la nuova dipendenza — servono per campionare
 * i vertici. robot.js aggiunge `object` come figlio di `model` (stesso
 * parent delle mesh-braccio) e ogni frame chiama `update(dt, surgeL,
 * surgeR)` col segnale di raycast sulle braccia (vedi tick() in robot.js).
 * Essendo figlie di `model`, le fibre restano incollate alle braccia sotto
 * qualunque rotazione del `wrap` (drag, Task 7): tutto il calcolo qui sopra
 * lavora in coordinate MODEL-LOCALI (le stesse di `joints` e delle mesh).
 */
window.WC = window.WC || {};

WC.robotFibers = (function () {
  var TUBULAR_SEGMENTS = 40;
  var RADIAL_SEGMENTS = 6;
  // Quante fette lungo l'asse spalla→polso (brief: 8-10). Ogni fetta con
  // <3 vertici campionati è scartata (centroide inaffidabile) — la curva
  // resta comunque continua sulle fette valide, CatmullRom non richiede
  // punti equispaziati.
  var SLICE_COUNT = 9;
  // Raggio del tubo come frazione della lunghezza del braccio — dimezzato
  // ancora rispetto alla prima consegna (0.014): ora che le fibre sono in
  // superficie (non più "sepolte" nel volume del braccio, vedi depthTest
  // sotto) un tubo sottile legge già come filo acceso; uno spesso come
  // prima leggerebbe come un cavo esterno grosso, non un vena sottile.
  var TUBE_RADIUS_FACTOR = 0.006;
  // Percentile (non il massimo) usato per stimare quanto una fetta si
  // estende verso l'esterno lungo la direzione scelta — vedi
  // `offsetToSurface`: robusto a un singolo vertice fuori scala (bullone,
  // dettaglio) che altrimenti spingerebbe il centroide ben oltre la
  // superficie reale.
  var SURFACE_PERCENTILE = 0.8;

  var VERT = [
    'varying vec2 vUv;',
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
    '  vNormalW = normalize(mat3(modelMatrix) * normal);',
    '  vViewDir = normalize(cameraPosition - worldPos.xyz);',
    '  gl_Position = projectionMatrix * viewMatrix * worldPos;',
    '}'
  ].join('\n');

  // uv.x (three.js TubeGeometry) è la coordinata LUNGO il tubo, 0 al primo
  // punto della curva (lato spalla) e 1 all'ultimo (lato polso) —
  // esattamente la `u` della spec.
  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'uniform float uTime;',
    'uniform float uSurge;',
    'uniform float uSpeed;',
    'uniform float uBaseline;',
    'uniform vec3 uColorCold;',
    'uniform vec3 uColorHot;',
    'void main() {',
    '  float speed = uSpeed * (1.0 + uSurge * 3.0);',
    '  float repeats = 3.0;',
    '  float phase = fract(vUv.x * repeats - uTime * speed);',
    '  float band = pow(clamp(1.0 - abs(phase - 0.5) * 2.0, 0.0, 1.0), 5.0);',
    '  vec3 N = normalize(vNormalW);',
    '  vec3 V = normalize(vViewDir);',
    '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);',
    '  float intensity = uBaseline + band * (0.14 + uSurge * 1.35) + fres * (0.06 + uSurge * 0.3);',
    '  vec3 col = mix(uColorCold, uColorHot, clamp(uSurge * 0.7 + band * 0.3, 0.0, 1.0));',
    '  gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 1.0));',
    '}'
  ].join('\n');

  function makeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSurge: { value: 0 },
        uSpeed: { value: 0.22 },
        uBaseline: { value: 0.16 },
        uColorCold: { value: new THREE.Vector3(1.0, 0.63, 0.38) },  // ~0xffa060, rame
        uColorHot: { value: new THREE.Vector3(1.0, 0.93, 0.8) }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // REWORK Task 6: depthTest torna NORMALE (era false). Con le fibre
      // ancorate alla linea verticale dei giunti (dentro il volume del
      // braccio) l'occlusione fisica le rendeva quasi sempre invisibili —
      // da qui la scelta precedente. Ora che il percorso è ricavato dalla
      // mesh vera e spinto sulla sua superficie visibile (vedi
      // offsetToSurface più sotto), l'occlusione fisica è quella corretta:
      // quando il robot ruota, il braccio lontano nasconde le proprie
      // fibre dietro il busto, esattamente come farebbe un filo vero
      // incollato alla pelle del braccio.
      depthTest: true,
      // Le fibre corrono a ridosso della superficie reale (offset piccolo,
      // frazione del raggio del tubo): un polygonOffset negativo (spinge
      // verso la camera nello z-buffer) evita z-fighting a schermo nei
      // punti dove il tubo sfiora la mesh del braccio, senza rinunciare al
      // depth test vero e proprio.
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }

  // Campiona tutti i vertici delle mesh-braccio in coordinate MODEL-LOCALI
  // (mesh.matrix: trasformazione locale rispetto al parent, che per le
  // mesh-braccio È `model` — gerarchia piatta, vedi robot-parts.js).
  function sampleArmVertices(meshes) {
    var pts = [];
    var v = new THREE.Vector3();
    meshes.forEach(function (mesh) {
      var geo = mesh.geometry;
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      // matrixAutoUpdate ricalcola .matrix da position/quaternion/scale solo
      // dentro updateMatrixWorld(); a questo punto della sequenza di mount()
      // (subito dopo il primo Box3().setFromObject(model), che ha già
      // percorso l'albero) .matrix è affidabile, ma un updateMatrix()
      // esplicito è a costo zero e toglie ogni dipendenza dall'ordine delle
      // chiamate a monte.
      mesh.updateMatrix();
      var pos = geo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
        pts.push(v.clone());
      }
    });
    return pts;
  }

  // Affetta i vertici lungo l'asse shoulder→wrist (seme, non percorso) e
  // ritorna, per ogni fetta valida, { point: centroide, verts: vertici
  // della fetta } — servono entrambi: il centroide per il percorso, i
  // vertici grezzi per stimare quanto spingerlo verso la superficie
  // (offsetToSurface).
  function sliceArm(meshes, shoulder, wrist, sliceCount) {
    var axis = new THREE.Vector3().subVectors(wrist, shoulder);
    var armLen = axis.length();
    if (armLen < 1e-4) return null; // giunti degeneri (braccio vuoto)
    axis.normalize();

    var verts = sampleArmVertices(meshes);
    if (verts.length < sliceCount * 3) return null; // troppo pochi vertici per un binning affidabile

    var bins = [];
    for (var i = 0; i < sliceCount; i++) bins.push([]);
    verts.forEach(function (v) {
      var t = v.clone().sub(shoulder).dot(axis);
      if (t < 0 || t > armLen) return; // fuori dallo span spalla→polso: non oltre la mano
      var bin = Math.min(sliceCount - 1, Math.floor((t / armLen) * sliceCount));
      bins[bin].push(v);
    });

    var slices = [];
    bins.forEach(function (bin) {
      if (bin.length < 3) return; // fetta troppo scarsa: salto, la curva resta continua sulle altre
      var c = new THREE.Vector3();
      bin.forEach(function (v) { c.add(v); });
      c.multiplyScalar(1 / bin.length);
      slices.push({ point: c, verts: bin });
    });
    if (slices.length < 3) return null;
    // Task 7 (nit): `armLen` (già calcolato sopra per il binning) viaggia
    // appeso all'array — un array resta un oggetto normale in JS, la
    // proprietà extra non disturba `.length`/`.forEach`/`.map` di chi lo
    // consuma — così buildArm() lo rilegge invece di ricalcolare
    // `shoulder.distanceTo(wrist)`, la stessa identica distanza.
    slices.armLen = armLen;
    return slices;
  }

  // Spinge ogni centroide verso l'esterno lungo `dir` (fissa per braccio:
  // lontano dal busto, un po' verso la camera) di una distanza pari
  // all'estensione reale della fetta in quella direzione (percentile
  // robusto delle proiezioni dei suoi vertici, vedi SURFACE_PERCENTILE),
  // più una piccola spinta extra così il tubo (che ha un suo raggio) sporge
  // per lo più FUORI dalla mesh — leggibile — invece che restarne per metà
  // dentro.
  function offsetToSurface(slices, dir, extraPush) {
    return slices.map(function (s) {
      var proj = s.verts.map(function (v) { return v.clone().sub(s.point).dot(dir); })
        .sort(function (a, b) { return a - b; });
      var idx = Math.min(proj.length - 1, Math.floor(proj.length * SURFACE_PERCENTILE));
      var dist = Math.max(0, proj[idx]);
      return s.point.clone().addScaledVector(dir, dist + extraPush);
    });
  }

  // Costruisce il fascio di 2 tubi vicini (fascio stretto, non barre
  // larghe) attorno alla polilinea "in superficie": ad ogni punto calcola
  // la tangente locale (differenza coi vicini) e una direzione "laterale"
  // (perpendicolare sia alla tangente sia a `dir`, cioè che cammina lungo
  // la superficie, non sopra/sotto) su cui sposta i due fili di un piccolo
  // offset simmetrico.
  function buildArmFibers(surfacePoints, dir, radius, material, group) {
    if (surfacePoints.length < 3) return;
    var sideOffset = radius * 3.0;
    [-1, 1].forEach(function (sign) {
      var pts = surfacePoints.map(function (p, i) {
        var prev = surfacePoints[Math.max(0, i - 1)];
        var next = surfacePoints[Math.min(surfacePoints.length - 1, i + 1)];
        var tangent = new THREE.Vector3().subVectors(next, prev);
        if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0); else tangent.normalize();
        var side = new THREE.Vector3().crossVectors(tangent, dir);
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0); else side.normalize();
        return p.clone().addScaledVector(side, sign * sideOffset);
      });
      var curve = new THREE.CatmullRomCurve3(pts);
      var geo = new THREE.TubeGeometry(curve, TUBULAR_SEGMENTS, radius, RADIAL_SEGMENTS, false);
      var mesh = new THREE.Mesh(geo, material);
      group.add(mesh);
    });
  }

  // Costruisce il percorso+fascio per un braccio; ritorna false se la
  // mesh non ha dato abbastanza vertici per un binning affidabile (braccio
  // vuoto o mesh anomala) — il chiamante lascia il gruppo vuoto in quel
  // caso, nessuna geometria NaN.
  function buildArm(meshes, shoulder, wrist, material, group) {
    if (!shoulder || !wrist || !meshes || !meshes.length) return false;
    var slices = sliceArm(meshes, shoulder, wrist, SLICE_COUNT);
    if (!slices) return false;

    var radius = slices.armLen * TUBE_RADIUS_FACTOR;
    // Direzione fissa per braccio: lontano dal busto (X, segno secondo il
    // lato) e un po' verso la camera (+Z, la camera sta su +Z guardando
    // verso l'origine — vedi mount() in robot.js). Non ruota fetta per
    // fetta (una normale locale vera richiederebbe una vera mesh di
    // sezione, non disponibile): per un braccio che si piega soprattutto
    // in X (vedi nota Task 2/task-2-report.md) resta una buona
    // approssimazione della faccia esterna/frontale visibile.
    var side = shoulder.x < 0 ? -1 : 1;
    var dir = new THREE.Vector3(side * 0.55, 0.05, 0.85).normalize();

    var surfacePoints = offsetToSurface(slices, dir, radius * 0.6);
    buildArmFibers(surfacePoints, dir, radius, material, group);
    return true;
  }

  return {
    /**
     * @param {Object} input
     * @param {Object} input.joints - parts.joints da WC.robotParts.split:
     *   Vector3 MODEL-LOCALI {shoulderL, wristL, shoulderR, wristR, ...} —
     *   usati solo come SEME dell'asse lungo cui affettare, non come
     *   percorso (vedi sliceArm).
     * @param {THREE.Mesh[]} input.armL - mesh-braccio sinistro, da
     *   WC.robotParts.split (parts.armL) — campionate per il percorso reale.
     * @param {THREE.Mesh[]} input.armR - mesh-braccio destro (parts.armR).
     * @returns {{object: THREE.Object3D, update: function(dt, surgeL, surgeR)}}
     */
    create: function (input) {
      input = input || {};
      var joints = input.joints || {};
      var armL = input.armL || [];
      var armR = input.armR || [];

      var object = new THREE.Group();
      object.name = 'robotFibers';

      var matL = makeMaterial();
      var matR = makeMaterial();

      var groupL = new THREE.Group();
      var groupR = new THREE.Group();
      object.add(groupL, groupR);

      buildArm(armL, joints.shoulderL, joints.wristL, matL, groupL);
      buildArm(armR, joints.shoulderR, joints.wristR, matR, groupR);

      var time = 0;
      function update(dt, surgeL, surgeR) {
        time += dt || 0;
        matL.uniforms.uTime.value = time;
        matR.uniforms.uTime.value = time;
        matL.uniforms.uSurge.value = surgeL || 0;
        matR.uniforms.uSurge.value = surgeR || 0;
      }

      return { object: object, update: update };
    }
  };
})();
