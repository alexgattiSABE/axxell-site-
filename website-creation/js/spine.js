/* CAP 03 — la colonna di vetro, da sola.
 *
 * ⚠️ QUESTA VERSIONE HA SVUOTATO LA SCENA, su richiesta esplicita. Se trovi
 * commenti altrove che parlano di bolle, lastre in orbita o parole che le
 * stanno davanti, sono di prima: qui dentro non c'è più niente di tutto quello.
 * Sono spariti, in un colpo solo:
 *   · le 1440 bolle (due InstancedMesh, la schiuma e le grandi);
 *   · le sei lastre e le sei parole, con il loro indice 01/06;
 *   · la copy a lato — che resta nel DOM per gli screen reader e per chi non
 *     ha WebGL, ma a schermo non c'è.
 * Il capitolo è UN oggetto su un fondo nero, e il riferimento è l'immagine che
 * ha portato l'utente: cromo-vetro viola e blu, luci bianche taglienti sui
 * bordi delle vertebre, un alone di luce dietro.
 *
 * Restano i due movimenti, e tutti e due SOLO in funzione dello scroll: la
 * spina ruota su sé stessa e la visuale scende lungo il suo corpo. A dito
 * fermo l'unica cosa che si muove è il respiro dello shader.
 *
 * Il vetro. La scena non si disegna più due volte in un render target: quando
 * c'erano le bolle dietro serviva, perché il vetro doveva rifrangere ROBA. Ora
 * dietro c'è solo l'ambiente, e l'ambiente è una funzione — `room()` — che
 * fondo e spina condividono. Il fondo la disegna, il vetro la ricampiona
 * piegata dalla legge di Snell. Una passata sola, nessuna risoluzione dimezzata
 * di mezzo, e la rifrazione è esatta invece che approssimata da una texture.
 *
 * La camera non si muove: a salire è il mondo. A schermo è la stessa cosa, ma
 * l'inquadratura e il fondo restano composti attorno a un punto fermo.
 */
