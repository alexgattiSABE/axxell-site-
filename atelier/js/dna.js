/* CAP 02 — dietro il manifesto scorre una doppia elica.
 *
 * Il capitolo era testo su nero e basta: l'unico punto della pagina in cui si
 * afferma un metodo, e l'unico senza niente che si muova. L'elica sta a destra,
 * fuori dalla colonna di testo (`.wc-manifesto-text` è larga 22ch), così le due
 * cose non si contendono lo stesso spazio: si legge a sinistra, si guarda a
 * destra.
 *
 * Scena "DNA Helix" di GetLayers, portata da three 0.143 a modulo ES sul r128
 * globale che usa il resto della pagina. Come per il tunnel e il warp NON
 * arriva il post-processing dell'originale (tre EffectComposer, due
 * UnrealBloom e un pass finale con le fiamme d'angolo): erano quattro passate
 * a schermo intero per una sezione che è, prima di tutto, un blocco di testo
 * da leggere. Restano i punti in additive su fondo trasparente — il nero è
 * quello della pagina, non un rettangolo dipinto dal canvas.
 *
 * La forma non è modellata: la geometria è solo un reticolo di semi. Il vertex
 * shader legge tre numeri casuali per punto e lo assegna a uno dei tre gruppi —
 * il 40% al primo filamento, il 40% al secondo (mezzo giro più in là), il 20%
 * ai pioli che li legano. Per questo la sfera va de-indicizzata: THREE.Points
 * onora l'indice e ridisegnerebbe ogni vertice sei volte sopra sé stesso.
 *
 * Lo scroll fa scendere l'elica davanti alla camera e la fa girare su sé
 * stessa — non la stringe e non la inclina: `scrollTwist` e `scrollTilt` sono
 * stati tolti, e il perché sta nel CONFIG. Il cursore fa parallasse e scosta i
 * filamenti al suo passaggio.
 */
