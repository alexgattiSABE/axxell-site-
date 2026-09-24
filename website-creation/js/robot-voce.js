/* CAP 05 — la VOCE: il flusso cervello → corde vocali → sfera.
 *
 * Nike (2026-09-24): «dal cervello partono delle particelle piccole che vanno
 * nel collo dove giacciono le corde vocali (sabe) che per essere evidenti sono
 * abbastanza spesse, da lì le particelle vanno giù fino alla sfera, ma una
 * volta uscite dalla corda vocale non vanno giù dritte ma è come se fossero
 * attratte dalla gravità della sfera per poi entrarci». E poi: «fa sì che
 * facciano delle orbite diverse, alcune arrivano dirette, insomma un caos ma
 * senza esagerare col numero di particelle»; «le corde devono brillare a
 * impulsi», precisato subito dopo: «le corde devono essere immobili, io
 * intendevo che la luminosità è dinamica quindi aumenta e diminuisce di
 * intensità ma non velocemente».
 *
 * COSA SI VEDE, zona per zona (sempre parole di Nike): il flusso scorre SEMPRE
 * dentro il robot, e ogni zona aperta ne mostra solo il suo pezzo — «in questo
 * modo induco l'utente a seguire il flusso per scoprire l'anatomia»:
 *  - testa aperta: il cervello e le particelle che scendono verso il collo;
 *  - collo aperto: le due corde di luce, e «a raso qualche particella sopra e
 *    sotto» (sopra la copre il visore, sotto il petto: si vede lo spiraglio);
 *  - pancia aperta: il tronco trasparente e le particelle che orbitano ed
 *    entrano nella sfera;
 *  - a riposo: niente di disegnato.
 *
 * Ogni particella fa TUTTO il viaggio, in tre tratti di un solo ciclo:
 *   A. dal fondo del cervello scende a imbuto verso la cima di una corda;
 *   B. scorre dentro la corda fino in fondo;
 *   C. esce e cade verso la sfera con un'orbita sua (diretta, un giro largo,
 *      due o tre giri stretti), accelerando come per gravità, e si spegne
 *      entrandoci.
 * La posizione si calcola tutta nel vertex shader, da tempo e attributi fissi:
 * nessun buffer riscritto a ogni fotogramma, e sul telefono il costo è quello
 * di qualche centinaio di punti.
 *
 * Le corde stanno FERME (Nike: «le corde devono essere immobili»): a muoversi
 * è solo la loro luce, che sale e scende piano, come un respiro.
 *
 * Aggancio: robot.js chiama `WC.robotVoce.update(robot, dt)` a ogni
 * fotogramma, subito dopo aver scritto `robot.hover`. La costruzione è pigra:
 * aspetta che esistano cervello (arriva con un fetch), sfera e collo.
 * Tutto si appende sotto `model` e `headGroup`, quindi lo smaltisce il
 * teardown del robot (disposeObject3D sul modello).
 */
window.WC = window.WC || {};