WC.register('spine', function(ctx){
  var section = document.getElementById('cap03');
  var pin     = document.getElementById('wcSpinePin');
  var canvas  = document.getElementById('wcSpineCanvas');
  if (!section || !pin || !canvas) return;

  var G = WC.glsl;

  var CONFIG = {
    glbSrc: 'assets/spine.glb',
    // Il modello, misurato: alto 1.955 unità, largo 0.287, centrato sull'asse.
    modelH: 1.955,
    modelW: 0.287,
    // Quanto della larghezza inquadrata occupa la colonna. Nel riferimento è
    // una colonna SOTTILE su molto nero, non un tronco: la magrezza fa parte
    // del soggetto.
    widthFrac: 0.21,
    widthFracNarrow: 0.46,
    // Margine oltre la corsa: senza, all'inizio si vedrebbe il taglio netto
    // della prima vertebra e alla fine quello del sacro.
    endMargin: 1.18,
    endMarginNarrow: 1.06,
    spineTurns: 0.75,      // giri su sé stessa in tutto lo scroll
    travelMin: 3.0,        // corsa minima: sotto, la discesa non si legge
    camZ: 8.0,             // ferma, sempre
    camY: -0.05
  };

  var reduced = !ctx.motionOk || typeof THREE === 'undefined';
  if (reduced) {
    section.classList.add('-static');
    return;
  }

  // ------------------------------------------------------------- renderer
  var wide   = window.innerWidth;
  var mobile = wide <= 640;
  var maxDpr = wide > 1024 ? 1.75 : 1.5;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, CONFIG.camY, CONFIG.camZ);
  camera.lookAt(0, 0, 0);

  var FOV_T = Math.tan((45 * Math.PI / 180) / 2);
  var VIS_H = 2 * FOV_T * CONFIG.camZ;              // 6.63 unità inquadrate

  var uTime   = { value: 0 };
  var uRes    = { value: new THREE.Vector2(1, 1) };
  var uAppear = { value: 0 };

  var VIOLET = G.hexToVec3('#7024FF');
  var BLUE   = G.hexToVec3('#315CFF');
  var PINK   = G.hexToVec3('#FF28D4');

  /* L'AMBIENTE, in due funzioni che fondo e vetro si dividono.
   *
   * `room(p)` è quello che si vede: nero, e dietro la colonna un alone alto e
   * morbido che dal viola passa al blu in basso e al magenta in alto. Nel
   * riferimento quell'alone non è decorazione — è la sola sorgente di luce
   * della scena, ed è ciò che si intravede ATTRAVERSO il vetro.
   *
   * `env(d)` è la stessa stanza vista come direzione invece che come punto: la
   * si interroga lungo il raggio riflesso. Non c'è una cubemap, ma nel calcolo
   * il ruolo è quello. Le tre sorgenti calde danno il colore, la quarta —
   * fredda, dall'alto — dà la FORMA: senza, ogni faccia rivolta in su resta
   * nera e la colonna si legge come un tubo liscio.
   */
  var ROOM_GLSL = [
    'uniform vec2 uRes; uniform float uTime;',
    'uniform vec3 uViolet; uniform vec3 uBlue; uniform vec3 uPink;',
    'vec3 room(vec2 p){',
    '  float asp = uRes.x / uRes.y;',
    '  vec2 q = vec2((p.x - 0.5) * asp, p.y - 0.5);',
    '  float breathe = 0.93 + sin(uTime * 0.35) * 0.07;',
    // Gaussiane, non smoothstep: l'alone del riferimento non ha un bordo, si
    // spegne e basta. Stretto in x, alto in y.
    // Non più un alone viola su nero: una STANZA teal illuminata da destra in
    // alto. I valori vengono dal campionamento della pagina di riferimento —
    // ombre #122323, medi #193032, alte luci #2B484E — cioè una stanza scura e
    // poco contrastata, in cui l'unica cosa che brilla è l'oggetto.
    '  vec3 col = vec3(0.013, 0.026, 0.028);',
    '  float key  = exp(-(pow(q.x - 0.62, 2.0) + pow(q.y - 0.42, 2.0)) / 0.42);',
    '  col += vec3(0.105, 0.190, 0.205) * key * breathe;',
    // Il rimbalzo dal basso a sinistra vira al magenta: c'è anche nella loro
    // stanza, ed è quello che impedisce al teal di diventare monocromo. Tenuto
    // BASSO e stretto: misurato, invadeva mezzo quadro ed era il doppio del
    // dovuto — la loro è una macchia d'angolo, non un secondo fondale.
    '  float fill = exp(-(pow(q.x + 0.62, 2.0) + pow(q.y + 0.52, 2.0)) / 0.34);',
    '  col += mix(uViolet, uPink, 0.45) * fill * 0.085;',
    '  return col;',
    '}',
    // La stessa stanza vista come direzione, per il raggio riflesso. Poca luce
    // e molto buio: il corpo del vetro deve restare quasi nero — nel
    // riferimento i toni medi stanno a #152226, luminanza 30 su 255. A dare il
    // colore non è l'ambiente, è il film sottile qui sotto.
    'vec3 env(vec3 d){',
    '  return vec3(0.24, 0.42, 0.46) * smoothstep(-0.20, 0.95, d.y * 0.6 + d.x * 0.55)',
    '       + vec3(0.05, 0.12, 0.14) * smoothstep(0.40, -0.90, d.y)',
    '       + mix(uViolet, uPink, 0.5) * smoothstep(0.00, -0.85, d.x) * 0.16;',
    '}',
    /* INTERFERENZA A FILM SOTTILE — l'effetto bolla di sapone.
     *
     * È questa la ragione per cui nella loro spina convivono verde, magenta,
     * oro e ciano sulla stessa superficie. Non è illuminazione: quattro luci
     * colorate danno quattro tinte, mai un giro di spettro. Qui la luce si
     * riflette due volte, sulla faccia esterna del film e su quella interna, e
     * le due onde tornano sfasate del cammino ottico in più fatto dalla
     * seconda: 2·n·d·cosθ. Dove quel ritardo vale mezza lunghezza d'onda le due
     * si annullano, dove ne vale una intera si sommano — e siccome ogni colore
     * ha la sua lunghezza d'onda, ogni colore si annulla a un angolo diverso.
     * Da lì la tinta che gira mentre la superficie si inclina.
     *
     * Le tre lunghezze d'onda sono quelle dei nostri tre canali, in nanometri.
     */
    'vec3 thinFilm(float thickNm, float cosI){',
    '  float opd = 2.0 * 1.35 * thickNm * max(cosI, 0.05);',   // n del film ~1.35
    '  vec3 phase = 6.2831853 * opd / vec3(680.0, 545.0, 445.0);',
    '  return 0.5 + 0.5 * cos(phase);',
    '}'
  ].join('\n');

  function roomUniforms(){
    return { uRes: uRes, uTime: uTime,
             uViolet: { value: VIOLET }, uBlue: { value: BLUE }, uPink: { value: PINK } };
  }

  // ------------------------------------------------------------- ambiente
  // Un piano appeso alla camera, non un gradiente CSS: quello che sta fuori dal
  // WebGL non è interrogabile dallo shader del vetro, e l'interno della colonna
  // uscirebbe nero.
  var bgMat = new THREE.ShaderMaterial({
    uniforms: roomUniforms(),
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: ROOM_GLSL + [
      '',
      'void main(){ gl_FragColor = vec4(room(gl_FragCoord.xy / uRes), 1.0); }'
    ].join('\n'),
    depthWrite: false, depthTest: false
  });
  var bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  bg.position.z = -1;
  camera.add(bg);
  scene.add(camera);

  // `world` è il posto in cui si scende: contiene la spina e sale sullo scroll,
  // che a schermo vuol dire che scendi tu.
  var world = new THREE.Group();
  scene.add(world);

  /* ---------------------------------------------------------------- vetro
   *
   * Il materiale si costruisce DUE volte, una per faccia. Non è duplicazione:
   * è il modo di far vedere dentro un solido.
   *
   * Con `depthWrite` acceso una vertebra nasconde quella dietro e il vetro si
   * legge come un pieno colorato. Spegnendolo si vede tutto insieme, ma senza
   * profondità l'ordine in cui i triangoli finiscono a schermo è l'ordine in
   * cui stanno nel file, cioè nessun ordine — e con la trasparenza l'ordine è
   * il risultato. Disegnando prima solo le facce interne (`BackSide`) e poi
   * solo quelle esterne (`FrontSide`) l'ordine giusto torna dove conta: quello
   * che sta oltre viene posato prima di quello che sta davanti.
   *
   * Le due materie devono CONDIVIDERE gli uniform di tempo e risoluzione, e
   * per questo c'è una funzione e non un `clone()`: three, clonando, copia in
   * profondità anche i valori degli uniform, e le due facce si ritroverebbero
   * ognuna con il suo orologio.
   */
  /* Torna OPACO, e le due passate se ne vanno.
   *
   * La trasparenza era mia, da una richiesta poi corretta: non vetro
   * attraversabile, ma una sostanza gelatinosa riflettente. E la differenza
   * non è solo di gusto — vedere il lato lontano attraverso quello vicino
   * SOMMA due superfici nello stesso pixel, e due superfici sovrapposte non si
   * leggono come una forma. Su un modello già liscio era il colpo di grazia al
   * poco rilievo che aveva. Tornando opaco il depth buffer rimette ogni
   * vertebra davanti a quella dietro, e la gelatina la fa il materiale: molto
   * riflesso, poca trasmissione, superficie bagnata.
   */
  var spineMat = new THREE.ShaderMaterial({
    uniforms: (function(u){
      u.uAppear = uAppear;
      // n = 1.455 è vetro ottico. I tre canali hanno indici leggermente
      // diversi perché è ESATTAMENTE quella differenza a essere la
      // dispersione: il rosso piega meno del blu. eta è n1/n2, cioè l'inverso
      // dell'indice, che è quello che vuole refract().
      u.uEta   = { value: new THREE.Vector3(1 / 1.440, 1 / 1.455, 1 / 1.470) };
      // Riflettanza a incidenza zero: F0 = ((n1-n2)/(n1+n2))^2 = 0.0339. Il
      // vetro di faccia riflette il 3%, di striscio quasi tutto, ed è questo
      // salto a far leggere una superficie come vetro e non come plastica.
      u.uF0    = { value: Math.pow((1 - 1.455) / (1 + 1.455), 2) };
      u.uThick = { value: 0.030 };                    // cammino ottico apparente
      // Spessore del film iridescente, in nanometri. Sotto i ~200 nm le tinte
      // sbiadiscono verso il bianco, sopra i ~700 gli ordini si accavallano e
      // il colore diventa sporco: 380 è dove il giro di spettro è più netto.
      u.uFilmNm = { value: 380.0 };
      u.uTransmit = { value: G.hexToVec3('#CBB6FF') };
      return u;
    })(roomUniforms()),
    vertexShader: [
      'attribute float aCurv;',
      'varying vec3 vN; varying vec3 vV; varying float vY; varying float vCurv;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vN = normalize(normalMatrix * normal);',
      '  vV = normalize(-mv.xyz);',
      '  vY = position.y;',                       // serve solo a sfasare il respiro
      '  vCurv = aCurv;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: ROOM_GLSL + [
      '',
      'uniform float uAppear;',
      'uniform vec3 uEta; uniform float uF0; uniform float uThick; uniform vec3 uTransmit;',
      'uniform float uFilmNm;',
      'varying vec3 vN; varying vec3 vV; varying float vY; varying float vCurv;',
      '',
      'void main(){',
      '  vec3 N = normalize(vN); vec3 V = normalize(vV); vec3 I = -V;',
      '  vec2 suv = gl_FragCoord.xy / uRes;',
      // Crinali e cavità, dalla curvatura calcolata al caricamento. Positivo =
      // concavo, negativo = convesso.
      '  float cavity = clamp( vCurv, 0.0, 1.0);',
      '  float ridge  = clamp(-vCurv, 0.0, 1.0);',
      '  float cosT = clamp(dot(N, V), 0.0, 1.0);',
      // Fresnel di Schlick: quanta luce torna indietro invece di entrare.
      '  float F = uF0 + (1.0 - uF0) * pow(1.0 - cosT, 5.0);',
      // Il vetro respira. Qui c'era il simplex noise di WC.glsl e costava venti
      // fps buoni; due seni fanno lo stesso.
      '  vec2 wob = vec2(sin(vY * 9.0 + uTime * 0.5), cos(vY * 7.0 + uTime * 0.4)) * 0.0016;',
      // TRASMISSIONE. Il raggio viene piegato davvero, con la legge di Snell —
      // è quello che fa refract() — e una volta per canale. Da lì la
      // dispersione, cioè le frange colorate sui bordi delle vertebre.
      '  vec2 dr = refract(I, N, uEta.r).xy * uThick + wob;',
      '  vec2 dg = refract(I, N, uEta.g).xy * uThick + wob;',
      '  vec2 db = refract(I, N, uEta.b).xy * uThick + wob;',
      '  vec3 refr = vec3(room(suv + dr).r, room(suv + dg).g, room(suv + db).b);',
      // Beer-Lambert: la luce che attraversa il vetro perde le lunghezze d'onda
      // che il vetro assorbe, in proporzione al cammino. Il cammino cresce di
      // striscio, dove si guarda il pezzo di taglio, e (1 - cosT) lo approssima
      // senza dover misurare lo spessore vero — che vorrebbe un secondo passo.
      '  float path = uThick * (1.0 + 4.0 * (1.0 - cosT));',
      '  refr *= exp(-(vec3(1.0) - uTransmit) * path * 5.5);',
      // RIFLESSO, tinto dal film. Lo spessore non è uniforme: varia lungo il
      // corpo e lentissimamente nel tempo, ed è la disuniformità a produrre le
      // FASCE di colore invece di una tinta sola su tutto l'oggetto.
      '  float thick = uFilmNm * (0.72 + 0.42 * sin(vY * 6.5) * cos(vY * 2.7 + uTime * 0.08));',
      '  vec3 film = thinFilm(thick, cosT);',
      // La tinta del film si normalizza sulla sua media, se no scurirebbe: il
      // film non toglie luce, la RIDISTRIBUISCE tra i colori.
      '  film /= max(1e-3, (film.r + film.g + film.b) / 3.0);',
      // Tetto sulla tinta: senza, dove due canali si annullano insieme il terzo
      // schizza a valori altissimi e il pixel esce giallo puro tagliato. La
      // saturazione così resta alta ma il colore non si spezza.
      '  film = min(film, vec3(1.75));',
      // E si tira verso il bianco. A piena forza l'interferenza dà un
      // arcobaleno al neon: misurata, saturazione 0.589 contro 0.432 del
      // riferimento, con le alte luci virate al giallo invece che al
      // blu-grigio. Un film reale su una superficie reale non è mai puro —
      // spessore e angolo variano dentro il singolo pixel, e quella media
      // sbianca la tinta. Questo mix è quella media.
      '  film = mix(vec3(1.0), film, 0.58);',
      '  vec3 refl = env(reflect(I, N)) * film;',
      // Le due parti si miscelano pesate da Fresnel, non si sovrappongono a
      // caso: quello che non è riflesso è esattamente quello che è entrato.
      // La trasmissione pesa poco perché il corpo deve restare quasi NERO: nel
      // riferimento i medi stanno a luminanza 30 su 255, e il colore lo porta
      // solo quello che la superficie riflette.
      '  vec3 col = mix(refr * 0.30, refl * 2.60, F);',
      // Quota fissa quasi nulla: è lei che alzava il fondo di TUTTA la
      // superficie, e misurando le ombre stavano a #2A2B41 contro le #091112
      // del riferimento. Il corpo del vetro deve essere buio, non grigio.
      '  col += refl * 0.05;',
      // I DUE COLPI DI LUCE. Sono la firma del riferimento: righe bianche
      // strette e taglienti sul labbro di ogni vertebra, non un lustro diffuso.
      // Per questo l'esponente è altissimo e l'intensità pure: un lobo largo
      // darebbe cera, non cromo. Pesati da Fresnel, perché un colpo speculare
      // che non rispetta Fresnel è una macchia appiccicata sopra.
      '  vec3 L1 = normalize(vec3(-0.40, 0.75, 0.55));',
      '  vec3 L2 = normalize(vec3( 0.62, 0.25, 0.74));',
      // I colpi di luce NON sono bianchi. Nel riferimento le alte luci si
      // fermano a #8591AF, un blu-grigio smorzato: la stanza è debole, e una
      // luce bianca piena sarebbe più forte della sorgente che la produce.
      // Anche loro passano dal film — è la stessa superficie a rifletterli.
      '  col += vec3(0.72, 0.80, 0.98) * film * pow(max(dot(N, normalize(L1 + V)), 0.0), 220.0) * (3.20 + F * 11.0);',
      '  col += vec3(0.45, 0.62, 0.78) * film * pow(max(dot(N, normalize(L2 + V)), 0.0), 110.0) * (1.30 + F *  5.0);',
      // Il filo di striscio prende la tinta del film invece di essere arancione
      // fisso: a quell'angolo il cammino ottico è massimo, ed è lì che
      // l'iridescenza è più satura.
      '  col += film * vec3(0.55, 0.50, 0.46) * pow(1.0 - cosT, 6.0) * 1.35;',
      // IL RILIEVO. Su una superficie senza spigoli la luce non ha niente su
      // cui spezzarsi: qui gliela si dà. Le cavità si chiudono — è dove la
      // luce d'ambiente fatica ad arrivare, cioè occlusione, e sono le fessure
      // fra un processo e l'altro. I crinali prendono un filo in più, e col
      // colore del film, perché sono i bordi delle vertebre.
      '  col *= 1.0 - cavity * 0.72;',
      '  col += film * ridge * ridge * (0.16 + F * 0.55) * 1.30;',
      // Compressione più leggera: a 0.24 tagliava le alte luci a #58595C
      // contro le #8591AF misurate sul riferimento. Comprimere serve a non far
      // saturare i colpi, non a spegnerli.
      '  col = col / (1.0 + col * 0.08);',
      // QUANTO È OPACO, punto per punto. È questo a rendere il vetro vetro
      // Comparsa: si sfuma verso la stanza, cioè verso quello che c'è dietro.
      // Su un materiale opaco abbassare il colore darebbe una sagoma nera, non
      // una sparizione.
      '  gl_FragColor = vec4(mix(room(suv), col, uAppear), 1.0);',
      '}'
    ].join('\n'),
    // Opaco: il depth buffer rimette ogni vertebra davanti a quella dietro, ed
    // è metà del rilievo che si vede.
    transparent: false, depthWrite: true, depthTest: true, side: THREE.FrontSide
  });

  var spine = new THREE.Mesh(new THREE.BufferGeometry(), spineMat);
  spine.visible = false;                 // finché il modello non c'è
  world.add(spine);

  var spineGeo = null, geoState = 'idle';
  var TRAVEL = 1;                        // corsa del mondo, la calcola resize()

  /* Un parser GLB in quaranta righe invece del GLTFLoader degli examples.
   * Non è avarizia di kilobyte: questo file è UNA mesh indicizzata con le sole
   * posizioni, niente materiali, niente texture, niente scene graph, niente
   * estensioni — cioè quasi tutto il loader vero sarebbe codice che non gira
   * mai. Il patto è che se il modello un giorno diventa più ricco questa
   * funzione va buttata e va caricato il loader completo: perciò qui si lancia
   * un errore invece di disegnare mezza mesh in silenzio.
   */
  function parseGlb(buf){
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('non è un GLB');

    var off = 12, json = null, binOff = -1;
    while (off + 8 <= dv.byteLength) {
      var len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      if (type === 0x4E4F534A) {         // 'JSON'
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
      } else if (type === 0x004E4942) {  // 'BIN\0'
        binOff = off + 8;
      }
      off += 8 + len;
    }
    if (!json || binOff < 0) throw new Error('GLB senza chunk JSON o BIN');

    var prim = json.meshes && json.meshes.length === 1 && json.meshes[0].primitives[0];
    if (!prim || !prim.attributes || prim.attributes.POSITION === undefined || prim.indices === undefined)
      throw new Error('atteso un GLB con una sola mesh indicizzata: ripassalo da scripts/pack-spine-glb.js');

    function read(accIdx, Ctor, comps){
      var acc = json.accessors[accIdx], bv = json.bufferViews[acc.bufferView];
      // Un bufferView interlacciato mescolerebbe attributi diversi nello stesso
      // passo: qui non capita, ma leggerlo come contiguo darebbe una geometria
      // muta e sbagliata invece di un errore.
      if (bv.byteStride) throw new Error('bufferView interlacciato non supportato');
      return new Ctor(buf, binOff + (bv.byteOffset || 0) + (acc.byteOffset || 0), acc.count * comps);
    }
    var iType = json.accessors[prim.indices].componentType;
    var IdxCtor = iType === 5125 ? Uint32Array : iType === 5123 ? Uint16Array : Uint8Array;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(read(prim.attributes.POSITION, Float32Array, 3), 3));
    geo.setIndex(new THREE.BufferAttribute(read(prim.indices, IdxCtor, 1), 1));
    // Il modello arriva NUDO: senza normali il vetro non esiste — Fresnel,
    // riflessi e direzione di rifrazione dipendono tutti da lì.
    geo.computeVertexNormals();
    // E va centrato: nasce con la y da -0.997 a +0.959, e ruotare attorno a un
    // asse spostato di due centimetri su due metri di modello si vede eccome.
    geo.center();
    computeCurvature(geo);
    return geo;
  }

  /* CURVATURA PER VERTICE — concavo o convesso, e quanto.
   *
   * Serve perché questo modello è una scansione lisciata: misurato, l'angolo
   * diedro medio tra facce adiacenti è 8.9° e solo il 3.7% degli spigoli
   * supera i 30°. Non ha spigoli, quindi la luce da sola non ha niente su cui
   * spezzarsi e la colonna si legge come una candela sciolta. La curvatura è
   * l'unica informazione di forma che la mesh contiene davvero, e va tirata
   * fuori a mano.
   *
   * La stima: per ogni vertice si guarda dove cadono i vicini rispetto al suo
   * piano tangente. Se stanno sotto, la superficie lì è convessa — un crinale.
   * Se stanno sopra, è concava — una cavità. Nessuna derivata a schermo, quindi
   * nessuna estensione WebGL da sperare che ci sia, e il costo si paga una
   * volta sola al caricamento invece che a ogni pixel di ogni fotogramma.
   */
  function computeCurvature(geo){
    var pos = geo.attributes.position.array;
    var nor = geo.attributes.normal.array;
    var idx = geo.index.array;
    var n   = pos.length / 3;
    var acc = new Float32Array(n), cnt = new Uint32Array(n);

    function pair(a, b){
      var dx = pos[b*3] - pos[a*3], dy = pos[b*3+1] - pos[a*3+1], dz = pos[b*3+2] - pos[a*3+2];
      var L = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (L < 1e-9) return;
      acc[a] += (dx*nor[a*3] + dy*nor[a*3+1] + dz*nor[a*3+2]) / L;
      cnt[a]++;
    }
    for (var f = 0; f < idx.length; f += 3) {
      var a = idx[f], b = idx[f+1], c = idx[f+2];
      pair(a,b); pair(b,a); pair(b,c); pair(c,b); pair(c,a); pair(a,c);
    }

    var curv = new Float32Array(n), i;
    for (i = 0; i < n; i++) curv[i] = cnt[i] ? acc[i] / cnt[i] : 0;

    // Scala su un percentile alto, non sul massimo: basta un vertice degenere
    // — e su una scansione ce n'è sempre qualcuno — perché il massimo schiacci
    // tutto il resto contro lo zero e il termine sparisca.
    var mag = new Float32Array(n);
    for (i = 0; i < n; i++) mag[i] = Math.abs(curv[i]);
    var sorted = Array.prototype.slice.call(mag).sort(function(x, y){ return x - y; });
    var scale = sorted[Math.floor(n * 0.97)] || 1e-4;
    for (i = 0; i < n; i++) curv[i] = Math.max(-1, Math.min(1, curv[i] / scale));

    geo.setAttribute('aCurv', new THREE.BufferAttribute(curv, 1));
  }

  /* Scala della colonna e lunghezza della corsa. Le due cose NON sono
   * indipendenti: la corsa è quello che avanza della spina dopo aver tolto
   * un'inquadratura piena e il margine, quindi una colonna più sottile è anche
   * una colonna più corta, e sotto una certa lunghezza non c'è più niente da
   * percorrere. Da qui il minimo: se la larghezza da sola non basta a produrre
   * una discesa leggibile, è la spina ad allungarsi.
   */
  function sizeSpine(){
    var narrow = window.innerWidth <= 900;
    var margin = narrow ? CONFIG.endMarginNarrow : CONFIG.endMargin;
    var visW   = VIS_H * camera.aspect;

    var s = (visW * (narrow ? CONFIG.widthFracNarrow : CONFIG.widthFrac)) / CONFIG.modelW;
    var fromWidth = CONFIG.modelH * s / margin - VIS_H;

    TRAVEL = Math.max(CONFIG.travelMin, fromWidth);
    s = Math.max(s, ((TRAVEL + VIS_H) * margin) / CONFIG.modelH);

    spine.scale.setScalar(s);
    spine.position.set(0, -TRAVEL / 2, 0);   // centrata sulla corsa
  }

  function loadSpine(){
    if (geoState !== 'idle') return;
    geoState = 'loading';
    fetch(CONFIG.glbSrc).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function(buf){
      spineGeo = parseGlb(buf);
      spine.geometry = spineGeo;
      spine.visible = true;
      geoState = 'ready';
    }).catch(function(err){
      geoState = 'failed';
      console.error('[WC] spina 3D non caricata: ' + CONFIG.glbSrc, err);
      section.classList.remove('-live');
      section.classList.add('-static');
      stop();
    });
  }

  // -------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, appear = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();

  function resize(){
    var r = pin.getBoundingClientRect();
    rect.w = Math.max(1, r.width); rect.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.w, rect.h, false);
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();
    uRes.value.set(rect.w * dpr, rect.h * dpr);
    sizeSpine();
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    appear = Math.min(1, appear + dt / 1.4);
    uTime.value = now / 1000;
    uAppear.value = appear;

    // LE DUE COSE CHE DIPENDONO SOLO DALLO SCROLL, e da nient'altro: nessun
    // termine in dt, nessuna deriva a riposo. Se il dito si ferma, si fermano.
    //
    //   il mondo sale  ->  a schermo tu scendi lungo la colonna
    //   la spina gira  ->  su sé stessa, tre quarti di giro in tutta la corsa
    //
    // `scroll` non è la progressione grezza: è quella inseguita da uno
    // smorzamento esponenziale, quindi si ferma con un rallentamento invece che
    // di colpo. È inerzia, non un'animazione a tempo.
    world.position.y = scroll * TRAVEL;
    spine.rotation.y = scroll * Math.PI * 2 * CONFIG.spineTurns;

    renderer.render(scene, camera);
  }

  function start(){
    if (running || document.hidden || geoState === 'failed') return;
    loadSpine();                       // gli 800 KB del modello partono alla
    running = true;                    // prima entrata nella sezione, non al
    last = performance.now();          // load della pagina
    raf = requestAnimationFrame(frame);
  }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

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

  return function(){
    stop();
    stPin.kill(); stLife.kill();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    // `spine.geometry` e non `spineGeo`: se la sezione viene smontata mentre
    // gli 800 KB sono ancora per strada, sulla mesh c'è il segnaposto vuoto e
    // spineGeo è null. Così se ne va quella giusta in tutti e due i casi.
    spine.geometry.dispose(); spineMat.dispose();
    bg.geometry.dispose(); bgMat.dispose();
    renderer.dispose();
    section.classList.remove('-live');
  };
});