WC.register('dna', function(ctx){
  var section = document.getElementById('cap02');
  var pin     = document.getElementById('wcManifestoPin');
  var canvas  = document.getElementById('wcDnaCanvas');
  var orbitEl = document.getElementById('wcDnaOrbit');

  /* RI-COLLOCAZIONE (Task 2, atelier/effetti.html). Il montaggio di default
   * resta questo: sezione + pin + canvas del manifesto trovati per id, con
   * l'offset a destra, le parole in orbita, lo ScrollTrigger della sezione.
   * Se quel terzetto non c'è in pagina si cerca un elemento generico
   * `[data-role="helix-stage"]`: fa lui da PIN (la size del canvas viene dal
   * suo rettangolo, esattamente come per il manifesto) e da contenitore per
   * il canvas dell'elica. In quel montaggio — `standalone` — l'elica sta al
   * CENTRO (offsetX = 0, vedi CONFIG più sotto), non ci sono parole in
   * orbita (erano pensate per stare accanto alla colonna di testo del
   * manifesto, qui non c'è) e non c'è una sezione da pinnare: lo scroll che
   * la muove è quello GLOBALE della pagina, non quello di una sezione. */
  var standalone = false;
  if (!section || !pin || !canvas) {
    var mountEl = document.querySelector('[data-role="helix-stage"]');
    if (!mountEl) return;
    standalone = true;
    pin = mountEl;
    canvas = mountEl.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      mountEl.appendChild(canvas);
    }
    orbitEl = null; // niente parole in orbita fuori dal manifesto
  }

  // Le parole in orbita attorno all'elica. Ogni parola esiste in DUE copie, una
  // sotto il canvas e una sopra, che si scambiano l'opacità a seconda di dove
  // sta lungo il giro: è l'unico modo per farla passare davvero DIETRO l'elica,
  // perché il DOM non si interlaccia con un canvas — o sta tutto sopra, o tutto
  // sotto. Il canvas è trasparente proprio per questo.
  // Sedici e non più otto: con otto, su una spirale lunga due giri e mezzo, si
  // vedevano due parole per volta e il filo sembrava spoglio. A sedici la
  // spirale si legge come una scia continua senza che nessuna copra l'altra —
  // le quote sono equidistanti (`offset: i / WORDS.length`), quindi il passo si
  // stringe da solo quando se ne aggiungono.
  // Qualità, non tecnologie. Prima erano i nomi del mestiere (WEBGL, SHADER,
  // RESPONSIVE, SEO): dicevano con cosa è fatto un sito, mentre il capitolo
  // parla di cosa deve ottenere. Il manifesto qui accanto dice «cosa capisce
  // nei primi tre secondi, cosa lo convince» — queste sono quelle cose lì.
  var WORDS = ['ORIGINALITÀ','STILE','UNICITÀ','CARATTERE','IDENTITÀ','PRESENZA',
               'CHIAREZZA','PRECISIONE','ELEGANZA','AUDACIA','CURA','INTENZIONE',
               'RITMO','EQUILIBRIO','TENSIONE','MEMORIA'];
  var pairs = [];

  /* I COLORI DELLE PAROLE — le quattro fermate dell'elica, a BLOCCHI.
   *
   * Non una parola per tinta a giro: sedici parole divise in quattro gruppi da
   * quattro, nell'ordine in cui le tinte stanno sull'elica dall'alto in basso
   * (rosso in cima, poi viola, verd'acqua, blu in fondo). Le parole scendono
   * lungo la spirale nello stesso ordine — `offset: i / WORDS.length` — quindi
   * il blocco di colore scende con loro e la scia legge come una continuazione
   * dell'elica invece che come un'etichetta appiccicata sopra.
   *
   * Le tinte NON sono le stesse esadecimali del CONFIG: quelle sono fatte per
   * essere sommate additivamente e moltiplicate per `brightness` 1.55: come
   * colore di testo su nero, #8f1526 e #0b2f8c sono quasi illeggibili. Qui
   * sono gli stessi quattro toni portati in luminanza — stessa tinta, stessa
   * sequenza, contrasto sufficiente per leggere una parola. */
  /* Le stesse QUATTRO FERMATE dello shader, in inchiostro leggibile e
   * nell'ordine in cui le legge lui: `g` = 0 in fondo, `g` = 1 in cima.
   * Le esadecimali del CONFIG non si possono riusare — la' la fusione e'
   * additiva e i punti si sommano, qui e' testo su nero e #0b2f8c non si
   * legge. Stessa tinta, stessa sequenza, contrasto da leggere. */
  //          blu(basso)   verd'acqua   viola        rosso(alto)
  var INK = [[42,107,255], [22,226,196], [166,60,232], [255,61,85]];

  /* La scala di colore, identica a quella del vertex shader: le stesse tre
   * miscelazioni, con le stesse finestre sovrapposte. Se un giorno si toccano
   * le soglie la', vanno toccate anche qui — sono la stessa scala scritta due
   * volte, una per la GPU e una per il DOM. */
  function mixRGB(a, b, k){
    return [a[0] + (b[0] - a[0]) * k,
            a[1] + (b[1] - a[1]) * k,
            a[2] + (b[2] - a[2]) * k];
  }
  function ink(g){
    var c = mixRGB(INK[0], INK[1], G.smoothstep(0.02, 0.24, g));
    c = mixRGB(c, INK[2], G.smoothstep(0.40, 0.62, g));
    c = mixRGB(c, INK[3], G.smoothstep(0.76, 0.97, g));
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }

  // Reduced-motion o niente WebGL: il capitolo (manifesto) resta com'era,
  // testo su nero, e le parole diventano una lista in fila sotto il
  // manifesto — leggibile, ferma. Fuori dal manifesto (montaggio standalone)
  // reduced-motion NON spegne l'elica: è l'asse centrale della pagina, non
  // un capitolo che si può saltare — resta un asse presente ma FERMO finché
  // non si scorre (`reducedStandalone` più sotto decide come).
  if ((!ctx.motionOk && !standalone) || typeof THREE === 'undefined') {
    canvas.style.display = 'none';
    if (orbitEl) {
      orbitEl.classList.add('-static');
      WORDS.forEach(function(w){
        var s = document.createElement('span');
        s.className = 'wc-dna-word';
        s.textContent = w;
        orbitEl.appendChild(s);
      });
    }
    return;
  }
  var reducedStandalone = standalone && !ctx.motionOk;

  if (orbitEl) {
    var back  = document.createElement('div'); back.className  = 'wc-dna-layer -back';
    var front = document.createElement('div'); front.className = 'wc-dna-layer -front';
    pairs = WORDS.map(function(w, i){
      /* Ogni parola è una fila di LETTERE, non un testo unico.
       *
       * Serve alla piegatura: una parola che si curva deve avere i suoi
       * caratteri su un arco, e un nodo di testo solo non si può piegare —
       * al massimo lo si inclina. Le lettere si tagliano UNA VOLTA, alla
       * costruzione, e ognuna si porta due costanti:
       *
       *   --k   distanza dal centro al quadrato, con segno: è la campana che
       *         fa l'arco (le lettere ai capi scendono, quelle in mezzo no)
       *   --r   distanza dal centro con segno: è il ventaglio, quanto ogni
       *         lettera ruota rispetto alla successiva
       *
       * Il loop poi scrive UNA sola custom property per parola (`--bend`), e
       * la curva la compone il CSS. Con la matematica per lettera in
       * JavaScript sarebbero state duecento scritture di stile a fotogramma
       * invece di sedici. */
      var mk = function(layer){
        var s = document.createElement('span');
        s.className = 'wc-dna-word';
        var chars = [];
        var n = w.length;
        for (var c = 0; c < n; c++) {
          var ch = document.createElement('span');
          ch.className = 'wc-dna-ch';
          // Lo spazio unificatore: uno spazio normale dentro un inline-block
          // collasserebbe e la parola si stringerebbe.
          ch.textContent = w[c] === ' ' ? '\u00a0' : w[c];
          s.appendChild(ch);
          chars.push(ch);
        }
        layer.appendChild(s);
        return { el: s, chars: chars };
      };
      var mb = mk(back), mf = mk(front);
      /* IL COLORE NON SI DECIDE QUI. Prima era `WORD_COLORS[floor(i/per)]`:
       * fissato dall'indice della parola, cioe' immobile. Ma l'altezza di una
       * parola NON e' il suo indice — e' `u = offset + scroll * wordScrollTurns`,
       * che cambia mentre si scorre e si riavvolge in cima. Con l'elica che a
       * sua volta sale, la tinta assegnata all'inizio non poteva coincidere con
       * quella del tratto d'elica accanto nemmeno per caso: una parola rossa si
       * ritrovava a girare attorno al blu.
       * Adesso lo decide `layoutWords()` a ogni fotogramma, leggendo l'altezza
       * VERA della parola nella stessa scala che usa lo shader. */
      return {
        b: mb.el, f: mf.el, bc: mb.chars, fc: mf.chars, n: w.length, pp: -1,
        // Sfasate in modo uniforme lungo la spirale: se partissero insieme
        // sarebbero un anello di otto parole, non una scia.
        offset: i / WORDS.length,
        phase: (i % 3) * 2.1,
        rx: 0.86 + (i % 3) * 0.09,
        col: ''        // ultima tinta scritta: evita 32 scritture di stile a vuoto
      };
    });
    orbitEl.appendChild(back);
    orbitEl.appendChild(front);
  }

  var G = WC.glsl;
  var cleanups = [];

  var wide = window.innerWidth;
  // Come nel tunnel: il reticolo di semi si scala con la finestra. Cambia la
  // densità dei punti, non la forma — la posizione di ognuno esce dal suo hash.
  /* ⚠️ GLI ANELLI SONO SCESI DI UN TERZO, ed è la contropartita della densità
   * uniforme. Prima i punti si ammassavano ai capi e si diradavano in mezzo;
   * col passaggio all'angolo la densità è la stessa ovunque — ma "ovunque" è
   * quella dei CAPI, cioè l'elica al centro sarebbe risultata 1.54 volte più
   * fitta di com'era. Il conto: la densità per unità di quota passa da
   * `1/(29.4·sin φ)` a `π/58.8`, e nell'inquadratura iniziale sin φ vale 0.981
   * → 28.8 contro 18.7. Gli anelli si moltiplicano per 1/1.54 = 0.649 e
   * l'elica torna esattamente fitta com'era all'inizio dello scroll.
   * Se dovesse sembrare troppo rada o troppo densa, la manopola è QUESTA (il
   * secondo numero), non `pointSize`: quella cambierebbe anche lo spessore. */
  var seg    = wide > 1440 ? [140, 273] : wide > 1024 ? [120, 221] : [90, 156];
  var maxDpr = wide > 1024 ? 1.75 : 1.25;

  // Valori originali della scena GetLayers. Quelli del pass finale (bgColor,
  // flameColor, flameAmt) non compaiono: vivevano nel post-processing che qui
  // non c'è.
  var CONFIG = {
    /* SCHIARITA. I due colori della scena sorgente erano #04123a e #27043e:
       nati sotto un bloom che qui non c'è (three r128 core, niente
       EffectComposer), e senza quello l'elica restava un accenno scuro su
       nero. Alzati di luminosità tenendo la STESSA coppia di tinte — blu
       profondo in basso, viola in alto — e non sostituiti con altri colori:
       il gradiente del capitolo è quello. La `brightness` sale con loro. */
    /* QUATTRO FERMATE, non più due. La scala saliva dal blu al viola e basta;
       adesso in mezzo c'è il verd'acqua e in cima il rosso. L'interpolazione è
       la stessa di prima — continua, senza gradini — solo con due tappe in più
       lungo l'altezza dell'elica: dal basso, blu → verd'acqua → viola → rosso.
       I valori restano SCURI di proposito, come i due originali: la fusione è
       additiva e i punti si sommano fra loro, quindi un colore già chiaro qui
       arriverebbe a bianco dove i filamenti si incrociano. La luminosità la
       mette `brightness`, non la tinta. */
    colorLow: '#0b2f8c',      // blu profondo in basso...
    colorAqua: '#0c8f7e',     // ...verd'acqua nel primo terzo...
    colorHigh: '#5a1386',     // ...viola nel secondo...
    colorRed: '#8f1526',      // ...e rosso in cima
    atmoColor: '#7fe6ff',
    atmoCount: wide > 1024 ? 320 : 160,
    atmoSize: 24,
    atmoSpeed: 0.4,
    /* 1.45 e non più 2. Con la fusione additiva l'opacità è un moltiplicatore
       che si SOMMA punto su punto: a 2, dove i filamenti si incrociano si
       arrivava a bianco pieno, e una zona bruciata non ha profondità per
       definizione — è tutta allo stesso valore. Abbassandola le sovrapposizioni
       restano colorate e la sfumatura fra vicino e lontano sopravvive.
       La grandezza del punto sale da 4 a 5 per compensare: stessa quantità di
       luce, distribuita invece che concentrata. */
    opacity: 1.45,
    pointSize: 5,
    brightness: 1.55,
    twist: 0.65,
    /* 0.5 e non più 0.7. Il rumore sposta l'elica anche in Z, in funzione
       dell'altezza: mentre `scrollClimb` la fa salire, il tratto inquadrato
       cambia profondità e con lei scala apparente. È lo stesso difetto della
       precessione qui sopra, in piccolo — l'ampiezza scende, il serpeggiamento
       resta. */
    waveAmt: 0.5,
    dnaFloat: 0.95,
    spin: 0.18,
    scale: 0.63,
    scrollClimb: 9.5,
    /* ⚠️ LA FORMA NON CAMBIA MAI. L'elica si muove come un CORPO RIGIDO: sale,
     * gira, si inclina. Non si stringe e non ondeggia.
     *
     * C'è stato un passaggio in cui `scrollTwist` portava la torsione da 0.65 a
     * 1.82 lungo lo scroll: le spire si stringevano, e quello non è un
     * movimento, è un rimodellamento — l'oggetto diventava un altro oggetto
     * mentre lo guardavi. Tolto.
     *
     * Un'elica però è periodica: girarla attorno al proprio asse o traslarla
     * lungo di esso la lascerebbe identica a sé stessa, e il movimento rigido
     * non si vedrebbe. Quello che lo rende visibile è `shapeTime` qui sotto: il
     * rumore che piega i filamenti viene congelato a un valore FISSO invece di
     * scorrere, quindi la piega diventa parte della forma. Con una piega
     * asimmetrica dentro, la rotazione si vede eccome — ed è sempre la stessa
     * elica che gira, non una che si deforma. */
    shapeTime: 3.2,          // l'istante a cui il rumore viene congelato
    scrollSpin: 1.8,
    /* ⚠️ L'INCLINAZIONE È STATA TOLTA, come prima `scrollTwist`. Valeva 0.16 rad
     * (~9°) crescenti con lo scroll: un'elica che pende di più man mano che
     * scendi. Il capitolo è alto e stretto e ci sta accanto una colonna di
     * testo, e una verticale che si scosta piano da un blocco di testo fermo
     * non legge come movimento — legge come storto. Adesso l'asse è verticale
     * e ci resta. */
    // ---- le parole in orbita ----
    wordRing: 0.20,          // raggio del giro, in frazioni del lato corto
    wordSpan: 1.25,          // altezza percorsa, in altezze di sezione
    wordTurns: 2.2,          // giri completi in una discesa: è questo che la fa SPIRALE
    wordScrollTurns: 1.0,    // quanto avanza la spirale attraversando la sezione
    /* ⚠️ NIENTE MOTO A RIPOSO: il capitolo si muove SOLO mentre si scorre.
     * Niente qui dentro legge l'orologio — nemmeno il pulviscolo, che prende il
     * suo tempo dallo scroll come tutto il resto. Fermo il dito, si ferma tutto
     * (restano l'assestamento dello smorzamento, mezzo secondo, e la reazione al
     * cursore, che è risposta a un input e non moto proprio). */
    scrollAtmoTime: 9,       // "secondi" di deriva del pulviscolo per traversata
    parallax: 1,
    pointerRadius: 2.2,
    pointerStrength: 0.2,
    // Aggiunto qui, non c'era nell'originale: l'originale aveva l'elica al
    // centro di una pagina vuota, qui deve stare accanto a un testo. Con la
    // camera a z 8.67 e fov 45 un'unità vale ~100 px in orizzontale, quindi
    // 2.2 la porta circa 220 px a destra del centro — fuori dalla colonna.
    offsetX: 2.2
  };

  if (standalone) {
    /* TINTA CIANO (Task 2, atelier/effetti.html) — via CONFIG, mai nello
     * shader: qui l'elica è l'asse della scena, non un capitolo a sé con le
     * sue quattro fermate cromatiche, quindi le quattro fermate diventano
     * gradazioni dello stesso ciano del sito (`#3ad8ff`, lo stesso `--hot`
     * di nav e capsule) invece di blu→verd'acqua→viola→rosso. Restano
     * SCURE come le originali — la fusione è additiva, vedi il commento sul
     * CONFIG qui sopra — e la progressione buio→chiaro è la stessa. */
    CONFIG.colorLow  = '#04222e';
    CONFIG.colorAqua = '#08475c';
    CONFIG.colorHigh = '#0d7e9e';
    CONFIG.colorRed  = '#18c9f2';
    // Al centro, non a destra: qui l'elica non condivide lo spazio con una
    // colonna di testo — è lei l'asse della pagina.
    CONFIG.offsetX = 0;
  }

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0, 0, 8.67);

  var uniforms = {
    // Congelato: è la piega fissa che rende visibile la rotazione. Vedi la nota
    // su `shapeTime` nel CONFIG.
    uTime:          { value: CONFIG.shapeTime },
    uAppear:        { value: 0 },
    uColLow:        { value: G.hexToVec3(CONFIG.colorLow) },
    uColAqua:       { value: G.hexToVec3(CONFIG.colorAqua) },
    uColHigh:       { value: G.hexToVec3(CONFIG.colorHigh) },
    uColRed:        { value: G.hexToVec3(CONFIG.colorRed) },
    uOpacity:       { value: CONFIG.opacity },
    uSize:          { value: CONFIG.pointSize },
    uBrightness:    { value: CONFIG.brightness },
    uTwist:         { value: CONFIG.twist },
    uWaveAmt:       { value: CONFIG.waveAmt },
    uFloat:         { value: CONFIG.dnaFloat },
    uScale:         { value: CONFIG.scale },
    uCursor:        { value: new THREE.Vector3() },
    uRepelRadius:   { value: CONFIG.pointerRadius },
    uRepelStrength: { value: CONFIG.pointerStrength },
    uActivity:      { value: 0 }
  };

  /* ⚠️ IL RAGGIO SERVE ANCHE ALLO SHADER, che da `position.y` deve risalire
   * all'angolo. Sta qui una volta sola e viene interpolato nel sorgente GLSL:
   * cambiarlo in un posto solo spezzerebbe la mappatura. */
  var SPHERE_R = 4.2;
  var geometry = new THREE.SphereGeometry(SPHERE_R, seg[0], seg[1]);
  geometry.setIndex(null);

  var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: [
      'uniform float uTime; uniform float uSize; uniform float uTwist;',
      'uniform float uWaveAmt; uniform float uScale; uniform float uFloat;',
      'uniform vec3 uColLow; uniform vec3 uColAqua; uniform vec3 uColHigh; uniform vec3 uColRed;',
      'uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;',
      'varying float vFade; varying vec3 vColor; varying float vDepth;',
      G.SNOISE,
      'void main(){',
      // La sfera viene stirata in un segmento verticale lungo: `t` è la quota
      // del punto lungo l'elica, e ci si somma un respiro sfasato per punto.
      /* ⚠️ DENSITÀ UNIFORME LUNGO L'ELICA, e non è un dettaglio estetico.
       *
       * Era `position.y * 7.0 - 8.0`. Una sfera UV ha lo stesso numero di
       * vertici su ogni anello, ma gli anelli sono equispaziati in ANGOLO, non
       * in altezza: `y = R·cos(φ)`. Passando dall'altezza si eredita quel
       * coseno, e la densità lungo l'elica va come `1/sin(φ)` — cioè i punti si
       * ammassano ai due capi.
       *
       * Si vedeva: `scrollClimb` fa sfilare l'elica, e verso la fine
       * l'inquadratura arrivava dove `sin(φ)` scende a ~0.71, con il 40% di
       * punti in più per unità di altezza. Con la fusione additiva quello legge
       * come "più spessa e più accesa", e i pioli — che sono solo il 20% dei
       * punti — annegavano nei due filamenti.
       *
       * Prendendo l'ANGOLO invece del coseno la densità è costante ovunque, e
       * l'elica è la stessa a qualunque quota la si guardi. L'intervallo di `t`
       * non cambia (da 21.4 in cima a -37.4 in fondo): la scala di colore e il
       * calcolo in JS che tinge le parole leggono le stesse quote di prima. */
      '  float phi = acos(clamp(position.y / ' + SPHERE_R.toFixed(1) + ', -1.0, 1.0));',
      '  float stretchedY = 21.4 - (phi / 3.14159265) * 58.8;',
      '  float rnd1 = random(position);',
      '  float rnd2 = random(position + vec3(1.0));',
      '  float rnd3 = random(position + vec3(2.0));',
      '  float t = stretchedY + sin(uTime * 0.8 + rnd1 * 6.28318) * uFloat;',
      '  float twist = t * uTwist;',
      /* PIÙ LARGA E PIÙ SPESSA. Il raggio dell'elica passa da 1.0 a 1.22 e la
       * grossezza di ogni filamento da 0.35 a 0.52. Non è solo "più grande":
       * è quello che dà ai due filamenti dello spazio in cui stare uno DIETRO
       * l'altro. Con raggio 1.0 e filamenti sottili, alla profondità della
       * camera i due passavano quasi sovrapposti e la scena si leggeva piatta,
       * come un disegno. Allargando, fra il filamento davanti e quello dietro
       * ci sono ~2.4 unità di scena: abbastanza perché la sfumatura di
       * profondità qui sotto abbia qualcosa da separare. */
      '  float dnaRadius = 1.22;',
      '  float strandThickness = 0.52;',
      '  vec3 dnaPos;',
      '  if (rnd1 < 0.40) {',                    // primo filamento
      '    vec3 core = vec3(dnaRadius * cos(twist), t, dnaRadius * sin(twist));',
      '    dnaPos = core + vec3(rnd1 - 0.2, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * strandThickness;',
      '  } else if (rnd1 < 0.80) {',             // secondo, mezzo giro più in là
      '    vec3 core = vec3(dnaRadius * cos(twist + 3.14159), t, dnaRadius * sin(twist + 3.14159));',
      '    dnaPos = core + vec3(rnd1 - 0.6, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * strandThickness;',
      '  } else {',                              // pioli: a quote discrete, non continue
      '    float rungT = (rnd1 - 0.80) * 5.0;',
      '    float discreteT = floor(t * 2.5) / 2.5;',
      '    float discreteTwist = discreteT * uTwist;',
      '    vec3 p1 = vec3(dnaRadius * cos(discreteTwist), discreteT, dnaRadius * sin(discreteTwist));',
      '    vec3 p2 = vec3(dnaRadius * cos(discreteTwist + 3.14159), discreteT, dnaRadius * sin(discreteTwist + 3.14159));',
      '    dnaPos = mix(p1, p2, rungT) + vec3(rnd1 - 0.9, rnd2 - 0.5, rnd3 - 0.5) * 2.0 * 0.16;',
      '  }',
      // Il serpeggiamento si tiene in due variabili invece di sommarlo al
      // volo: serve una seconda volta più sotto, per sapere dov'è l'ASSE
      // dell'elica a questa quota. Due chiamate di rumore, non quattro.
      '  float wx = snoise(vec3(0.0, t * 0.2, uTime * 0.2)) * uWaveAmt;',
      '  float wz = snoise(vec3(t * 0.2, 0.0, uTime * 0.2)) * uWaveAmt;',
      '  dnaPos.x += wx;',
      '  dnaPos.z += wz;',
      '  vec3 finalPos = (dnaPos - vec3(0.0, -8.0, 0.0)) * uScale;',
      '  vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);',
      '  vec3 toP = modelPosition.xyz - uCursor;',
      '  float fall = smoothstep(uRepelRadius, 0.0, length(toP));',
      '  modelPosition.xyz += normalize(toP + vec3(0.0001)) * fall * uRepelStrength * uActivity;',
      '  vec4 mvPosition = viewMatrix * modelPosition;',
      /* La scala di colore lungo l'elica, in quattro fermate. `g` è la quota
       * normalizzata (0 in fondo, 1 in cima) ed è la stessa di prima; sopra ci
       * si applicano tre miscelazioni in fila, con le finestre che si
       * SOVRAPPONGONO di qualche punto. La sovrapposizione è il punto: con
       * intervalli attaccati (0-0.33, 0.33-0.66, …) ogni giunzione sarebbe un
       * cambio di pendenza visibile, cioè una fascia. Così le transizioni si
       * fondono l'una nell'altra e la scala resta un unico passaggio continuo,
       * come lo era da blu a viola. */
      '  float g = clamp(smoothstep(-20.0, 12.0, t), 0.0, 1.0);',
      /* ⚠️ LE FINESTRE NON POSSONO ESSERE ATTACCATE. Al primo tentativo erano
       * 0.02-0.38 / 0.30-0.70 / 0.62-0.98: il verd'acqua non si vedeva MAI,
       * perché cominciava a virare al viola prima di essere arrivato a sé
       * stesso. Ogni tinta ha bisogno di un tratto in cui è PURA, e la
       * miscelazione successiva deve cominciare dopo. Qui ogni fermata tiene
       * il campo per ~0.15 di scala prima che parta quella dopo — abbastanza
       * per riconoscerla, poco perché il passaggio resti continuo. */
      '  vec3 col = mix(uColLow,  uColAqua, smoothstep(0.02, 0.24, g));',
      '  col      = mix(col,      uColHigh, smoothstep(0.40, 0.62, g));',
      '  col      = mix(col,      uColRed,  smoothstep(0.76, 0.97, g));',
      '  vColor = col;',
      /* LA PROFONDITÀ, che prima non c'era proprio: `vFade` valeva 1.0 per ogni
       * punto, la fusione è additiva, e la dimensione dipendeva da z solo per
       * la prospettiva. Risultato: davanti e dietro identici, e l'elica leggeva
       * come una macchia piatta invece che come un oggetto.
       *
       * La camera sta a z 8.67 e l'elica occupa circa ±1.25 unità attorno a
       * quella distanza: `vDepth` è la posizione dentro quella fetta, 0 sul
       * lato lontano e 1 su quello vicino. Da qui escono TRE cose che vanno
       * nella stessa direzione, ed è il fatto che vadano insieme a leggersi
       * come volume invece che come una sfumatura:
       *   la DIMENSIONE  i punti vicini sono grossi più del doppio dei lontani;
       *   la LUCE        (nel fragment) i lontani valgono un quarto;
       *   la MORBIDEZZA  (nel fragment) i lontani hanno il bordo più sfumato,
       *                  cioè sono sfocati — è la sola cosa che l'occhio legge
       *                  come "sta più indietro" e non come "è più piccolo". */
      /* ⚠️ LA PROFONDITÀ SI MISURA DALL'ASSE, non dalla camera.
       *
       * Era `(mvPosition.z + 9.95) / 2.45`: una finestra fissa, tarata su dove
       * stava l'elica al primo fotogramma. Ma l'elica NON sta ferma in Z — il
       * serpeggiamento la sposta in funzione della quota, e `scrollClimb` fa
       * cambiare la quota inquadrata. Il risultato è che la finestra si
       * spostava sotto ai punti: verso la fine `vDepth` saturava, davanti e
       * dietro smettevano di separarsi, e l'elica leggeva come una macchia
       * piatta invece che come un oggetto. Insieme alla densità, è l'altra
       * metà del "diventa enorme e i pioli non si vedono più".
       *
       * Adesso si misura quanto il punto sta davanti o dietro all'ASSE
       * dell'elica alla SUA quota — che è la cosa che `vDepth` ha sempre voluto
       * dire. L'asse porta con sé lo stesso serpeggiamento (`wx`, `wz`), quindi
       * la misura è immune a dove l'elica si trova: si sposta l'asse, si
       * spostano con lui i suoi punti, e la differenza resta quella.
       * `modelViewMatrix` è la stessa `viewMatrix * modelMatrix` usata qui
       * sopra — three la fornisce già composta, e costa un prodotto in meno. */
      '  vec3 axisLocal = (vec3(wx, dnaPos.y, wz) - vec3(0.0, -8.0, 0.0)) * uScale;',
      '  float axisZ = (modelViewMatrix * vec4(axisLocal, 1.0)).z;',
      // La fetta in cui un punto può stare: raggio più grossezza del filamento,
      // davanti e dietro. Ricavata, non scritta a mano: se l'elica si allarga,
      // la scala di profondità si allarga con lei.
      '  float axisSpan = 2.0 * (dnaRadius + strandThickness) * uScale;',
      '  vDepth = clamp((mvPosition.z - axisZ) / axisSpan + 0.5, 0.0, 1.0);',
      '  vFade = 1.0;',
      '  gl_PointSize = max(uSize * (10.0 / -mvPosition.z) * mix(0.62, 1.42, vDepth), 1.2);',
      '  gl_Position = projectionMatrix * mvPosition;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uOpacity; uniform float uBrightness; uniform float uAppear;',
      'varying float vFade; varying vec3 vColor; varying float vDepth;',
      'void main(){',
      '  vec2 xy = gl_PointCoord - 0.5;',
      '  float ll = length(xy);',
      '  if (ll > 0.5) discard;',
      // Il bordo del punto: netto davanti (0.30), molle dietro (0.50). È la
      // sfocatura, ed è quello che fa "fuori fuoco" invece di "piccolo".
      '  float a = smoothstep(0.5, mix(0.50, 0.30, vDepth), ll);',
      // La luce. 0.26 dietro, piena davanti: con la fusione additiva è questo
      // che impedisce ai due filamenti di sommarsi in un'unica macchia.
      '  float lum = mix(0.26, 1.0, vDepth);',
      '  gl_FragColor = vec4(vColor * uBrightness * lum, vFade * a * uOpacity * uAppear * lum);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });

  var group = new THREE.Group();
  group.position.x = CONFIG.offsetX;
  /* ⚠️ L'ORDINE DELLE ROTAZIONI — una GUARDIA, non più una necessità.
   *
   * Oggi la rotazione attorno a Z vale sempre zero (l'inclinazione è stata
   * tolta, vedi CONFIG), quindi l'ordine non cambia nulla. La riga resta, con
   * il perché, perché chi rimettesse l'inclinazione senza di essa ricadrebbe
   * esattamente nel difetto qui sotto — che è costato una diagnosi.
   *
   * Era il motivo per cui l'elica sembrava INGRANDIRSI verso la fine del
   * capitolo.
   *
   * Con l'ordine di default ('XYZ') three compone R = Rx·Ry·Rz, cioè applica
   * per PRIMA la Z: l'elica viene inclinata di `scrollTilt`, e POI la si fa
   * girare attorno a Y. Un corpo alto e inclinato che gira attorno all'asse
   * verticale precede come una trottola — i suoi due capi descrivono un cono
   * e a fine corsa uno dei due arriva quasi un'unità più vicino alla camera.
   * A 8,67 unità di distanza è più del 10% di scala: non cambiava la forma,
   * cambiava la distanza, ma a schermo si legge come "è diventata più grande".
   *
   * Con 'ZYX' l'ordine si inverte: prima la rotazione attorno a Y (l'elica
   * gira su sé stessa, e un'elica che gira attorno al proprio asse non si
   * avvicina di un millimetro), poi l'inclinazione attorno a Z, che a quel
   * punto è l'asse che punta alla camera — cioè un rollio nel piano dello
   * schermo, che per definizione non ha profondità. La forma resta quella e
   * la distanza pure. */
  group.rotation.order = 'ZYX';
  var points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  scene.add(group);

  var atmo = G.makeAtmosphere({ count: CONFIG.atmoCount, size: CONFIG.atmoSize,
                                speed: CONFIG.atmoSpeed, color: CONFIG.atmoColor });
  scene.add(atmo.points);

  var pointer = G.makePointer();
  cleanups.push(function(){ pointer.dispose(); });

  var scrollTarget = 0, scroll = 0, appear = 0;
  var dpr = 1, size = { w: 1, h: 1 };
  var running = false, raf = 0, last = performance.now();

  function resize(){
    // Il riquadro è quello del PIN, alto una schermata — non quello della
    // sezione, che è alta 260svh e darebbe un canvas due volte e mezzo troppo
    // alto, con l'elica schiacciata dentro.
    var r = pin.getBoundingClientRect();
    size.w = Math.max(1, r.width); size.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  /* MONTAGGIO STANDALONE — lo scroll che muove l'elica è quello GLOBALE
   * della pagina, non quello di una sezione pinnata (qui non ce n'è una).
   * Il canale preferito è Lenis: il core lo mette su `WC.lenis` solo su
   * desktop con motion consentito, e il suo getter `.progress` è già
   * `scroll/limite` in 0..1. Altrove — mobile, o reduced-motion, dove
   * `WC.lenis` resta null — lo scroll è quello nativo del browser e si
   * calcola a mano sull'altezza scorribile del documento. */
  function globalScrollProgress(){
    if (WC.lenis) return G.clamp01(WC.lenis.progress);
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return G.clamp01(window.scrollY / max);
  }

  /* UN SOLO FOTOGRAMMA, per il montaggio standalone in reduced-motion: niente
   * `requestAnimationFrame` che si riproponga da solo, niente smorzamento nel
   * tempo (`scroll` è già stato portato al target da chi chiama), niente
   * parallasse del cursore. Si ridisegna solo perché qualcosa di esplicito è
   * cambiato — lo scroll, il resize — mai da sé. */
  function renderOnce(){
    uniforms.uAppear.value = 1;
    camera.position.set(0, 0, 8.67);
    camera.lookAt(0, 0, 0);
    group.position.y = -scroll * CONFIG.scrollClimb;
    group.rotation.y = scroll * (CONFIG.spin + CONFIG.scrollSpin);
    atmo.step(scroll * CONFIG.scrollAtmoTime, camera, dpr, size.h);
    renderer.render(scene, camera);
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;

    if (standalone) scrollTarget = globalScrollProgress();
    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    // La comparsa segue lo scroll: legata all'orologio, avrebbe continuato a
    // schiarire da sola dopo che il dito si è fermato. Fuori dal manifesto
    // l'elica non ha un momento di ingresso da rivelare: è l'asse della
    // pagina, dev'esserci già al primo fotogramma.
    appear = standalone ? 1 : G.clamp01(scroll / 0.05);

    // `uTime` e `uTwist` NON si toccano più a ogni frame: sono la forma, e la
    // forma è quella. Restano al valore che hanno preso alla costruzione.
    uniforms.uAppear.value = appear;

    var mx = pointer.ndc.x, my = pointer.ndc.y;
    camera.position.set(mx * CONFIG.parallax, my * CONFIG.parallax, 8.67);
    // Dritto davanti a sé, NON verso l'elica: puntandola la camera la
    // rimetterebbe al centro dell'inquadratura e `offsetX` non sposterebbe
    // niente — è quello che faceva finire i punti sopra il testo.
    camera.lookAt(0, 0, 0);

    pointer.step(camera, dt, 0, 0, 0);
    uniforms.uCursor.value.copy(pointer.world);
    uniforms.uActivity.value = pointer.activity;

    // Le due uniche cose che si muovono, ed entrambe RIGIDE: l'elica sale e
    // gira su sé stessa. Il corpo che gira è sempre lo stesso, e sta dritto.
    group.position.y = -scroll * CONFIG.scrollClimb;
    // La rotazione non si accumula più con dt: è una funzione dello scroll,
    // altrimenti l'elica continuerebbe a girare da ferma.
    group.rotation.y = scroll * (CONFIG.spin + CONFIG.scrollSpin);

    atmo.step(scroll * CONFIG.scrollAtmoTime, camera, dpr, size.h);
    layoutWords();
    renderer.render(scene, camera);
  }

  /* Le parole percorrono una SPIRALE, non un cerchio: mentre girano attorno
   * all'asse scendono anche lungo di esso, come farebbe un punto sul filamento.
   * `u` è la quota lungo la discesa (0 in alto, 1 in basso) e l'angolo esce da
   * lei — sono legati, ed è quello che distingue una spirale da un anello.
   *
   * Il centro non è una costante: si ricava proiettando il centro dell'elica con
   * la stessa camera, altrimenti al variare di aspetto e parallasse le parole si
   * scollano dalla cosa attorno a cui dovrebbero girare. */
  var _centre = new THREE.Vector3();
  // Per ricavare l'altezza di scena di una parola dalla sua altezza a schermo.
  var _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _pl = new THREE.Vector3();

  /* I numeri dello sfaldamento, tutti in un posto solo.
   *   peelA/peelB  la finestra, in quote di giro contate dal fronte. Il
   *                passaggio dietro l'elica è a 0.25: la finestra gli sta
   *                attorno, così le prime lettere si staccano poco prima di
   *                arrivarci e le ultime poco dopo.
   *   backA/backB  dove la parola si ricompone, dietro, in ombra.
   *   stag         quanto è sfasata l'ultima lettera rispetto alla prima, in
   *                frazioni della finestra. A 0 partirebbero tutte insieme e
   *                sarebbe di nuovo una parola che se ne va intera; a 1 la
   *                prima avrebbe finito prima che l'ultima cominci, e la
   *                parola si spezzerebbe in due tronconi. 0.62 tiene la coda
   *                agganciata alla testa.
   *   rise         quanto sale una lettera, in frazioni di schermata. È il
   *                termine che fa "quasi verticale": lo spostamento laterale
   *                qui sotto vale un decimo di questo.
   *   swing        l'ampiezza dell'arco all'indietro, in px. Esce e rientra
   *                (campana), come farebbe un punto di un filamento che gira
   *                attorno all'asse per mezzo giro.
   *   sink         quanto rimpicciolisce arrivata in cima: è la profondità,
   *                cioè il "dietro". Insieme alla dissolvenza è quello che
   *                distingue "va dietro" da "esce dallo schermo". */
  var WORD = { peelA: 0.06, peelB: 0.48, backA: 0.58, backB: 0.82,
               stag: 0.62, rise: 0.34, swing: 30, sink: 0.55 };

  /* Una parola, lettera per lettera. `pp` è l'avanzamento della parola (0..1);
   * ogni lettera ne vede una fetta sfasata e la vive tutta da sola. */
  function letters(p, pp, h){
    var n = p.n, span = 1 - WORD.stag, lift = h * WORD.rise;
    for (var c = 0; c < n; c++) {
      // t: 0 la prima lettera, 1 l'ultima. Con una lettera sola non c'è
      // sfasamento da distribuire e t vale 0.
      var t  = n > 1 ? c / (n - 1) : 0;
      var lp = (pp - t * WORD.stag) / span;
      lp = lp < 0 ? 0 : lp > 1 ? 1 : lp;
      var ch, tf, op;
      if (lp === 0) {
        tf = ''; op = '';
      } else {
        // Mezzo giro attorno all'asse: l'arco esce e rientra, la salita no.
        var swing = Math.sin(lp * Math.PI) * WORD.swing;
        var up    = lp * lift;
        var sc    = 1 - lp * WORD.sink;
        tf = 'translate(' + swing.toFixed(1) + 'px,' + (-up).toFixed(1) + 'px)' +
             ' rotate(' + (lp * -18).toFixed(1) + 'deg)' +
             ' scale(' + sc.toFixed(3) + ')';
        op = (1 - lp).toFixed(3);
      }
      ch = p.fc[c]; ch.style.transform = tf; ch.style.opacity = op;
      ch = p.bc[c]; ch.style.transform = tf; ch.style.opacity = op;
    }
  }

  function layoutWords(){
    if (!pairs.length) return;
    _centre.set(group.position.x, 0, 0).project(camera);
    var cx = (_centre.x * 0.5 + 0.5) * size.w;
    var unit = Math.min(size.w, size.h);
    var ring = unit * CONFIG.wordRing;
    var span = size.h * CONFIG.wordSpan;
    var top  = size.h * 0.5 - span * 0.5;

    /* DA PIXEL A SCENA, con due proiezioni invece di sedici unproject.
     * Sul piano dell'asse (z = 0) la prospettiva e' una mappa lineare fra
     * altezza di scena e altezza a schermo: proiettando due punti noti si ha
     * la retta, e da li' si torna indietro per qualsiasi parola.
     * `updateMatrixWorld` serve perche' la matrice del gruppo la aggiorna
     * `render()`, che gira DOPO di noi: senza, si leggerebbe la posizione del
     * fotogramma precedente e il colore resterebbe indietro di uno. */
    group.updateMatrixWorld();
    _p0.set(0, 0, 0).project(camera);
    _p1.set(0, 1, 0).project(camera);
    var sy0 = (-_p0.y * 0.5 + 0.5) * size.h;
    var sy1 = (-_p1.y * 0.5 + 0.5) * size.h;
    var perPx = (sy1 - sy0) ? 1 / (sy1 - sy0) : 0;

    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var u = p.offset + scroll * CONFIG.wordScrollTurns;
      u -= Math.floor(u);                                  // si richiude su sé stessa
      var ang = p.phase + u * CONFIG.wordTurns * Math.PI * 2;
      var x = cx + Math.cos(ang) * ring * p.rx;
      var y = top + u * span;
      var depth = (Math.sin(ang) + 1) / 2;                 // 0 dietro l'elica, 1 davanti
      var scale = 0.72 + depth * 0.42;
      // Dissolvenza ai due capi: la spirale si richiude, e senza questa una
      // parola sparirebbe in basso per ricomparire in alto di scatto.
      var edge = G.smoothstep(0, 0.12, u) * (1 - G.smoothstep(0.88, 1, u));
      var alpha = (0.16 + depth * 0.84) * edge * appear;
      var mixF = depth * depth * (3 - 2 * depth);          // smoothstep sulla silhouette

      /* LA TINTA DELLA PAROLA E' QUELLA DELL'ELICA CHE HA ATTORNO.
       * Si risale l'intera catena invece di indovinarla: altezza a schermo →
       * altezza di scena → coordinate locali del gruppo (che qui dentro tiene
       * salita, rotazione e inclinazione) → la `t` del vertex shader, che nello
       * shader vale `(dnaPos.y + 8) * uScale` una volta portata in scena.
       * Da `t` esce `g`, e da `g` la stessa scala a quattro fermate.
       * Cosi' la parola resta in tinta anche mentre l'elica scorre sotto di lei. */
      _pl.set(0, (y - sy0) * perPx, 0);
      group.worldToLocal(_pl);
      var tShader = _pl.y / CONFIG.scale - 8;
      var col = ink(G.clamp01(G.smoothstep(-20, 12, tShader)));
      if (col !== p.col) {
        p.col = col;
        p.f.style.color = col;
        p.b.style.color = col;
      }

      /* LO SFALDAMENTO — cosa fa una parola quando sta per passare DIETRO.
       *
       * La parola resta orizzontale per tutto il giro. Poi, arrivata al punto
       * in cui l'orbita la porta dietro all'elica, non ci passa dietro intera:
       * si sfalda UNA LETTERA ALLA VOLTA. Ogni lettera fa il movimento dei
       * filamenti — curva all'indietro e sale quasi in verticale, allontanandosi
       * e rimpicciolendo — e chi parte prima è più avanti di chi parte dopo,
       * quindi la parola si apre a ventaglio verso l'alto invece di sparire
       * tutta insieme.
       *
       * `q` è la quota del giro contata DAL FRONTE (0 = davanti, 1 = di nuovo
       * davanti). Il passaggio dietro cade a q = 0.25 (lì sin(ang) = 0, cioè
       * la parola sta attraversando la silhouette dell'elica), e la finestra
       * dello sfaldamento gli sta attorno.
       *
       *   peel  0 → 1 lungo la finestra: è l'avanzamento della PAROLA. Ogni
       *         lettera ne prende una fetta sfasata (vedi `STAG`), quindi la
       *         prima è già in cima quando l'ultima si stacca.
       *   pp    lo stesso, ma azzerato di scatto a fine finestra — a quel punto
       *         tutte le lettere sono a opacità 0, quindi il ritorno a riposo
       *         non si vede. Senza il taglio le lettere RIDISCENDEREBBERO.
       *   vis   la parola si ricompone dietro all'elica, fra 0.58 e 0.82, dove
       *         è poco più di un'ombra: il rimontaggio non si vede mai.
       *
       * Le lettere si riscrivono solo quando `pp` cambia. A regime sono tre o
       * quattro parole per volta dentro la finestra: una quarantina di lettere,
       * non tutte e trecentocinquanta. */
      var q = ((ang - Math.PI / 2) / (Math.PI * 2)) % 1;
      if (q < 0) q += 1;
      var peel = G.smoothstep(WORD.peelA, WORD.peelB, q);
      var pp   = q < WORD.peelB ? peel : 0;
      var vis  = q < WORD.peelB ? 1 : G.smoothstep(WORD.backA, WORD.backB, q);

      var tf = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)' +
               ' translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';
      p.f.style.transform = tf;
      p.b.style.transform = tf;
      p.f.style.opacity = (alpha * mixF * vis).toFixed(3);
      p.b.style.opacity = (alpha * (1 - mixF) * vis).toFixed(3);

      if (pp !== p.pp) {
        p.pp = pp;
        letters(p, pp, size.h);
      }
    }
  }

  function start(){ if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  resize();

  var stPin = null, stLife = null, onScroll = null;

  if (!standalone) {
    /* PIN. Qui prima c'era il contrario, e il commento diceva che bloccare il
     * manifesto a schermo lo avrebbe trasformato in una sosta. Vale se durante la
     * sosta non succede niente: qui in quei 160svh il testo si accende parola per
     * parola, le spire si stringono e sedici parole scendono in spirale. Non è
     * una sosta, è il tempo del capitolo — e senza pin non c'era modo di darglielo,
     * perché il canvas scorreva via insieme alla sezione.
     *
     * `pinSpacing: false` come in tutti gli altri capitoli della pagina: lo spazio
     * di scroll ce l'ha già la sezione (260svh in sections.css), e lasciare che
     * ScrollTrigger ne aggiunga altro darebbe una schermata vuota in fondo. */
    stPin = ScrollTrigger.create({
      trigger: section, start: 'top top', end: 'bottom bottom',
      pin: pin, pinSpacing: false, anticipatePin: 1,
      onUpdate: function(self){ scrollTarget = self.progress; }
    });
    // Il loop vive e muore con la sezione in quadro: il pin misura il progresso,
    // questo accende e spegne. Sono due cose diverse e vogliono due trigger —
    // il pin comincia quando la sezione tocca il bordo alto, ma il canvas si deve
    // vedere già da quando entra dal basso.
    stLife = ScrollTrigger.create({
      trigger: section, start: 'top bottom', end: 'bottom top',
      onToggle: function(self){ self.isActive ? start() : stop(); }
    });
  } else if (reducedStandalone) {
    /* NIENTE MOTO A RIPOSO fuori dal manifesto: la guardia più sopra non
     * spegne l'elica in reduced-motion (è l'asse della pagina), ma qui le
     * toglie il loop che gira da solo — un fotogramma all'avvio, poi uno per
     * ogni scroll, mai un `requestAnimationFrame` continuo. `scroll` salta
     * dritto al target invece di rincorrerlo: senza un rAF continuo lo
     * smorzamento non avrebbe modo di finire di convergere. */
    scrollTarget = scroll = globalScrollProgress();
    renderOnce();
    onScroll = function(){
      scrollTarget = scroll = globalScrollProgress();
      renderOnce();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  } else {
    // L'asse è sempre vivo: non c'è una sezione da aspettare, parte subito.
    start();
  }

  var onResize = function(){ resize(); if (reducedStandalone) renderOnce(); };
  window.addEventListener('resize', onResize);

  cleanups.push(function(){
    stop();
    if (stPin) stPin.kill();
    if (stLife) stLife.kill();
    if (onScroll) window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    geometry.dispose(); material.dispose();
    atmo.dispose(); renderer.dispose();
    if (orbitEl) orbitEl.textContent = '';
  });

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