WC.robotVoce = (function () {
  var TELEFONO = !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);

  var CONFIG = {
    // --- quantità -----------------------------------------------------------
    // Nike: «senza esagerare col numero di particelle», e poi «troppe
    // particelle, riduci a una frazione»: da 480 a 120 (un quarto), e sul
    // telefono da 200 a 50.
    punti: TELEFONO ? 50 : 120,

    // --- tempi --------------------------------------------------------------
    // Un ciclo intero (cervello → sfera), in secondi, e dove finiscono i
    // tratti A (discesa dal cervello) e B (dentro le corde), in frazione del
    // ciclo. Il resto è la caduta nella sfera.
    periodo: 4.2,
    fineA: 0.22,
    fineB: 0.36,

    // --- corde vocali -------------------------------------------------------
    // Misure in unità del modello (a 1440×900 un'unità vale ~2,5 px). Il
    // centro è quello dell'anello di vertebre del collo; sopra e sotto le
    // corde entrano nel visore e nel petto, che le coprono.
    cordaRaggio: 2.3,          // «abbastanza spesse per essere evidenti»
    cordaDistanza: 4.4,        // mezza distanza fra i due assi
    cordaSopra: 13,            // quanto salgono oltre la cima delle vertebre
    cordaSotto: 8,             // quanto scendono sotto il fondo delle vertebre
    // Luce: sale e scende PIANO fra `cordaMin` e `cordaMax` (Nike: «la
    // luminosità è dinamica quindi aumenta e diminuisce di intensità ma non
    // velocemente»). Due onde lente di periodo diverso, così il respiro non è
    // un metronomo.
    cordaMin: 0.3,
    cordaMax: 1.25,
    cordaPeriodi: [3.4, 5.3],

    // --- orbite -------------------------------------------------------------
    // Tre famiglie, scelte a caso per particella: dirette, un giro largo,
    // giri stretti. `raggio` in raggi della sfera, `giri` in radianti,
    // `durata` la frazione del tratto C che ci mette ad arrivare (le dirette
    // arrivano prima e restano spente fino al ciclo dopo).
    orbite: [
      { quota: 0.3, giri: [0.1, 0.6], raggio: [0, 0], cattura: [1.0, 1.3], tuffo: [0.9, 0.95], durata: [0.35, 0.55] },
      { quota: 0.4, giri: [1.5, 3.4], raggio: [1.3, 1.8], cattura: [1.2, 1.8], tuffo: [0.7, 0.85], durata: [0.65, 0.9] },
      { quota: 0.3, giri: [5.0, 9.0], raggio: [1.05, 1.35], cattura: [1.8, 2.6], tuffo: [0.8, 0.9], durata: [0.85, 1.0] }
    ],
    // Il torso alla quota della sfera è stretto: le orbite si schiacciano di
    // lato (asse X) per non uscire dalla sagoma.
    schiacciaX: 0.75,

    // --- aspetto ------------------------------------------------------------
    // Grana: stessa formula delle fibre delle braccia (robot-fibers.js),
    // uSize = K · altezza · fovScale · ingrandimento.
    pointSizeK: TELEFONO ? 2.8 : 2.1,
    fovRef: 22.5,
    guadagno: 1.25,
    // I colori del cervello e della sfera (palette di ATLAS): scelta di Nike.
    ciano: '#00d4ff',
    verde: '#00e8a2',
    bianco: '#eafff8'
  };

  function rng(seme) {
    var s = seme >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function tra(caso, ab) { return ab[0] + (ab[1] - ab[0]) * caso(); }
  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function hexToLinear(hex) {
    var n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(srgbToLinear(((n >> 16) & 255) / 255),
      srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255));
  }

  var PUNTI_VERT = [
    'attribute vec4 aRnd;',      // x colore, y scintilla, z durata caduta, w lato corda (−1/+1)
    'attribute vec3 aStart;',    // partenza nel cervello (locale testa)
    'attribute vec4 aAsse;',     // xyz asse dell'orbita, w giri (radianti, con segno)
    'attribute vec4 aOrb;',      // x raggio d'orbita (raggi sfera), y cattura, z tuffo, w fase di nascita
    'attribute vec3 aJit;',      // scarto dentro la sezione della corda
    'uniform float uCiclo;',     // tempo / periodo
    'uniform float uFineA;',
    'uniform float uFineB;',
    'uniform mat4 uHead;',       // locale testa → locale del genitore dei punti
    'uniform vec3 uCordaSu;',
    'uniform vec3 uCordaGiu;',
    'uniform float uCordaDx;',
    'uniform float uCordaR;',
    'uniform vec3 uSfera;',
    'uniform float uSferaR;',
    'uniform float uSchiaccia;',
    'uniform float uTesta;',
    'uniform float uCollo;',
    'uniform float uPancia;',
    'uniform float uSize;',
    'uniform float uPR;',
    'varying float vInt;',
    'varying float vCol;',
    'varying float vCaldo;',
    'void main() {',
    '  float p = fract(uCiclo - aOrb.w);',
    '  float lato = aRnd.w;',
    '  vec3 jit = aJit * uCordaR * 0.55;',
    '  vec3 pos;',
    '  float a = 1.0, mT = 0.0, mC = 0.0, mP = 0.0, caldo = 0.0;',
    '  if (p < uFineA) {',
    // A — dal cervello a imbuto verso la cima della corda. Esce DRITTA verso
    // il basso (il punto di controllo sta sotto la partenza) e piega verso la
    // corda solo alla fine. Accelera: parte lenta, arriva svelta.
    '    float s = p / uFineA;',
    '    float u = pow(s, 1.5);',
    '    vec3 T = uCordaSu + vec3(lato * uCordaDx, 0.0, 0.0) + jit;',
    '    vec3 c = vec3(aStart.x, mix(aStart.y, T.y, 0.65), aStart.z);',
    '    vec3 h = mix(mix(aStart, c, u), mix(c, T, u), u);',
    '    pos = (uHead * vec4(h, 1.0)).xyz;',
    '    a = smoothstep(0.0, 0.18, s);',
    '    mT = 1.0;',
    '    mC = smoothstep(0.6, 1.0, s);',
    '  } else if (p < uFineB) {',
    // B — dentro la corda, dall'alto in basso.
    '    float s = (p - uFineA) / (uFineB - uFineA);',
    '    vec3 h = mix(uCordaSu, uCordaGiu, s) + jit;',
    '    h.x += lato * uCordaDx;',
    '    pos = (uHead * vec4(h, 1.0)).xyz;',
    '    mT = 1.0 - smoothstep(0.0, 0.25, s);',
    '    mC = 1.0;',
    '    mP = smoothstep(0.7, 1.0, s);',
    '    caldo = 0.45;',
    '  } else {',
    // C — la caduta. Si parte dal fondo della corda (che segue la testa: per
    // questo passa da uHead) e si ruota attorno alla sfera su un asse proprio
    // (formula di Rodrigues), mentre il raggio si stringe: prima la CATTURA
    // fino al raggio d'orbita, poi il TUFFO verso il centro. L'angolo cresce
    // da subito (Nike: «una volta uscite dalla corda vocale non vanno giù
    // dritte»): la particella piega appena lascia la corda.
    '    float s = (p - uFineB) / (1.0 - uFineB);',
    '    float sc = clamp(s / aRnd.z, 0.0, 1.0);',
    '    float u = pow(sc, 1.35);',
    '    vec3 P0 = (uHead * vec4(uCordaGiu + vec3(lato * uCordaDx, 0.0, 0.0) + jit, 1.0)).xyz;',
    '    vec3 d0 = P0 - uSfera;',
    '    float r0 = length(d0);',
    '    vec3 e = d0 / max(r0, 1e-4);',
    '    float rOrb = aOrb.x * uSferaR;',
    '    float R = rOrb + (r0 - rOrb) * pow(1.0 - u, aOrb.y);',
    '    R *= 1.0 - smoothstep(aOrb.z, 1.0, u);',
    '    float phi = aAsse.w * pow(u, 1.1);',
    '    vec3 n = normalize(aAsse.xyz);',
    '    vec3 v = e * cos(phi) + cross(n, e) * sin(phi) + n * dot(n, e) * (1.0 - cos(phi));',
    '    v.x *= uSchiaccia;',
    '    pos = uSfera + v * R;',
    // Si spegne ENTRANDO nella sfera, non sul bordo: si vede che ci entra.
    '    a = smoothstep(0.15 * uSferaR, 0.85 * uSferaR, R) * (1.0 - step(0.999, sc));',
    '    mP = 1.0;',
    '    mC = 1.0 - smoothstep(0.0, 0.1, s);',
    '  }',
    // Una zona per volta (robot.js ne accende una sola): il massimo basta.
    '  vInt = a * max(max(mT * uTesta, mC * uCollo), mP * uPancia);',
    '  vCol = aRnd.x;',
    '  vCaldo = max(caldo, step(0.9, aRnd.y) * 0.6);',
    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = uSize * uPR * (0.7 + 0.6 * aRnd.y) / max(0.1, -mv.z);',
    // Spenta: fuori dallo schermo e grande zero, così non tocca un pixel.
    '  if (vInt < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }',
    '}'
  ].join('\n');

  var PUNTI_FRAG = [
    'precision highp float;',
    'uniform vec3 uCiano;',
    'uniform vec3 uVerde;',
    'uniform vec3 uBianco;',
    'uniform float uGuadagno;',
    'varying float vInt;',
    'varying float vCol;',
    'varying float vCaldo;',
    'void main() {',
    '  vec2 uv = gl_PointCoord - 0.5;',
    '  float d = length(uv);',
    '  if (d > 0.5) discard;',
    '  float soft = smoothstep(0.5, 0.0, d);',
    '  soft *= soft;',
    '  vec3 col = mix(mix(uCiano, uVerde, vCol), uBianco, vCaldo);',
    '  float i = vInt * uGuadagno;',
    '  gl_FragColor = vec4(col * i, soft * clamp(i, 0.0, 1.0));',
    '}'
  ].join('\n');

  var CORDE_VERT = [
    'attribute float aS;',       // 0 in cima, 1 in fondo
    'varying float vS;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vS = aS;',
    '  vN = normalMatrix * normal;',
    '  vV = -mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var CORDE_FRAG = [
    'precision highp float;',
    'uniform vec3 uCiano;',
    'uniform vec3 uVerde;',
    'uniform vec3 uBianco;',
    'uniform float uCollo;',
    'uniform float uLuce;',      // il respiro della luce, da update()
    'varying float vS;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    // Più luce al centro della corda che sui bordi: legge come un'asta di
    // luce tonda, non come un nastro piatto.
    '  float fronte = abs(dot(normalize(vN), normalize(vV)));',
    '  float nucleo = 0.35 + 0.65 * pow(fronte, 1.3);',
    '  float i = uLuce * uCollo;',
    '  vec3 col = mix(uCiano, uVerde, vS * 0.6);',
    // Al massimo del respiro la corda schiarisce verso il bianco.
    '  col = mix(col, uBianco, clamp((uLuce - 0.7) * 0.6, 0.0, 0.4));',
    '  gl_FragColor = vec4(col * i * nucleo, clamp(i * nucleo, 0.0, 1.0));',
    '}'
  ].join('\n');

  // Le vertebre del collo in coordinate di headGroup: il riquadro delle mesh
  // del collo tranne i due montanti laterali (`Cylinder_4*`) e il collare
  // (`Cylinder_3`), che allargano il riquadro senza essere il collo vero.
  function vertebre(robot) {
    var hg = robot.headGroup, box = new THREE.Box3(), tmp = new THREE.Box3();
    (robot.parts.collo || []).forEach(function (m) {
      if (/^Cylinder_/.test(m.name) || !m.geometry) return;
      if (m.parent !== hg) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      m.updateMatrix();
      box.union(tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrix));
    });
    return box.isEmpty() ? null : box;
  }

  function costruisci(robot) {
    var hg = robot.headGroup, brain = robot.brain, orb = robot.orb;
    var genitore = orb.points.parent;
    if (!hg || !brain || !orb || !genitore || !robot.pancia) return null;
    var vb = vertebre(robot);
    if (!vb) return null;
    var cv = vb.getCenter(new THREE.Vector3());
    var cordaSu = new THREE.Vector3(cv.x, vb.max.y + CONFIG.cordaSopra, cv.z);
    var cordaGiu = new THREE.Vector3(cv.x, vb.min.y - CONFIG.cordaSotto, cv.z);

    // Il cervello: centro, raggio e FONDO nello stesso frame (headGroup). Le
    // particelle partono dal fondo (Nike: «dal cervello partono più in
    // basso»), non da dentro la forma.
    var bg = brain.points.geometry;
    if (!bg.boundingSphere) bg.computeBoundingSphere();
    if (!bg.boundingBox) bg.computeBoundingBox();
    var bC = brain.points.position.clone().add(bg.boundingSphere.center);
    var bR = bg.boundingSphere.radius;
    var bFondo = brain.points.position.y + bg.boundingBox.min.y;

    var sferaC = orb.points.position.clone();
    var sferaR = robot.pancia.locale;

    // --- le particelle ----------------------------------------------------
    var N = CONFIG.punti;
    var caso = rng(20260924);
    var aRnd = new Float32Array(N * 4), aStart = new Float32Array(N * 3);
    var aAsse = new Float32Array(N * 4), aOrb = new Float32Array(N * 4), aJit = new Float32Array(N * 3);
    var pos = new Float32Array(N * 3);   // non usata dallo shader, ma three la vuole
    for (var i = 0; i < N; i++) {
      // fase di nascita: equidistanti, con un po' di scarto, così il filo è
      // continuo e non a grumi
      var fase = (i + caso() * 0.8) / N;
      // famiglia d'orbita
      var r = caso(), fam = CONFIG.orbite[CONFIG.orbite.length - 1];
      for (var k = 0, acc = 0; k < CONFIG.orbite.length; k++) {
        acc += CONFIG.orbite[k].quota;
        if (r < acc) { fam = CONFIG.orbite[k]; break; }
      }
      var ang = caso() * Math.PI * 2;
      var asse = new THREE.Vector3(Math.cos(ang), (caso() * 2 - 1) * 0.5, Math.sin(ang)).normalize();
      aRnd[i * 4] = caso();
      aRnd[i * 4 + 1] = caso();
      aRnd[i * 4 + 2] = tra(caso, fam.durata);
      aRnd[i * 4 + 3] = caso() < 0.5 ? -1 : 1;
      // partenza: il fondo del cervello, al centro (il tronco encefalico)
      aStart[i * 3] = bC.x + bR * (caso() * 2 - 1) * 0.28;
      aStart[i * 3 + 1] = bFondo + bR * caso() * 0.12;
      aStart[i * 3 + 2] = bC.z + bR * (caso() * 2 - 1) * 0.25;
      aAsse[i * 4] = asse.x; aAsse[i * 4 + 1] = asse.y; aAsse[i * 4 + 2] = asse.z;
      aAsse[i * 4 + 3] = tra(caso, fam.giri) * (caso() < 0.5 ? -1 : 1);
      aOrb[i * 4] = tra(caso, fam.raggio);
      aOrb[i * 4 + 1] = tra(caso, fam.cattura);
      aOrb[i * 4 + 2] = tra(caso, fam.tuffo);
      aOrb[i * 4 + 3] = fase % 1;
      var ja = caso() * Math.PI * 2, jr = Math.sqrt(caso());
      aJit[i * 3] = Math.cos(ja) * jr; aJit[i * 3 + 1] = 0; aJit[i * 3 + 2] = Math.sin(ja) * jr;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(aRnd, 4));
    geo.setAttribute('aStart', new THREE.BufferAttribute(aStart, 3));
    geo.setAttribute('aAsse', new THREE.BufferAttribute(aAsse, 4));
    geo.setAttribute('aOrb', new THREE.BufferAttribute(aOrb, 4));
    geo.setAttribute('aJit', new THREE.BufferAttribute(aJit, 3));

    var colori = {
      uCiano: { value: hexToLinear(CONFIG.ciano) },
      uVerde: { value: hexToLinear(CONFIG.verde) },
      uBianco: { value: hexToLinear(CONFIG.bianco) }
    };
    var uP = {
      uCiclo: { value: 0 }, uFineA: { value: CONFIG.fineA }, uFineB: { value: CONFIG.fineB },
      uHead: { value: new THREE.Matrix4() },
      uCordaSu: { value: cordaSu }, uCordaGiu: { value: cordaGiu },
      uCordaDx: { value: CONFIG.cordaDistanza }, uCordaR: { value: CONFIG.cordaRaggio },
      uSfera: { value: sferaC }, uSferaR: { value: sferaR }, uSchiaccia: { value: CONFIG.schiacciaX },
      uTesta: { value: 0 }, uCollo: { value: 0 }, uPancia: { value: 0 },
      uSize: { value: 0 }, uPR: { value: 1 }, uGuadagno: { value: CONFIG.guadagno },
      uCiano: colori.uCiano, uVerde: colori.uVerde, uBianco: colori.uBianco
    };
    var punti = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: uP, vertexShader: PUNTI_VERT, fragmentShader: PUNTI_FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending
    }));
    punti.name = 'voceParticelle';
    punti.frustumCulled = false;
    punti.castShadow = false; punti.receiveShadow = false;
    // renderOrder 1,5: DOPO gli interni della testa (1), che a riposo scrivono
    // depth e la nascondono; PRIMA del visore (2) e del petto (3), che a
    // riposo sono pieni e la coprono — ed è così che a collo aperto restano
    // solo le particelle nello spiraglio fra mento e petto. Il petto a collo
    // aperto smette di scrivere depth (setPettoScriveDepth): disegnata dopo di
    // lui, la caduta si vedrebbe attraverso il torso chiuso.
    punti.renderOrder = 1.5;
    punti.visible = false;
    // La testa gira col cursore: la matrice testa → genitore si legge qui,
    // dentro render(), quando le matrici mondo sono già quelle del fotogramma.
    var invG = new THREE.Matrix4();
    punti.onBeforeRender = function () {
      invG.copy(genitore.matrixWorld).invert();
      uP.uHead.value.multiplyMatrices(invG, hg.matrixWorld);
    };
    genitore.add(punti);

    // --- le corde ---------------------------------------------------------
    var pezzi = [-1, 1].map(function (lato) {
      var a = cordaSu.clone(), b = cordaGiu.clone();
      a.x += lato * CONFIG.cordaDistanza; b.x += lato * CONFIG.cordaDistanza;
      var t = new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 24, CONFIG.cordaRaggio, 12, false);
      var n = t.attributes.position.count, s = new Float32Array(n);
      for (var j = 0; j < n; j++) s[j] = (cordaSu.y - t.attributes.position.getY(j)) / (cordaSu.y - cordaGiu.y);
      t.setAttribute('aS', new THREE.BufferAttribute(s, 1));
      return t;
    });
    var cordeGeo = unisci(pezzi);
    pezzi.forEach(function (g) { g.dispose(); });
    var uC = {
      uCollo: { value: 0 }, uLuce: { value: CONFIG.cordaMin },
      uCiano: colori.uCiano, uVerde: colori.uVerde, uBianco: colori.uBianco
    };
    var corde = new THREE.Mesh(cordeGeo, new THREE.ShaderMaterial({
      uniforms: uC, vertexShader: CORDE_VERT, fragmentShader: CORDE_FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending
    }));
    corde.name = 'voceCorde';
    corde.castShadow = false; corde.receiveShadow = false;
    corde.renderOrder = 1.5;
    corde.visible = false;
    hg.add(corde);

    return { robot: robot, punti: punti, corde: corde, uP: uP, uC: uC, t: 0,
      info: { punti: N, cordaSu: cordaSu.toArray(), cordaGiu: cordaGiu.toArray(),
        cervello: bC.toArray().concat([bR]), sfera: sferaC.toArray().concat([sferaR]) } };
  }

  // Le due corde in UNA geometria: una chiamata di disegno sola.
  function unisci(geos) {
    var nomi = ['position', 'normal', 'aS'];
    var out = new THREE.BufferGeometry(), idx = [], base = 0;
    nomi.forEach(function (nome) {
      var size = geos[0].attributes[nome].itemSize, tot = 0;
      geos.forEach(function (g) { tot += g.attributes[nome].array.length; });
      var arr = new Float32Array(tot), off = 0;
      geos.forEach(function (g) { arr.set(g.attributes[nome].array, off); off += g.attributes[nome].array.length; });
      out.setAttribute(nome, new THREE.BufferAttribute(arr, size));
    });
    geos.forEach(function (g) {
      var ix = g.index.array;
      for (var i = 0; i < ix.length; i++) idx.push(ix[i] + base);
      base += g.attributes.position.count;
    });
    out.setIndex(idx);
    return out;
  }

  var stato = null;

  // Il respiro della luce delle corde: 0..1, due onde lente sommate.
  function respiro(t) {
    var P = CONFIG.cordaPeriodi;
    var w = 0.6 * Math.sin(t * 2 * Math.PI / P[0]) + 0.4 * Math.sin(t * 2 * Math.PI / P[1] + 1.3);
    return 0.5 + 0.5 * w;
  }

  function update(robot, dt) {
    if (!robot) return;
    if (!stato || stato.robot !== robot) {
      if (!robot.brain || !robot.orb || !robot.headGroup || !robot.parts || !robot.parts.collo) return;
      stato = costruisci(robot);
      if (!stato) return;
      robot.voce = { punti: stato.punti, corde: stato.corde, config: CONFIG, info: stato.info };
    }
    var h = robot.hover || {};
    var testa = h.testa || 0, collo = h.collo || 0, pancia = h.pancia || 0;
    stato.t += dt || 0;
    var ciclo = stato.t / CONFIG.periodo;
    var uP = stato.uP, uC = stato.uC;
    uP.uCiclo.value = ciclo % 1000;
    uP.uTesta.value = testa; uP.uCollo.value = collo; uP.uPancia.value = pancia;
    uC.uCollo.value = collo;
    uC.uLuce.value = CONFIG.cordaMin + (CONFIG.cordaMax - CONFIG.cordaMin) * respiro(stato.t);
    // Grana: come le fibre (robot-fibers.js, tune), ricalcolata qui perché
    // costa quattro moltiplicazioni e segue da sola ogni ridimensionamento.
    var cam = robot.camera, el = robot.renderer.domElement;
    var fovScale = Math.tan(CONFIG.fovRef * Math.PI / 180) / (Math.tan(cam.fov * Math.PI / 360) / cam.zoom);
    uP.uSize.value = CONFIG.pointSizeK * (el.clientHeight || 900) * fovScale * (robot.ingrandimento || 1);
    uP.uPR.value = robot.renderer.getPixelRatio();
    stato.punti.visible = Math.max(testa, collo, pancia) > 0.01;
    stato.corde.visible = collo > 0.01;
  }

  return { update: update, config: CONFIG };
})();
