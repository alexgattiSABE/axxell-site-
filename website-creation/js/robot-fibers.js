/* CAP 05 — il FLUSSO dentro le braccia ("i fasci").
 *
 * Task D2 (Nike): «le fibre falle diversamente: devono avere un flusso di
 * particelle uguale a quelle del cervello». Fino al Task B2 erano due tubi di
 * geometria (TubeGeometry) con un impulso che ci correva dentro; adesso sono
 * PUNTI, della stessa famiglia del cervello (pointbrain.js) e della sfera di
 * SABE (pointorb.js): additivi, sprite tonda e morbida, dimensione che scala
 * con la distanza dalla camera. Resta l'azzurro del sito (#3fb9ff) e resta il
 * percorso, che è la parte misurata e faticosa di questo file.
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
 *  5. il percorso si ferma al POLSO e da lì si divide in una diramazione per
 *     ogni dito (`ramiDelleDita`), che segue il dito fino alla punta;
 *  6. su tutto questo si semina la nuvola di punti (`semina`), con `depthTest`
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
 * Simmetrico per costruzione: nessun ramo per-braccio, `buildArm()` gira una
 * volta per lato con lo stesso codice.
 */
window.WC = window.WC || {};

WC.robotFibers = (function () {
  /* ------------------------------------------------------------------ TASK B2
   * «le fibre ora non sono dentro le braccia, ma sono fuori e non sono nemmeno
   * lungo tutti i bracci» — e «non è un flusso che scorre», «il colore non va
   * bene». Tre difetti, tre rimedi, tutti tarabili da qui sotto.
   *
   * 1. FUORI DAL BRACCIO. Prima il percorso veniva spinto SULLA superficie
   *    visibile (`offsetToSurface`, più il raggio del tubo e lo scostamento
   *    fra i due fili): sull'orlo, e con la posa Spline che ruota gli
   *    avambracci, sbordava. Ora il punto sta DENTRO il volume, a
   *    (1 − `rientro`) del raggio locale della fetta: si vede lo stesso perché
   *    il braccio si apre (ARM_REVEAL), e non può sbordare perché il raggio
   *    locale è misurato sui vertici veri di quella fetta.
   * 2. NON COPRE TUTTO IL BRACCIO. Prima il percorso nasceva dai `joints`
   *    (bbox del gruppo) e si fermava al gomito: spalla e mano restavano
   *    scoperte. Ora l'asse si ricava dai VERTICI e le fette coprono tutta
   *    l'escursione dei vertici lungo quell'asse — dalla spalla alla mano.
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
    // vena, abbastanza dentro da non sfiorare mai il profilo.
    rientro: 0.55,
    // Quanto si accorcia ai due capi, in frazione della lunghezza del braccio.
    // Tenuti a ZERO: la corrente deve partire dall'attacco della spalla e
    // arrivare alla mano.
    trimTop: 0.0,
    trimBottom: 0.0,
    // --- dita (Task D2) -----------------------------------------------------
    // Quante diramazioni cercare nella mano. Le dita NON sono mesh separate e
    // nemmeno isole della geometria (misurato: la mano è una mesh sola,
    // `Hand`, 2274 vertici, UNA sola componente connessa — le dita sono
    // saldate al palmo e si toccano fra loro). Si trovano quindi per
    // POSIZIONE, col metodo del punto più lontano: la prima punta è il vertice
    // più distante dal polso, la seconda il più distante da quella, e così
    // via. `dita` è il tetto; quante se ne trovano davvero lo dice
    // `window.__robot.fibers.dita` (e il report).
    dita: 5,
    // Quanto devono essere separate due punte per valere come due dita, in
    // frazione della lunghezza della mano. Sotto questa soglia la ricerca si
    // ferma: è lì che si smette di trovare dita e si comincia a trovare
    // bitorzoli dello stesso dito.
    distanzaDita: 0.34,
    // Fette lungo ogni dito (come `slices` per il braccio, ma un dito è corto
    // e dritto: ne bastano poche).
    // Da che punto in poi un vertice può essere una PUNTA, in frazione della
    // distanza massima dal polso. Con 0,5 (la metà distale) il metodo del
    // punto più lontano andava a pescare anche lo spigolo del DORSO, che è
    // un'estremità della mano ma non è un dito; con 0,8 restano solo i
    // polpastrelli e il pollice.
    quotaPunte: 0.5,
    fetteDito: 7,
    // Rientro dentro il dito, in frazione del raggio locale del dito. Più
    // profondo di quello del braccio perché il dito è sottile e la sprite del
    // punto è larga: qui il margine si mangia in fretta.
    rientroDito: 0.93,
    // Quanto può assottigliarsi il punto nelle dita, in frazione della grana
    // del braccio. Sotto questa soglia non si scende: un punto più piccolo di
    // così non si vede più, e un ramo che non si vede non è un ramo.
    scalaMinima: 0.38,
    // Di quanto il ramo si ferma prima del polpastrello, in ingombri del punto.
    rientroPunta: 4,
    // --- nuvola di punti ----------------------------------------------------
    // Quanti punti per braccio, divisi fra il tratto spalla→polso e le dita in
    // proporzione alla lunghezza (così la densità è la stessa dappertutto).
    punti: 1400,
    // Grana della nuvola. Nello shader `gl_PointSize = uSize · uPR /
    // distanza`, la stessa formula della sfera di SABE (pointorb.js), e
    // `uSize` la rifà robot.js a ogni fit() come
    //   uSize = pointSizeK · altezza canvas · fovScale · ingrandimento
    // — identica a quella della sfera, così la grana è la STESSA a ogni
    // dimensione del riquadro e con l'inquadratura ritagliata.
    // Da qui esce anche l'INGOMBRO del punto in unità mondo, che serve a
    // tenerlo dentro il braccio: mezza sprite vale
    //   uSize · tan(fov/2)/zoom / (altezza · ingrandimento) = pointSizeK · tan(22,5°)
    // — la distanza si semplifica, e con lei l'altezza del riquadro: un punto
    // occupa sempre lo stesso pezzo di MONDO. Vedi INGOMBRO, più sotto.
    pointSizeK: 1.45,
    fovRef: 22.5,   // come SFERA_CONFIG: il fov a cui la grana è tarata
    // Sparpaglio laterale dei punti attorno al filo, in frazione del raggio
    // locale che resta libero dopo il rientro. 0 = tutti in fila su una linea
    // (legge finto), 1 = fino a sfiorare la pelle. È il numero che fa leggere
    // il FASCIO invece del filo, ed è anche il primo da abbassare se la
    // nuvola sborda.
    sparpaglio: 0.55,
    // Nelle dita lo sparpaglio è un lusso che non c'è: il ramo è uno solo e il
    // dito è largo 7 px. Qui i punti stanno praticamente in fila sul filo.
    sparpaglioDito: 0.12,
    // --- flusso -------------------------------------------------------------
    pulses: 2.0,          // impulsi per braccio (Task B2: due)
    // Task D2b (Nike: «il flusso più veloce deve essere»): da 0,28 a 0,62
    // periodi al secondo a braccio appena acceso — poco più del doppio. Con
    // `speedSurge` a braccio pieno fa 1,55 periodi al secondo: l'impulso
    // attraversa il braccio in due terzi di secondo, e a 0,2 s di distanza
    // l'uno dall'altro tre fotogrammi lo mostrano in tre posti diversi.
    // Resta legato a `dt` (la fase si integra in JS), quindi non dipende dai
    // fotogrammi al secondo della macchina.
    speed: 0.62,          // periodi al secondo a braccio appena acceso
    speedSurge: 1.5,      // quanto accelera a surge pieno
    rise: 0.07,           // fronte dell'impulso, in frazione del periodo (ripido)
    tailK: 4.5,           // quanto in fretta si spegne la coda (più basso = più lunga)
    pulseGain: 1.35,      // intensità della cresta
    baseline: 0.30,       // filo di base continuo, SOLO a braccio aperto
    // Azzurro del sito; la cresta dell'impulso schiarisce verso il bianco.
    colorCold: '#3fb9ff',
    colorHot: '#eaf8ff'
  };

  // sRGB → lineare, stessa formula di `hexToLinear` in js/pointbrain.js e
  // js/pointorb.js (lì è privata del modulo, non esportata). Il resto della
  // scena è in lineare: passare i byte grezzi darebbe un azzurro diverso da
  // quello del cervello e della sfera, che è esattamente ciò che si vuole
  // evitare — «il colore del sito» dev'essere UN colore solo.
  // Caso deterministico: la nuvola si semina con un generatore seminato, non
  // con Math.random. Non è pignoleria — la posizione dei punti entra nella
  // misura «la fibra sta dentro la sagoma», e una nuvola diversa a ogni
  // caricamento vorrebbe dire un controllo che passa o fallisce a sorte.
  function rng(seme) {
    var s = seme >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
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
  // Mezza sprite in unità MONDO (vedi pointSizeK): non dipende né dalla
  // distanza né dalla misura del riquadro. È quanto si toglie al rientro,
  // così a stare dentro la sagoma non è la linea di mezzo ma i PIXEL.
  var INGOMBRO = CONFIG.pointSizeK * Math.tan(CONFIG.fovRef * Math.PI / 180);

  // Task D2 — i PUNTI. Stessa impalcatura del cervello e della sfera: sprite
  // tonda e morbida (`gl_PointCoord`), additiva, dimensione che scala con
  // 1/distanza. Quello che cambia è il motivo: ogni punto sa dove sta lungo il
  // percorso (`aT`) e si accende quando l'onda ci passa sopra.
  var VERT = [
    'attribute float aT;',        // 0 alla spalla, 1 in punta al dito
    'attribute float aSeed;',     // per non far pulsare tutti i punti uguali
    // Task D2 — quanto è GROSSO questo punto rispetto alla grana di base. Le
    // dita sono sottili (7÷8 px a schermo a 1440×900): un punto della misura
    // del bicipite non ci starebbe dentro, e la regola è chiara — si assottiglia
    // il ramo, non lo si lascia uscire. `aScala` viene dal raggio libero del
    // tratto, quindi il fascio si rastrema da solo dove il braccio si rastrema.
    'attribute float aScala;',
    'uniform float uSize;',
    'uniform float uPR;',
    'uniform float uPhase;',
    'uniform float uPulses;',
    'uniform float uRise;',
    'uniform float uTailK;',
    'varying float vPulse;',
    'varying float vSeed;',
    'void main() {',
    // q cresce andando verso la SPALLA: q = 0 è la testa dell'impulso (il
    // fronte, verso la mano), q grande è la coda che si allunga dietro.
    '  float q = fract(uPhase - aT * uPulses);',
    '  vPulse = smoothstep(0.0, uRise, q) * exp(-q * uTailK);',
    '  vSeed = aSeed;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    // Il punto si gonfia un po' sulla cresta: è così che una fila di punti
    // fermi legge come qualcosa che SCORRE.
    '  gl_PointSize = uSize * uPR * aScala * (1.0 + vPulse * 0.9) * (1.0 / max(0.1, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float uSurge;',
    'uniform float uPulseGain;',
    'uniform float uBaseline;',
    'uniform vec3 uColorCold;',
    'uniform vec3 uColorHot;',
    'varying float vPulse;',
    'varying float vSeed;',
    'void main() {',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float d = length(uv);',
    '  if (d > 0.5) discard;',
    '  float soft = smoothstep(0.5, 0.0, d);',
    '  soft = soft * soft;',
    // Tutto si spegne col surge: a riposo il braccio è chiuso e non c'è niente
    // da vedere (regola del piano: niente disegnato a riposo). Il filo di base
    // c'è SOLO a braccio aperto, ed è quello che fa leggere il percorso intero
    // anche fra un impulso e l'altro.
    '  float acceso = smoothstep(0.0, 0.08, uSurge);',
    '  float scintilla = 0.75 + 0.25 * sin(vSeed * 6.2831853 + vPulse * 3.0);',
    '  float intensity = (uBaseline + vPulse * uPulseGain) * acceso * (0.35 + 0.65 * uSurge) * scintilla;',
    // L'azzurro è il colore del filo; a schiarire verso il bianco è SOLO la
    // cresta dell'impulso, non tutto il braccio quando il surge sale.
    '  vec3 col = mix(uColorCold, uColorHot, clamp(vPulse * 1.2, 0.0, 1.0));',
    '  gl_FragColor = vec4(col * intensity, soft * clamp(intensity, 0.0, 1.0));',
    '}'
  ].join('\n');

  function makeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: CONFIG.pointSizeK * 900 },
        uPR: { value: 1 },
        uPhase: { value: 0 },
        uSurge: { value: 0 },
        uPulses: { value: CONFIG.pulses },
        uRise: { value: CONFIG.rise },
        uTailK: { value: CONFIG.tailK },
        uPulseGain: { value: CONFIG.pulseGain },
        uBaseline: { value: CONFIG.baseline },
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
      // scrive più depth (setApertura in robot-spline-materials.js): la fibra
      // si vede attraverso la sua stessa manica, ma non attraverso il torso.
      depthTest: true,
      blending: THREE.AdditiveBlending
    });
  }

  // Campiona i vertici in coordinate MODEL-LOCALI (relative a `model`, che è
  // il parent DIRETTO di ogni mesh-braccio — gerarchia piatta CONFERMATA).
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

  // Il punto della fetta: la mediana della PIASTRA che continua quella della
  // fetta precedente. Il braccio è un'armatura di pezzi staccati e a certe
  // altezze una fetta ne prende due — il deltoide e il connettore che va verso
  // il busto — separati, in proiezione, da un vuoto vero. Media e mediana su
  // tutti i vertici cadono FRA i due, cioè nel vuoto, e la fibra ci passa in
  // mezzo: misurato, usciva dalla sagoma del robot per 307 px (media) e 151
  // (mediana su tutto). Scegliere ogni volta il pezzo con più materia è
  // peggio ancora (471). Il criterio giusto è la CONTINUITÀ — si resta sul
  // pezzo che sta più vicino a dove eravamo — e per la prima fetta quello con
  // più materia.
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
  // (offsetInside). Le fette coprono tutta l'escursione VERA dei vertici lungo
  // l'asse, meno gli eventuali trim di CONFIG.
  function sliceArm(verts, sliceCount) {
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
    slices.armLen = armLen;
    slices.axis = axis;
    slices.origin = origin;
    return slices;
  }

  // La direzione verso l'esterno NON è fissa per braccio: una direzione fissa
  // va bene sul braccio che si piega "come previsto", ma DERIVA sul braccio
  // che si piega diversamente. Per OGNI fetta si ricava dall'asse del braccio
  // in quel punto: la componente di (centroide − puntoSull'asse) perpendicolare
  // all'asse, normalizzata — cioè verso la faccia CONVESSA della piega. Dove
  // la piega è trascurabile il vettore è ~nullo e non affidabile: si ripiega
  // su un riferimento stabile reso perpendicolare all'asse.
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
      var fb = fallbackDir.clone();
      fb.addScaledVector(axis, -fb.dot(axis));
      if (fb.lengthSq() < 1e-8) fb.copy(fallbackDir);
      return fb.normalize();
    });
  }

  // Raggio locale della fetta nella direzione `dir`: il percentile delle
  // proiezioni dei vertici (SURFACE_PERCENTILE), cioè la distanza vera fra
  // centroide e pelle IN QUEL PUNTO e IN QUELLA DIREZIONE.
  function raggioLocale(s, dir) {
    var proj = s.verts.map(function (v) { return v.clone().sub(s.point).dot(dir); })
      .sort(function (a, b) { return a - b; });
    var idx = Math.min(proj.length - 1, Math.floor(proj.length * SURFACE_PERCENTILE));
    return Math.max(0, proj[idx]);
  }

  // Porta il punto DENTRO, a (1 − CONFIG.rientro) del raggio locale, e toglie
  // anche l'INGOMBRO del punto a schermo — altrimenti "dentro" varrebbe per la
  // linea di mezzo e non per i pixel che si vedono, che è quello che poi si
  // misura.
  function offsetInside(slices, dirs, ingombro, rientro) {
    return slices.map(function (s, i) {
      var dir = dirs[i];
      var rLocal = raggioLocale(s, dir);
      var libero = Math.max(0, rLocal * (1 - rientro) - ingombro);
      var p = s.point.clone().addScaledVector(dir, libero);
      p.raggio = rLocal;           // serve allo sparpaglio (semina)
      p.libero = libero;
      return p;
    });
  }

  /* ---------------------------------------------------------------- Task D2
   * LE DITA. Non sono mesh separate nel GLB — il brief lo dava per scontato e
   * non è vero — e non sono nemmeno isole della geometria: misurato, la mano è
   * UNA mesh (`Hand`, 2274 vertici) e UNA sola componente connessa; le dita
   * sono saldate al palmo e si toccano anche fra loro (unendo i vertici più
   * vicini di 3 unità diventano un blocco solo). Si trovano quindi per
   * POSIZIONE, col metodo del PUNTO PIÙ LONTANO, che è il modo standard di
   * prendere K estremità di una forma:
   *   - la prima punta è il vertice più lontano dal polso;
   *   - la successiva è quella che massimizza la distanza MINIMA dalle punte
   *     già prese (così non si sceglie due volte lo stesso dito);
   *   - ci si ferma quando la nuova punta è più vicina di `distanzaDita` alla
   *     più vicina delle altre: da lì in poi non sono più dita ma bozzi dello
   *     stesso dito.
   * Poi ogni vertice della metà distale va al dito della punta più vicina, e
   * il ramo è la mediana per fetta di quel gruppo — la stessa regola del
   * braccio, su scala di dito.
   */
  function ramiDelleDita(manoVerts, polso, ingombro) {
    if (manoVerts.length < 30) return [];
    var dPolso = manoVerts.map(function (v) { return v.distanceTo(polso); });
    var dMax = Math.max.apply(null, dPolso);
    var soglia = dMax * CONFIG.distanzaDita;
    // candidati: la metà distale della mano (le dita, non il palmo)
    var cand = [];
    for (var i = 0; i < manoVerts.length; i++) if (dPolso[i] > dMax * CONFIG.quotaPunte) cand.push(i);
    if (cand.length < 20) return [];
    var punte = [];
    // 1ª punta: il vertice più lontano dal polso
    var best = cand[0];
    cand.forEach(function (i) { if (dPolso[i] > dPolso[best]) best = i; });
    punte.push(best);
    while (punte.length < CONFIG.dita) {
      var scelto = -1, migliore = -1;
      cand.forEach(function (i) {
        var dmin = Infinity;
        punte.forEach(function (j) { dmin = Math.min(dmin, manoVerts[i].distanceTo(manoVerts[j])); });
        if (dmin > migliore) { migliore = dmin; scelto = i; }
      });
      if (scelto < 0 || migliore < soglia) break;
      punte.push(scelto);
    }
    // ogni vertice distale va alla punta più vicina
    var gruppi = punte.map(function () { return []; });
    cand.forEach(function (i) {
      var k = 0, dmin = Infinity;
      punte.forEach(function (j, q) { var d = manoVerts[i].distanceTo(manoVerts[j]); if (d < dmin) { dmin = d; k = q; } });
      gruppi[k].push(manoVerts[i]);
    });
    var rami = [];
    gruppi.forEach(function (g, k) {
      if (g.length < 12) return;
      var punta = manoVerts[punte[k]];
      var base = new THREE.Vector3();
      // base del dito: il baricentro del quarto di vertici più vicino al polso
      var ord = g.slice().sort(function (a, b) { return a.distanceTo(polso) - b.distanceTo(polso); });
      var nb = Math.max(3, Math.round(ord.length * 0.25));
      for (var i2 = 0; i2 < nb; i2++) base.add(ord[i2]);
      base.multiplyScalar(1 / nb);
      var asse = punta.clone().sub(base);
      var lung = asse.length();
      if (lung < 1e-3) return;
      asse.normalize();
      // fette lungo il dito: mediana dei vertici di ogni fetta, che cade
      // dentro la materia del dito
      var bins = [];
      for (var b2 = 0; b2 < CONFIG.fetteDito; b2++) bins.push([]);
      g.forEach(function (v) {
        var t = v.clone().sub(base).dot(asse);
        var q = Math.floor(t / lung * CONFIG.fetteDito);
        bins[Math.max(0, Math.min(CONFIG.fetteDito - 1, q))].push(v);
      });
      var via = [];
      bins.forEach(function (bin) {
        if (bin.length < 3) return;
        var m = mediana(bin);
        // raggio locale del dito in questa fetta: la distanza tipica dei suoi
        // vertici dalla mediana, tolta la componente lungo il dito
        var rr = bin.map(function (v) { var w = v.clone().sub(m); w.addScaledVector(asse, -w.dot(asse)); return w.length(); })
          .sort(function (a, b) { return a - b; });
        // Percentile BASSO, al contrario del braccio. Sul braccio il raggio si
        // misura in UNA direzione (verso l'esterno della piega) e si vuole la
        // pelle; qui si misura in TUTTE, e un dito è più largo che profondo:
        // prendere l'ottantesimo percentile vorrebbe dire misurare la
        // direzione larga e sbordare in quella stretta. Con il 35° si misura
        // la direzione stretta, che è quella che decide.
        m.raggio = rr[Math.min(rr.length - 1, Math.floor(rr.length * 0.35))];
        m.libero = Math.max(0, m.raggio * (1 - CONFIG.rientroDito) - ingombro);
        via.push(m);
      });
      if (via.length < 2) return;
      // la punta vera, tirata dentro di quanto serve a non sbordare
      var ult = via[via.length - 1];
      // La punta del ramo si ferma un po' PRIMA della punta del dito: quanto
      // basta a tenerci dentro la sprite, che è tonda e larga. Misurato: con
      // un rientro di 2,5 ingombri restava un pixel di fibra fuori dal
      // polpastrello (uno solo, ma fuori è fuori); a 4 ingombri — ~2,6 unità
      // mondo, 6 px a schermo su un dito lungo una trentina — non esce più.
      var pInt = punta.clone().addScaledVector(asse, -Math.max(ingombro * CONFIG.rientroPunta, ult.raggio));
      pInt.raggio = ult.raggio; pInt.libero = ult.libero;
      via.push(pInt);
      rami.push({ via: via, punta: punta.clone(), lung: lung });
    });
    return rami;
  }

  // Semina i punti lungo una polilinea: `quanti` punti equispaziati in
  // lunghezza, ognuno scostato di lato a caso entro il raggio libero di quel
  // tratto. `t0`/`t1` sono i valori di `aT` ai due capi — è così che l'onda
  // arriva al polso e poi riparte INSIEME su tutte le diramazioni: ogni dito
  // ha lo stesso `t0`, quello del polso, e arriva a 1 in punta.
  function semina(via, quanti, t0, t1, pos, att, off, liberoRif, caso, sparpaglio) {
    if (via.length < 2) return off;
    // lunghezze cumulate
    var cum = [0], tot = 0;
    for (var i = 1; i < via.length; i++) { tot += via[i].distanceTo(via[i - 1]); cum.push(tot); }
    if (tot < 1e-6) return off;
    var curva = new THREE.CatmullRomCurve3(via.map(function (p) { return p.clone(); }));
    var tang = new THREE.Vector3(), lat1 = new THREE.Vector3(), lat2 = new THREE.Vector3(), p = new THREE.Vector3();
    for (var k = 0; k < quanti; k++) {
      var u = (k + 0.5) / quanti;
      curva.getPoint(u, p);
      curva.getTangent(u, tang);
      // due direzioni laterali qualunque, purché perpendicolari alla tangente
      lat1.set(0, 1, 0).cross(tang);
      if (lat1.lengthSq() < 1e-6) lat1.set(1, 0, 0).cross(tang);
      lat1.normalize();
      lat2.crossVectors(tang, lat1).normalize();
      // raggio libero interpolato fra i due nodi più vicini
      var s = u * tot, j = 1;
      while (j < cum.length - 1 && cum[j] < s) j++;
      var a = via[j - 1], b = via[j];
      var w = (cum[j] - cum[j - 1]) > 1e-6 ? (s - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0;
      var libero = (a.libero === undefined ? 0 : a.libero) * (1 - w) + (b.libero === undefined ? 0 : b.libero) * w;
      var raggio = libero * sparpaglio;
      var ang = caso() * Math.PI * 2, rad = Math.sqrt(caso()) * raggio;
      pos[off * 3] = p.x + Math.cos(ang) * rad * lat1.x + Math.sin(ang) * rad * lat2.x;
      pos[off * 3 + 1] = p.y + Math.cos(ang) * rad * lat1.y + Math.sin(ang) * rad * lat2.y;
      pos[off * 3 + 2] = p.z + Math.cos(ang) * rad * lat1.z + Math.sin(ang) * rad * lat2.z;
      att[off * 3] = t0 + (t1 - t0) * u;
      att[off * 3 + 1] = caso();
      att[off * 3 + 2] = Math.max(CONFIG.scalaMinima,
        Math.min(1, liberoRif > 1e-6 ? (libero + INGOMBRO) / liberoRif : 1));
      off++;
    }
    return off;
  }

  // Costruisce percorso, diramazioni e nuvola per un braccio; ritorna
  // { punti, dita } o null se la mesh non ha dato abbastanza vertici.
  function buildArm(meshes, material, group, model, ingombro) {
    if (!meshes || !meshes.length || !model) return null;
    var verts = sampleArmVertices(meshes, model);
    var slices = sliceArm(verts, CONFIG.slices);
    if (!slices) return null;

    // Riferimento fisso (SOLO fallback, vedi computeOutwardDirs): lontano dal
    // busto (X, segno secondo il lato) e un po' verso la camera (+Z).
    var side = slices.origin.x < 0 ? -1 : 1;
    var fallbackDir = new THREE.Vector3(side * 0.55, 0.05, 0.85).normalize();
    var dirs = computeOutwardDirs(slices, slices.axis, slices.origin, fallbackDir);
    var pts = offsetInside(slices, dirs, ingombro, CONFIG.rientro);

    // La MANO: la mesh del gruppo col centro più lontano dalla spalla. Da lì
    // in poi il percorso non è più uno solo.
    var spalla = slices.origin;
    var perPezzo = {};
    verts.forEach(function (v) { (perPezzo[v.pezzo] || (perPezzo[v.pezzo] = [])).push(v); });
    var manoIdx = null, dMax = -1;
    Object.keys(perPezzo).forEach(function (k) {
      var c = new THREE.Vector3();
      perPezzo[k].forEach(function (v) { c.add(v); });
      c.multiplyScalar(1 / perPezzo[k].length);
      var d = c.distanceTo(spalla);
      if (d > dMax) { dMax = d; manoIdx = k; }
    });
    var manoVerts = perPezzo[manoIdx] || [];
    // il POLSO: il punto del percorso principale più vicino all'inizio della
    // mano (il vertice della mano più vicino alla spalla)
    var vPolso = manoVerts.length ? manoVerts.reduce(function (a, v) {
      return v.distanceTo(spalla) < a.distanceTo(spalla) ? v : a; }) : null;
    var iPolso = pts.length - 1;
    if (vPolso) {
      var dd = Infinity;
      pts.forEach(function (p, i) { var q = p.distanceTo(vPolso); if (q < dd) { dd = q; iPolso = i; } });
    }
    iPolso = Math.max(2, Math.min(pts.length - 1, iPolso));
    var braccio = pts.slice(0, iPolso + 1);
    var rami = vPolso ? ramiDelleDita(manoVerts, braccio[braccio.length - 1], ingombro) : [];
    // ogni ramo parte DAL polso: il primo punto del ramo è la fine del braccio
    rami.forEach(function (r) { r.via.unshift(braccio[braccio.length - 1]); });

    // Quanti punti a ciascun tratto: in proporzione alla lunghezza, così la
    // densità è la stessa sul bicipite e sul mignolo.
    var lung = function (v) { var s = 0; for (var i = 1; i < v.length; i++) s += v[i].distanceTo(v[i - 1]); return s; };
    var lBraccio = lung(braccio), lDita = rami.reduce(function (s, r) { return s + lung(r.via); }, 0);
    var tot = lBraccio + lDita;
    if (tot < 1e-6) return null;
    var nBraccio = Math.max(40, Math.round(CONFIG.punti * lBraccio / tot));
    var quanti = nBraccio + rami.reduce(function (s, r) { return s + Math.max(12, Math.round(CONFIG.punti * lung(r.via) / tot)); }, 0);

    var pos = new Float32Array(quanti * 3), att = new Float32Array(quanti * 3);
    // `aT` del polso: la frazione di percorso già fatta quando l'onda ci
    // arriva. Tutte le dita ripartono DA QUI, quindi si accendono insieme.
    var tPolso = lBraccio / (lBraccio + (rami.length ? lDita / rami.length : 0));
    // Riferimento per `aScala`: il raggio libero MEDIANO del tratto
    // spalla→polso. Il punto pieno è quello del braccio; nelle dita si
    // rastrema in proporzione a quanto sono più strette.
    var lib = braccio.map(function (p) { return (p.libero || 0) + INGOMBRO; }).sort(function (a, b) { return a - b; });
    var liberoRif = lib[lib.length >> 1] || 1;
    var caso = rng(20260920);
    var off = semina(braccio, nBraccio, 0, tPolso, pos, att, 0, liberoRif, caso, CONFIG.sparpaglio);
    rami.forEach(function (r) {
      off = semina(r.via, Math.max(12, Math.round(CONFIG.punti * lung(r.via) / tot)), tPolso, 1, pos, att, off, liberoRif, caso, CONFIG.sparpaglioDito);
    });

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, off * 3), 3));
    var aT = new Float32Array(off), aSeed = new Float32Array(off), aScala = new Float32Array(off);
    for (var i3 = 0; i3 < off; i3++) { aT[i3] = att[i3 * 3]; aSeed[i3] = att[i3 * 3 + 1]; aScala[i3] = att[i3 * 3 + 2]; }
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    geo.setAttribute('aScala', new THREE.BufferAttribute(aScala, 1));
    var punti = new THREE.Points(geo, material);
    punti.frustumCulled = false;
    group.add(punti);
    return { punti: off, dita: rami.length, tPolso: tPolso,
      punte: rami.map(function (r) { return r.punta.toArray().map(function (x) { return +x.toFixed(2); }); }) };
  }

  return {
    config: CONFIG,
    /**
     * @param {THREE.Mesh[]} input.armL - mesh-braccio sinistro (parts.armL).
     * @param {THREE.Mesh[]} input.armR - mesh-braccio destro (parts.armR).
     * @param {THREE.Object3D} input.model - il gruppo `model` di robot.js.
     * @returns {{object, update, tune, groups, info}}
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

      var info = { armL: null, armR: null };
      if (model) {
        info.armL = buildArm(armL, matL, groupL, model, INGOMBRO);
        info.armR = buildArm(armR, matR, groupR, model, INGOMBRO);
      }
      // Le fibre sono l'INTERNO del braccio, ma si disegnano DOPO il suo
      // guscio (renderOrder 1, makeApribile in robot-spline-materials.js):
      // additive, così la corrente si legge a piena intensità invece di essere
      // smorzata dal (1 − alpha) della manica che le sta davanti.
      object.traverse(function (o) { if (o.isPoints) o.renderOrder = 2; });

      // La fase si INTEGRA qui, non si ricalcola nello shader come
      // `uTime * velocità`: la velocità dipende dal surge, e rimoltiplicare
      // tutto il tempo trascorso per una velocità che cambia faceva SALTARE il
      // motivo avanti e indietro invece di farlo scorrere.
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
        // La visibilità va messa anche sui DUE gruppi, non solo su `object`:
        // robot.js li riparenta ai gruppi-braccio del respiro — così la fibra
        // si muove insieme al braccio e non gli esce dalla sagoma — e
        // `object` non è più il loro genitore. `object.visible` resta la
        // risposta a «le fibre si disegnano?»: i due gruppi la rispecchiano.
        var vis = (surgeL || 0) > 0.003 || (surgeR || 0) > 0.003;
        object.visible = vis;
        groupL.visible = vis;
        groupR.visible = vis;
      }
      // Dimensione del punto e pixel ratio: li rifà robot.js a ogni fit(),
      // come per il cervello e per la sfera (vedi pointSizeK).
      function tune(h, fovScale, ingrandimento, pr) {
        var uSize = CONFIG.pointSizeK * h * fovScale * ingrandimento;
        matL.uniforms.uSize.value = uSize; matR.uniforms.uSize.value = uSize;
        matL.uniforms.uPR.value = pr; matR.uniforms.uPR.value = pr;
      }

      return { object: object, update: update, tune: tune,
        groups: { armL: groupL, armR: groupR }, info: info };
    }
  };
})();
