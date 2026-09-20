/* CAP 05 — fibre luminose DENTRO le braccia ("i fasci").
 *
 * Il percorso si ricava dalle mesh-braccio vere (`parts.armL`/`parts.armR` da
 * WC.robotParts.split), in coordinate MODEL-LOCALI — le stesse in cui vivono
 * le mesh, che sono figlie dirette di `model` (gerarchia piatta). robot.js
 * aggiunge `object` come figlio dello STESSO `model`, così le fibre restano
 * incollate alle braccia, e ogni fotogramma chiama `update(dt, surgeL,
 * surgeR)` col segnale del raycast sulle braccia (vedi tick() in robot.js).
 *
 * Come nasce il percorso, per lato:
 *  1. si campionano i vertici, ognuno marcato con la PIASTRA da cui viene
 *     (`sampleArmVertices`): il braccio è un'armatura di pezzi staccati, e
 *     sapere di quale pezzo è un vertice è ciò che tiene il percorso dentro
 *     la materia;
 *  2. l'asse è il segmento fra il baricentro del 5% di vertici più alto e
 *     quello del 5% più basso (`armAxis`) — la spalla e la mano vere, non il
 *     bbox del gruppo;
 *  3. i vertici si affettano lungo quell'asse su TUTTA la loro escursione, e
 *     ogni fetta dà un punto: la mediana della piastra che continua quella
 *     della fetta prima (`puntoDellaFetta`);
 *  4. il punto si porta DENTRO il volume, a (1 − `rientro`) del raggio locale
 *     misurato sui vertici di quella fetta (`offsetInside`);
 *  5. da lì due tubi Catmull-Rom vicini (`buildArmFibers`), con `depthTest`
 *     normale: il braccio lontano nasconde le proprie fibre dietro il busto.
 *
 * Storia, perché non si ripeta: le prime tre versioni ancoravano il percorso
 * ai `joints` di robot-parts.js (shoulder/elbow/wrist = centro X/Z del bbox
 * del gruppo). Erano una linea verticale dentro un braccio che si piega, ed
 * erano in coordinate MONDO mentre i vertici si campionano in model-locale:
 * mescolare i due frame sbagliava di un vettore costante per lato, e la fibra
 * deviava. Oggi `joints` non viene più nemmeno chiesto, e l'asse esce dagli
 * stessi vertici del percorso: un secondo frame da cui sbagliare non esiste.
 *
 * Simmetrico per costruzione: nessun ramo per-braccio: `buildArm()` gira una
 * volta per lato con lo stesso codice.
 */
window.WC = window.WC || {};

WC.robotFibers = (function () {
  /* ------------------------------------------------------------------ TASK B2
   * «le fibre ora non sono dentro le braccia, ma sono fuori e non sono nemmeno
   * lungo tutti i bracci» — e «non è un flusso che scorre», «il colore non va
   * bene». Tre difetti, tre rimedi, tutti tarabili da qui sotto: Nike ha
   * annunciato una nuova inquadratura (robot più grande, tagliato sopra le
   * gambe) e questi numeri andranno rivisti a schermo, non cercati in mezzo al
   * codice.
   *
   * 1. FUORI DAL BRACCIO. Prima il percorso veniva spinto SULLA superficie
   *    visibile (`offsetToSurface`, più il raggio del tubo e lo scostamento
   *    fra i due fili): sull'orlo, e con la posa Spline che ruota gli
   *    avambracci, sbordava. Ora il punto sta DENTRO il volume, a
   *    (1 − `rientro`) del raggio locale della fetta: si vede lo stesso perché
   *    il braccio si apre (ARM_REVEAL), e non può sbordare perché il raggio
   *    locale è misurato sui vertici veri di quella fetta.
   * 2. NON COPRE TUTTO IL BRACCIO. Prima il percorso nasceva dai `joints`
   *    (bbox del gruppo) e si fermava al gomito (`ARM_END_FRACTION` 0.72, più
   *    un taglio prima della mano): spalla e mano restavano scoperte. Ora
   *    l'asse si ricava dai VERTICI (baricentro delle fette estreme) e le
   *    fette coprono tutta l'escursione dei vertici lungo quell'asse — dalla
   *    spalla alla mano. `joints` non serve più a niente e non viene più
   *    chiesto.
   * 3. NON SCORRE. Prima la fase era `uTime * speed` con `speed` funzione del
   *    surge: mentre il surge saliva, la stessa `uTime` veniva rimoltiplicata
   *    e il disegno SALTAVA avanti e indietro invece di scorrere. Ora la fase
   *    si integra in JS (`phase += dt * velocità`), così la velocità può
   *    cambiare senza che il motivo si sposti di colpo.
   */
  var CONFIG = {
    // --- percorso -----------------------------------------------------------
    // Quante fette lungo l'asse del braccio. Più fette = percorso che segue
    // meglio la piega; sotto le ~10 la mano e la spalla si tagliano gli angoli.
    slices: 16,
    // Quante passate di lisciatura (media a tre punti) sul percorso. Le fette
    // cambiano pezzo strada facendo — placca della spalla, bicipite,
    // avambraccio, mano — e a ogni cambio il punto fa un gradino: una passata
    // lo toglie senza appiattire la piega vera del braccio.
    lisciature: 1,
    // Quanto la fibra RIENTRA dalla superficie, in frazione del raggio locale
    // della fetta: 0 = sulla pelle, 1 = sull'asse. A 0.55 il filo sta poco
    // sotto la metà del raggio — abbastanza fuori asse da leggersi come una
    // vena, abbastanza dentro da non sfiorare mai il profilo. Alzato da 0.45
    // per un motivo misurato e non estetico: al polso il braccio si strozza
    // (la sagoma ha una strizione fra avambraccio e mano) e a 0.45 il margine
    // minimo scendeva a 3 px a 1280×720, sotto la soglia.
    rientro: 0.55,
    // Raggio del tubo (in frazione della lunghezza del braccio) e distanza fra
    // i due fili (in raggi del tubo). Assottigliati da 0.005/2.4: la fibra è
    // DUE tubi, e l'ingombro totale a schermo è ciò che consuma il margine
    // dentro la mano — a 0.005/2.4 il margine minimo era 2 px.
    tubeRadius: 0.0032,
    sideOffset: 1.8,
    // Quanto si accorcia ai due capi, in frazione della lunghezza del braccio.
    // Tenuti a ZERO: la corrente deve partire dall'attacco della spalla e
    // arrivare alla mano, ed è così che la copertura misurata sta a 0,93.
    // Restano come manopola per la nuova inquadratura.
    trimTop: 0.0,
    trimBottom: 0.0,
    // --- flusso -------------------------------------------------------------
    pulses: 2.0,          // impulsi per braccio (Task B2: due)
    speed: 0.28,          // periodi al secondo a braccio appena acceso
    speedSurge: 1.5,      // quanto accelera a surge pieno
    rise: 0.07,           // fronte dell'impulso, in frazione del periodo (ripido)
    tailK: 4.5,           // quanto in fretta si spegne la coda (più basso = più lunga)
    pulseGain: 1.35,      // intensità della cresta
    baseline: 0.12,       // filo di base continuo, SOLO a braccio aperto
    rim: 0.18,            // quanto il bordo del tubo si accende (dà volume al filo)
    // Azzurro del sito; la cresta dell'impulso schiarisce verso il bianco.
    colorCold: '#3fb9ff',
    colorHot: '#eaf8ff'
  };

  var TUBULAR_SEGMENTS = 64;
  var RADIAL_SEGMENTS = 6;

  // sRGB → lineare, stessa formula di `hexToLinear` in js/pointbrain.js e
  // js/pointorb.js (lì è privata del modulo, non esportata). Il resto della
  // scena è in lineare: passare i byte grezzi darebbe un azzurro diverso da
  // quello del cervello e della sfera, che è esattamente ciò che si vuole
  // evitare — «il colore del sito» dev'essere UN colore solo.
  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function hexToLinear(hex) {
    var n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(srgbToLinear(((n >> 16) & 255) / 255),
      srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255));
  }
  // Percentile (non il massimo) con cui si stima il RAGGIO LOCALE di una
  // fetta: robusto a un singolo vertice fuori scala (un bullone, un dettaglio)
  // che altrimenti allargherebbe la sezione ben oltre quella vera — e qui il
  // raggio locale è ciò che tiene la fibra dentro il braccio, quindi
  // sovrastimarlo è esattamente l'errore da non fare.
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
  // punto della curva (lato spalla) e 1 all'ultimo (lato mano).
  //
  // Task B2 — la corrente che scorre. `uPhase` non è più «tempo × velocità»
  // calcolato qui dentro (vedi il punto 3 in testa al file: con la velocità
  // che cambia col surge, il motivo saltava invece di scorrere) ma una fase
  // già integrata in JS. L'impulso è asimmetrico: fronte ripido sulla testa
  // (q = 0, il punto che avanza verso la mano) e coda esponenziale dietro,
  // cioè verso la spalla — una cometa, non una banda simmetrica.
  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'varying vec3 vNormalW;',
    'varying vec3 vViewDir;',
    'uniform float uPhase;',
    'uniform float uSurge;',
    'uniform float uPulses;',
    'uniform float uRise;',
    'uniform float uTailK;',
    'uniform float uPulseGain;',
    'uniform float uBaseline;',
    'uniform float uRim;',
    'uniform vec3 uColorCold;',
    'uniform vec3 uColorHot;',
    'void main() {',
    // q cresce andando verso la SPALLA: q = 0 è la testa dell'impulso (il
    // fronte, verso la mano), q grande è la coda che si allunga dietro.
    '  float q = fract(uPhase - vUv.x * uPulses);',
    '  float pulse = smoothstep(0.0, uRise, q) * exp(-q * uTailK);',
    '  vec3 N = normalize(vNormalW);',
    '  vec3 V = normalize(vViewDir);',
    '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);',
    // Tutto si spegne col surge: a riposo il braccio è chiuso e non c'è niente
    // da vedere (regola del piano: niente disegnato a riposo). Il filo di base
    // c'è SOLO a braccio aperto, ed è quello che fa leggere il percorso intero
    // anche fra un impulso e l'altro.
    '  float acceso = smoothstep(0.0, 0.08, uSurge);',
    '  float intensity = (uBaseline + pulse * uPulseGain + fres * uRim) * acceso * (0.35 + 0.65 * uSurge);',
    // L'azzurro è il colore del filo; a schiarire verso il bianco è SOLO la
    // cresta dell'impulso, non tutto il braccio quando il surge sale.
    '  vec3 col = mix(uColorCold, uColorHot, clamp(pulse * 1.2, 0.0, 1.0));',
    '  gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 1.0));',
    '}'
  ].join('\n');

  function makeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0 },
        uSurge: { value: 0 },
        uPulses: { value: CONFIG.pulses },
        uRise: { value: CONFIG.rise },
        uTailK: { value: CONFIG.tailK },
        uPulseGain: { value: CONFIG.pulseGain },
        uBaseline: { value: CONFIG.baseline },
        uRim: { value: CONFIG.rim },
        // Azzurro del sito, decodificato in lineare come il cervello e la
        // sfera (vedi hexToLinear sopra): #3fb9ff grezzo darebbe un azzurro
        // più slavato di quello delle altre due zone.
        uColorCold: { value: hexToLinear(CONFIG.colorCold) },
        uColorHot: { value: hexToLinear(CONFIG.colorHot) }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // depthTest NORMALE: il braccio lontano deve continuare a nascondere le
      // proprie fibre dietro il busto. Funziona anche ora che la fibra sta
      // DENTRO il braccio perché il guscio del braccio, mentre è aperto, non
      // scrive più depth (setArmReveal in robot-spline-materials.js): la fibra
      // si vede attraverso la sua stessa manica, ma non attraverso il torso.
      depthTest: true,
      // Qui c'era un polygonOffset negativo: serviva quando il tubo SFIORAVA
      // la pelle del braccio (z-fighting). Ora corre dentro il volume, a un
      // terzo di raggio dalla superficie: non c'è più niente da sfiorare, e un
      // offset che spinge verso la camera rischierebbe solo di farlo
      // affiorare.
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }

  // Campiona i vertici in coordinate MODEL-LOCALI (relative a `model`, che è
  // il parent DIRETTO di ogni mesh-braccio — gerarchia piatta CONFERMATA:
  // verificato `mesh.parent === model` su una pagina viva, vero). Si usa la
  // trasformazione COMPLETA `model.matrixWorld` invertita × `mesh.matrixWorld`
  // (equivalente a `mesh.matrix`, un solo livello, VERIFICATO che dà lo
  // stesso risultato identico dato che il parent è già `model` — ma scritta
  // così resta corretta anche se in futuro un export del GLB introducesse
  // un livello in mezzo). Chi consuma questi vertici (`buildArm`) converte
  // ANCHE `joints` (shoulder/wrist) allo stesso frame model-locale prima di
  // usarli — vedi `buildArm` per il perché era il pezzo mancante vero (i
  // `joints` da soli sono in coordinate MONDO, non model-locali).
  // Ogni punto porta `pezzo`: l'indice della mesh da cui viene. Il braccio non
  // è un tubo solo, è un'armatura di piastre staccate (deltoide, connettore
  // della spalla, avambraccio, mano...), e sapere di quale piastra è un
  // vertice è ciò che permette a una fetta di seguire il pezzo PRINCIPALE
  // invece di mediare fra due pezzi distinti — vedi `sliceArm`.
  function sampleArmVertices(meshes, model) {
    var pts = [];
    var v = new THREE.Vector3();
    model.updateMatrixWorld(true);
    var invModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
    meshes.forEach(function (mesh, idx) {
      var geo = mesh.geometry;
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      mesh.updateMatrixWorld(true);
      // Trasformazione mesh→model (non solo mesh→genitore diretto): risolve
      // qualunque numero di Group intermedi fra `model` e la mesh.
      var localMat = new THREE.Matrix4().multiplyMatrices(invModel, mesh.matrixWorld);
      var pos = geo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var p = v.fromBufferAttribute(pos, i).applyMatrix4(localMat).clone();
        p.pezzo = idx;
        pts.push(p);
      }
    });
    return pts;
  }

  // Task B2 — l'ASSE REALE del braccio, ricavato dai vertici. Prima l'asse era
  // la linea `shoulder`→`wrist` dei `joints` (robot-parts.js), cioè il centro
  // X/Z del bbox dell'intero gruppo: una verticale perfetta, che con la posa
  // Spline (avambracci ruotati) non è l'asse del braccio ma la sua ombra
  // verticale. Qui si prende il baricentro del 5% di vertici più in alto e di
  // quello più in basso: due punti veri, dentro la materia, uno all'attacco
  // della spalla e uno in fondo alla mano.
  // Il punto della fetta: la mediana della PIASTRA che continua quella della
  // fetta precedente. Il braccio è un'armatura di pezzi staccati e a certe
  // altezze una fetta ne prende due — il deltoide e il connettore che va verso
  // il busto — separati, in proiezione, da un vuoto vero. Media e mediana su
  // tutti i vertici cadono FRA i due, cioè nel vuoto, e la fibra ci passa in
  // mezzo: misurato, usciva dalla sagoma del robot per 307 px (media) e 151
  // (mediana su tutto). Scegliere ogni volta il pezzo con più materia è
  // peggio ancora (471): il percorso salta da una piastra all'altra a ogni
  // cambio di maggioranza. Il criterio giusto è la CONTINUITÀ — si resta sul
  // pezzo che sta più vicino a dove eravamo — e per la prima fetta (in cima,
  // dove c'è solo la calotta della spalla) quello con più materia.
  function puntoDellaFetta(bin, prec) {
    var per = {};
    bin.forEach(function (v) { (per[v.pezzo] || (per[v.pezzo] = [])).push(v); });
    var cand = Object.keys(per).filter(function (k) { return per[k].length >= 3; })
      .map(function (k) { return { n: per[k].length, p: mediana(per[k]) }; });
    if (!cand.length) return mediana(bin);
    if (!prec) {
      cand.sort(function (a, b) { return b.n - a.n; });
      return cand[0].p;
    }
    cand.sort(function (a, b) { return a.p.distanceToSquared(prec) - b.p.distanceToSquared(prec); });
    return cand[0].p;
  }

  // Mediana componente per componente di un insieme di punti. Non è un punto
  // dell'insieme, ma con una sezione di braccio (un pezzo grosso, al più
  // qualche dettaglio attorno) cade dentro la materia, che è ciò che serve.
  function mediana(pts) {
    var m = function (asse) {
      var a = pts.map(function (v) { return v[asse]; }).sort(function (x, y) { return x - y; });
      var h = a.length >> 1;
      return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
    };
    return new THREE.Vector3(m('x'), m('y'), m('z'));
  }

  function armAxis(verts) {
    var byY = verts.slice().sort(function (a, b) { return b.y - a.y; });
    var n = Math.max(3, Math.round(verts.length * 0.05));
    var top = new THREE.Vector3(), bottom = new THREE.Vector3();
    for (var i = 0; i < n; i++) { top.add(byY[i]); bottom.add(byY[byY.length - 1 - i]); }
    top.multiplyScalar(1 / n); bottom.multiplyScalar(1 / n);
    var axis = new THREE.Vector3().subVectors(bottom, top);
    if (axis.lengthSq() < 1e-8) return null;
    return { axis: axis.normalize(), origin: top };
  }

  // Affetta i vertici lungo l'asse reale e ritorna, per ogni fetta valida,
  // { point: centroide, verts: vertici della fetta } — servono entrambi: il
  // centroide per il percorso, i vertici grezzi per misurare il raggio locale
  // (offsetInside).
  //
  // Task B2 — COPERTURA. Le fette coprono tutta l'escursione VERA dei vertici
  // lungo l'asse (da `tMin` a `tMax`), meno gli eventuali trim di CONFIG:
  // prima si fermavano a una frazione indovinata (0.72 del taglio-polso,
  // cioè al gomito) e spalla e mano restavano scoperte. Così la copertura è
  // completa per costruzione, non per taratura.
  function sliceArm(meshes, sliceCount, model) {
    var verts = sampleArmVertices(meshes, model);
    if (verts.length < sliceCount * 3) return null; // troppo pochi vertici per un binning affidabile
    var A = armAxis(verts);
    if (!A) return null;
    var axis = A.axis, origin = A.origin;

    var ts = new Array(verts.length), tMin = Infinity, tMax = -Infinity;
    for (var i = 0; i < verts.length; i++) {
      var t = verts[i].x * axis.x + verts[i].y * axis.y + verts[i].z * axis.z
        - (origin.x * axis.x + origin.y * axis.y + origin.z * axis.z);
      ts[i] = t;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
    }
    var span = tMax - tMin;
    if (span < 1e-4) return null;
    var t0 = tMin + span * CONFIG.trimTop, t1 = tMax - span * CONFIG.trimBottom;
    var armLen = t1 - t0;
    if (armLen < 1e-4) return null;

    var bins = [];
    for (var b = 0; b < sliceCount; b++) bins.push([]);
    for (var k = 0; k < verts.length; k++) {
      if (ts[k] < t0 || ts[k] > t1) continue;
      bins[Math.min(sliceCount - 1, Math.floor((ts[k] - t0) / armLen * sliceCount))].push(verts[k]);
    }

    var slices = [], prec = null;
    bins.forEach(function (bin, i) {
      if (bin.length < 3) return; // fetta troppo scarsa: salto, la curva resta continua sulle altre
      // `verts` resta l'INTERA fetta: il raggio locale (offsetInside) va
      // misurato sul braccio tutto, non sul solo pezzo scelto per il percorso.
      prec = puntoDellaFetta(bin, prec);
      slices.push({ point: prec.clone(), verts: bin, t01: (i + 0.5) / sliceCount });
    });
    if (slices.length < 3) return null;
    // Lisciatura del percorso: i capi restano dove sono (la fibra deve
    // arrivare fino alla spalla e fino alla mano), gli interni fanno la media
    // a tre punti coi vicini.
    for (var pass = 0; pass < CONFIG.lisciature; pass++) {
      var prima = slices.map(function (s) { return s.point.clone(); });
      for (var j = 1; j < slices.length - 1; j++) {
        slices[j].point.copy(prima[j]).multiplyScalar(0.5)
          .addScaledVector(prima[j - 1], 0.25).addScaledVector(prima[j + 1], 0.25);
      }
    }
    // Asse, origine e lunghezza viaggiano appesi all'array — un array resta un
    // oggetto normale in JS, le proprietà extra non disturbano
    // `.length`/`.forEach`/`.map` di chi lo consuma.
    slices.armLen = armLen;
    slices.axis = axis;
    slices.origin = origin;
    return slices;
  }

  // FIX drift (correzione utente ref1): la direzione verso l'esterno NON è
  // più fissa per braccio. Una direzione fissa va bene sul braccio che si
  // piega "come previsto", ma DERIVA (la fibra esce dalla superficie) sul
  // braccio che si piega diversamente — la sua faccia esterna cambia
  // orientamento lungo la piega, la direzione fissa no.
  //
  // Ora, PER OGNI fetta, si ricava la direzione esterna dall'asse del
  // braccio in quel punto: la componente di (centroide − puntoSull'AsseA quel
  // t) perpendicolare all'asse, normalizzata. È il vettore con cui il
  // baricentro reale della sezione si scosta dalla corda dritta spalla→polso,
  // cioè verso la faccia CONVESSA (esterna) della piega in quel punto — segue
  // la piega su entrambe le braccia. Dove la piega è trascurabile (fetta
  // quasi sulla corda) il vettore è ~nullo e non affidabile: si ripiega su un
  // riferimento stabile (la vecchia direzione fissa, resa perpendicolare
  // all'asse). La soglia è RELATIVA alla dimensione della fetta (RMS dei
  // vertici attorno al centroide) perché il modello non è in unità "piccole".
  function computeOutwardDirs(slices, axis, shoulder, fallbackDir) {
    return slices.map(function (s) {
      var t = s.point.clone().sub(shoulder).dot(axis);
      var axisPoint = shoulder.clone().addScaledVector(axis, t);
      var perp = s.point.clone().sub(axisPoint);
      perp.addScaledVector(axis, -perp.dot(axis)); // togli ogni residuo assiale
      var spreadSq = 0;
      s.verts.forEach(function (v) { spreadSq += v.distanceToSquared(s.point); });
      var spread = Math.sqrt(spreadSq / s.verts.length); // raggio RMS della fetta
      if (perp.length() >= spread * 0.35) return perp.normalize();
      // bow trascurabile → riferimento fisso reso perpendicolare all'asse
      var fb = fallbackDir.clone();
      fb.addScaledVector(axis, -fb.dot(axis));
      if (fb.lengthSq() < 1e-8) fb.copy(fallbackDir);
      return fb.normalize();
    });
  }

  // Task B2 — DENTRO il braccio. Prima questa funzione spingeva il centroide
  // FUORI, fin sulla pelle (e un po' oltre, `extraPush`): di lì la fibra
  // sbordava dalla sagoma. Ora porta il punto a (1 − CONFIG.rientro) del
  // raggio locale, cioè un terzo di raggio sotto la superficie, e toglie anche
  // l'INGOMBRO del tubo (il suo raggio più metà della distanza fra i due
  // fili) — altrimenti "dentro" varrebbe per la linea di mezzo e non per i
  // pixel che si vedono, che è quello che poi si misura.
  //
  // Il raggio locale è il percentile delle proiezioni dei vertici della fetta
  // sulla direzione esterna (SURFACE_PERCENTILE): la distanza vera fra
  // centroide e pelle, IN QUEL PUNTO e IN QUELLA DIREZIONE. Niente taper: la
  // finestra `sin(pi·t01)` serviva a non far sbandare un punto spinto fuori,
  // ma un punto che sta dentro non ha da dove sbandare, e ai due capi
  // (attacco della spalla, mano) la fibra deve esserci — è metà del lavoro di
  // questo task.
  function offsetInside(slices, dirs, ingombro) {
    return slices.map(function (s, i) {
      var dir = dirs[i];
      var proj = s.verts.map(function (v) { return v.clone().sub(s.point).dot(dir); })
        .sort(function (a, b) { return a - b; });
      var idx = Math.min(proj.length - 1, Math.floor(proj.length * SURFACE_PERCENTILE));
      var rLocal = Math.max(0, proj[idx]);
      return s.point.clone().addScaledVector(dir, Math.max(0, rLocal * (1 - CONFIG.rientro) - ingombro));
    });
  }

  // Costruisce il fascio di 2 tubi vicini (fascio stretto, non barre
  // larghe) attorno alla polilinea: ad ogni punto calcola la tangente locale
  // (differenza coi vicini) e una direzione "laterale" (perpendicolare sia
  // alla tangente sia alla direzione esterna PER-FETTA `dirs[i]`) su cui
  // sposta i due fili di un piccolo offset simmetrico.
  function buildArmFibers(surfacePoints, dirs, radius, material, group) {
    if (surfacePoints.length < 3) return;
    var sideOffset = radius * CONFIG.sideOffset;
    [-1, 1].forEach(function (sign) {
      var pts = surfacePoints.map(function (p, i) {
        var prev = surfacePoints[Math.max(0, i - 1)];
        var next = surfacePoints[Math.min(surfacePoints.length - 1, i + 1)];
        var tangent = new THREE.Vector3().subVectors(next, prev);
        if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0); else tangent.normalize();
        var side = new THREE.Vector3().crossVectors(tangent, dirs[i]);
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0); else side.normalize();
        return p.clone().addScaledVector(side, sign * sideOffset);
      });
      var curve = new THREE.CatmullRomCurve3(pts);
      var geo = new THREE.TubeGeometry(curve, TUBULAR_SEGMENTS, radius, RADIAL_SEGMENTS, false);
      var mesh = new THREE.Mesh(geo, material);
      group.add(mesh);
    });
  }

  // Costruisce il percorso+fascio per un braccio; ritorna false se la mesh non
  // ha dato abbastanza vertici per un binning affidabile (braccio vuoto o mesh
  // anomala) — il chiamante lascia il gruppo vuoto in quel caso, nessuna
  // geometria NaN.
  //
  // Task B2: non prende più `joints`. Prima li prendeva, e con essi si portava
  // dietro un tranello che è costato tre rework — i `joints` sono in coordinate
  // MONDO (`Box3.setFromObject` legge sempre `matrixWorld`) mentre i vertici si
  // campionano in coordinate MODEL-LOCALI, e mescolarli sbagliava di un vettore
  // costante per lato. Ora l'asse esce dai vertici stessi (`armAxis`), cioè
  // dallo stesso identico frame: quel tranello non può più ripresentarsi,
  // perché non c'è più un secondo frame da cui sbagliare.
  function buildArm(meshes, material, group, model) {
    if (!meshes || !meshes.length || !model) return false;
    var slices = sliceArm(meshes, CONFIG.slices, model);
    if (!slices) return false;

    var radius = slices.armLen * CONFIG.tubeRadius;
    // Riferimento fisso (SOLO fallback, vedi computeOutwardDirs): lontano dal
    // busto (X, segno secondo il lato) e un po' verso la camera (+Z, la camera
    // sta su +Z guardando verso l'origine — vedi mount() in robot.js). La vera
    // direzione la calcola computeOutwardDirs PER-FETTA dall'asse del braccio.
    var side = slices.origin.x < 0 ? -1 : 1;
    var fallbackDir = new THREE.Vector3(side * 0.55, 0.05, 0.85).normalize();

    var dirs = computeOutwardDirs(slices, slices.axis, slices.origin, fallbackDir);
    // Ingombro della fibra a schermo: il raggio del tubo più metà della
    // distanza fra i due fili. Si toglie dal rientro, così a stare dentro il
    // braccio non è la linea di mezzo ma i PIXEL — che è quello che si misura.
    var pts = offsetInside(slices, dirs, radius * (1 + CONFIG.sideOffset * 0.5));
    buildArmFibers(pts, dirs, radius, material, group);
    return true;
  }

  return {
    config: CONFIG,
    /**
     * @param {THREE.Mesh[]} input.armL - mesh-braccio sinistro, da
     *   WC.robotParts.split (parts.armL) — campionate per il percorso reale.
     * @param {THREE.Mesh[]} input.armR - mesh-braccio destro (parts.armR).
     * @param {THREE.Object3D} input.model - il gruppo `model` di robot.js
     *   (radice della scena GLTF, parent DIRETTO di ogni mesh-braccio —
     *   gerarchia piatta). `object` (il ritorno) viene aggiunto come figlio
     *   DIRETTO di questo stesso `model` da robot.js, così il percorso vive
     *   nello STESSO frame in cui verrà renderizzato.
     * @returns {{object: THREE.Object3D, update: function(dt, surgeL, surgeR)}}
     */
    create: function (input) {
      input = input || {};
      var armL = input.armL || [];
      var armR = input.armR || [];
      var model = input.model;

      var object = new THREE.Group();
      object.name = 'robotFibers';

      var matL = makeMaterial();
      var matR = makeMaterial();

      var groupL = new THREE.Group();
      var groupR = new THREE.Group();
      object.add(groupL, groupR);

      if (model) {
        buildArm(armL, matL, groupL, model);
        buildArm(armR, matR, groupR, model);
      }
      // Le fibre sono l'INTERNO del braccio, ma si disegnano DOPO il suo
      // guscio (renderOrder 1, makeArm in robot-spline-materials.js): additive,
      // così la corrente si legge a piena intensità invece di essere smorzata
      // dal (1 − alpha) della manica che le sta davanti.
      object.traverse(function (o) { if (o.isMesh) o.renderOrder = 2; });

      // Task B2 — la fase si INTEGRA qui, non si ricalcola nello shader come
      // `uTime * velocità`: la velocità dipende dal surge, e rimoltiplicare
      // tutto il tempo trascorso per una velocità che cambia faceva SALTARE il
      // motivo avanti e indietro invece di farlo scorrere. Integrandola, la
      // velocità può cambiare quanto vuole e il flusso resta continuo.
      var phaseL = 0, phaseR = 0;
      function passo(dt, surge) {
        return (dt || 0) * CONFIG.speed * (1 + (surge || 0) * CONFIG.speedSurge);
      }
      function update(dt, surgeL, surgeR) {
        phaseL = (phaseL + passo(dt, surgeL)) % 1;
        phaseR = (phaseR + passo(dt, surgeR)) % 1;
        matL.uniforms.uPhase.value = phaseL;
        matR.uniforms.uPhase.value = phaseR;
        matL.uniforms.uSurge.value = surgeL || 0;
        matR.uniforms.uSurge.value = surgeR || 0;
        object.visible = (surgeL || 0) > 0.003 || (surgeR || 0) > 0.003;
      }

      return { object: object, update: update, groups: { armL: groupL, armR: groupR } };
    }
  };
})();
