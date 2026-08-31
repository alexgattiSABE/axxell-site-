/* CAP 01b — HELION: il volo nello spazio, saldato all'uscita del tunnel.
 *
 * Portato da `helion/src/components/common/scene/three/objects/warp.ts` e
 * `starfield.ts` (starter Textura), riscritto per il nostro impianto vanilla e
 * ritinto sui colori del capitolo che lo precede.
 *
 * ── PERCHÉ ESISTE, E PERCHÉ È ATTACCATO AL TUNNEL ──────────────────────────
 * Il capitolo prima finisce con la camera lanciata dentro il tubo: 34 unità
 * percorse lungo -z, swirl a due volte e mezzo. Qui si riparte da LÌ, non da
 * fermo — `speedFrom` è la velocità d'uscita di quello, ed è il primo valore
 * dello scroll di questo. Se questa sezione aprisse con le strisce ferme si
 * vedrebbe la giuntura: due scene diverse, una dopo l'altra. Aprendo alla
 * velocità con cui l'altra ha chiuso, è un volo solo che continua.
 *
 * ── COME SONO FATTE LE STRISCE ─────────────────────────────────────────────
 * Ogni striscia è un QUAD rivolto alla camera, non un segmento `LINES`. È il
 * punto in cui la versione ingenua sbaglia: un warp punta le sue strisce quasi
 * dritte lungo l'asse di vista, quindi in proiezione quasi tutte diventano
 * lunghe pochi pixel — e una linea `gl.LINES` è larga UN pixel di device
 * sempre, che a quella lunghezza il rasterizzatore risolve in un puntino. Il
 * campo si leggerebbe come pulviscolo invece che come comete.
 * Espandendo ogni striscia in un quad e scostandone i due lati lunghi di mezza
 * larghezza in spazio di clip (`uWidth` / `uRes`), ogni striscia ha un corpo
 * morbido e indipendente dal DPI: testa accesa, coda che sfuma. E resta UNA
 * sola draw call indicizzata.
 *
 * Niente è animato sulla CPU: il ciclo di vita di ogni striscia è un `fract()`
 * nel vertex shader. Con 1400 strisce, animarle in JavaScript vorrebbe dire
 * riscrivere 22.400 float a ogni fotogramma.
 *
 * ── L'ACCELERAZIONE ────────────────────────────────────────────────────────
 * Ogni striscia accelera lungo la propria corsa (`life * life`), non a velocità
 * costante. A velocità costante nel mondo lo scorcio prospettico mangia quasi
 * tutta la sensazione di moto finché la striscia non è addosso, e il campo
 * sembra galleggiare invece che sfrecciare.
 *
 * ── LE STELLE NON SI MUOVONO, ED È IL PUNTO ────────────────────────────────
 * Dietro le strisce c'è un guscio di stelle fisso e una polvere vicina che
 * scorre. Senza un riferimento immobile, il volo si legge come la SCENA che si
 * muove, non come l'osservatore che avanza. Le stelle sono la cosa ferma
 * rispetto a cui si misura tutto il resto — e restano lì anche quando, nei
 * capitoli dopo, questa stessa materia si riordinerà in altre forme.
 *
 * ── DOPPIO USO (Task 7) ─────────────────────────────────────────────────────
 * Stesso schema di `mountSaucer`/`mountOrologio`/`mountVesper`/`mountAltitude`
 * (Task 5–6): il corpo (shader/particelle/frame) è invariato, solo capo
 * (`cfg` al posto degli `id` letti da `document`) e coda (`cfg.external`
 * biforca PRIMA del montaggio legacy) sono nuovi. `rectEl` sostituisce `pin`
 * nella sola `resize()`.
 *
 * ⚠️ NOTA SUL RECORD DEL MAZZO (`js/effetti-deck.js`): la card «Il testo»
 * (id `warp`) porta `modulo:'warp'` e `render:'dom'`, ma QUESTA scena — il
 * volo/DNA/vesper di cap. 02 — è WebGL, non testo DOM: non esiste nel
 * repository nessun modulo di testo DOM chiamato `warp`. Il poster della
 * card (`assets/effetti/warp.webp`, catturato nel Task 3 da questa stessa
 * sezione) lo conferma: è la sfera-costellazione della SCENA qui sotto, non
 * una riga di testo. Il campo `render` non è mai letto dal controller né da
 * `effetti.html` (solo `modulo` conta per il risveglio): risvegliare QUESTA
 * scena sotto quella card riproduce fedelmente ciò che il suo stesso poster
 * mostra già, invece di inventare un settimo effetto DOM di testo mai
 * scritto. Segnalato in dettaglio nel report del Task 7. */
function mountWarp(ctx, cfg){
  var external = !!cfg.external;
  var section = cfg.section || null;   // solo legacy
  var pin     = cfg.pin || null;       // solo legacy (pinning ScrollTrigger)
  var rectEl  = cfg.rectEl;            // pin (legacy) o #stage-live (esterno)
  var canvas  = cfg.canvas;
  var copyA   = cfg.copyA || null;
  var copyB   = cfg.copyB || null;
  var copyC   = cfg.copyC || null;
  if (!canvas || !rectEl || (!external && (!section || !pin))) return null;

  var G = WC.glsl;

  var CONFIG = {
    // Il conteggio lo detta la TERZA forma, non la prima.
    //
    // Con 1400 le prime due fasi stavano benissimo — le strisce sono sparse per
    // natura, e l'elica è una curva: 1400 punti su ~100 unità di filamento fanno
    // 14 punti per unità, densissimi. Ma vesper è fatto di due SUPERFICI, e le
    // stesse 1400 particelle spalmate su una sfera (266 unità²) più un disco
    // (415 unità²) davano circa 2 punti per unità²: non una sfera e una
    // galassia, una polvere sparsa in cui non si leggeva nessuna forma. Da qui
    // il "vesper è sparito" — non mancava, era troppo rado per vedersi.
    //
    // 4200 (con le forme un po' più strette, sotto) portano vesper a ~12 punti
    // per unità². Le altre due fasi ora ne hanno tre volte tanti, e vanno
    // rimagrite di conseguenza: `width` e `dnaDot` qui sotto sono scesi per
    // questo, non per gusto — a parità di spessore il tunnel diventava una
    // lastra di luce e l'elica un tubo pieno.
    streaks: 4200,
    far:  60,          // quanto lontano nasce una striscia, in unità
    near: 1.2,         // e quanto vicino arriva
    radius: 9,         // raggio della parete del tunnel a 1:1, scalato con l'aspect
    width: 1.5,        // corpo della striscia in pixel CSS, costante a ogni DPI
                       // (era 2.2 con 1400 strisce: a 4200 la parete si chiudeva)
    // Velocità: si PARTE dall'uscita del tunnel e si decade. È questo che salda
    // i due capitoli — vedi l'intestazione.
    speedFrom: 2.35,
    speedTo:   0.55,
    lengthFrom: 1.55,  // e le strisce si accorciano mentre si rallenta
    lengthTo:   0.62,
    // ---- seconda forma: l'elica ----
    // Misure in unità di scena. L'elica sta davanti alla camera, non dove
    // nascono le strisce: `dnaZ` è la profondità a cui si compone.
    /* ELICA PIÙ SPESSA E PIÙ TRIDIMENSIONALE.
       Era un reticolo piatto di puntini da 2,4 px su un raggio di 3,4: a
       schermo si leggeva come un disegno, non come un oggetto. Tre modifiche,
       e le prime due sono solo misure:
         dnaR   3.4 → 4.2   l'elica occupa più spazio, i due filamenti si
                            staccano invece di sovrapporsi in proiezione
         dnaDot 2.4 → 3.8   corpo vero ai punti
       La terza è la profondità: vedi `vDnaDepth` nella shader. */
    dnaR: 4.2,          // raggio dei due filamenti
    dnaH: 24,           // altezza totale
    dnaTurns: 4.5,      // giri completi
    dnaZ: -22,
    dnaRungs: 46,       // pioli fra un filamento e l'altro
    dnaRungFrac: 0.42,  // quota di particelle che fa i pioli invece dei filamenti
    dnaDot: 3.8,        // lato del quadratino, in pixel CSS
    // ---- terza forma: vesper ----
    // Sfera + galassia a spirale, i due oggetti della scena originale. Le
    // particelle ne compongono la FORMA, non il materiale: l'orbe era una mesh
    // con uno shader di vetro, e quello un punto non lo può essere. Era il
    // limite dichiarato prima di cominciare.
    // Sfera e disco sono stretti rispetto a prima (4.6 e 11.5): la stessa
    // quantità di particelle su una superficie più piccola è la seconda metà
    // del perché vesper adesso si vede. Il disco resta molto più largo della
    // sfera — è una galassia, deve debordare.
    vesOrbR: 3.4,        // raggio della sfera
    vesOrbFrac: 0.42,    // quota di particelle che la compone
    vesGalR: 8.5,        // raggio del disco
    vesGalArms: 3,
    vesGalTilt: -0.5,    // inclinazione del disco, come nella scena sorgente
    vesZ: -20,
    vesSpinTurns: 0.42,
    // Fasi dello scroll, in fila. Sovrapporle rendeva illeggibile ognuna:
    // rallentare, riordinarsi e ruotare sono tre letture che si annullano se
    // capitano insieme.
    /* ⚠️ SONO FRAZIONI DELLA CORSA, non svh. La sezione e' alta 780svh, cioe'
     * 680svh di corsa tolta la schermata inchiodata, e questi numeri sono
     * TARATI su quella: chi cambia l'altezza in css/sections.css li rifaccia,
     * o ogni fase si allunga in proporzione senza che nessuno lo abbia deciso.
     *
     * La decelerazione iniziale e' scesa da 208 a 90svh: due schermate buone
     * passate a rallentare e basta, prima che succedesse qualunque altra cosa.
     * Le tre fasi successive valgono ancora ESATTAMENTE gli stessi svh di
     * prima (160 / 112 / 192) — si e' tolto tempo morto, non ritmo. */
    phaseMorphIn:  0.132,  //  90svh: esce dal tubo, rallenta
    phaseMorphOut: 0.368,  // 160svh dopo: si riordina nell'elica
    phaseVesIn:    0.532,  // 112svh dopo: l'elica gira
    phaseVesOut:   0.815,  // 192svh dopo: si riordina in vesper
    dnaSpinTurns: 0.55, // giri dell'elica su sé stessa dopo formata
    stars: 900,
    starRadiusMin: 70,
    starRadiusSpan: 160,
    starDepthBias: -40,
    starSize: 1.5,
    starPink: 0.12,    // la minoranza che brucia rosa invece che bianco-blu
    dust: 420,
    dustExtent: [90, 60, 50],
    dustDepthBias: 10,
    camZ: 0
  };

  // Ritinta: i due estremi sono quelli del tunnel che precede (#2bf0ff) e il
  // blu di helion (#3a5cff). In mezzo il ciano pieno del suo accento.
  var C_NEAR = G.hexToVec3('#2BF0FF');
  var C_FAR  = G.hexToVec3('#3A5CFF');
  var C_STAR = G.hexToVec3('#D6E2FF');
  var C_PINK = G.hexToVec3('#FF63C1');
  // Colori dell'elica, presi dal CONFIG della scena sorgente: i due filamenti
  // sui suoi due toni di fiamma, i pioli sull'azzurro d'atmosfera. Stanno nella
  // stessa famiglia ciano del volo, quindi il riordino non cambia anche palette
  // — cambia solo forma, che è il punto.
  var C_STRAND_A = G.hexToVec3('#2BD6FF');
  var C_STRAND_B = G.hexToVec3('#AEF0FF');
  var C_RUNG     = G.hexToVec3('#7FE6FF');
  // Vesper: menta e indaco, i suoi due colori originali — gli stessi che
  // stanno già in js/particles.js. Sono l'unica cosa della scena di partenza
  // che le particelle possono portarsi dietro per intero.
  var C_ORB = G.hexToVec3('#52FFA5');
  var C_GAL = G.hexToVec3('#582EFF');

  var reduced = !ctx.motionOk || typeof THREE === 'undefined';
  if (reduced) { if (section) section.classList.add('-static'); return null; }

  var wide   = window.innerWidth;
  var mobile = wide <= 640;
  var maxDpr = wide > 1024 ? 1.75 : 1.4;
  var nStreak = mobile ? 1600 : CONFIG.streaks;
  var nStar   = mobile ? 420 : CONFIG.stars;
  var nDust   = mobile ? 180 : CONFIG.dust;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true,
                                           powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  camera.position.set(0, 0, CONFIG.camZ);

  var uTime  = { value: 0 };
  var uRes   = { value: new THREE.Vector2(1, 1) };
  var uSpeed = { value: CONFIG.speedFrom };
  var uLen   = { value: CONFIG.lengthFrom };
  var uFade  = { value: 0 };
  var uMorph = { value: 0 };   // 0 = volo, 1 = elica
  var uSpin  = { value: 0 };   // rotazione dell'elica attorno al proprio asse
  var uMorph2 = { value: 0 };  // 0 = elica, 1 = vesper
  var uSpin2  = { value: 0 };

  // ------------------------------------------------------------- strisce
  // Quattro vertici e due triangoli per striscia, in un buffer solo. `aSide`
  // dice a ogni vertice quale angolo del quad è: -1/+1 in larghezza, 0/1 lungo
  // la corsa. Da lì il vertex shader ricostruisce il quad in spazio di clip.
  var sGeo = new THREE.BufferGeometry();
  (function(){
    var pos  = new Float32Array(nStreak * 4 * 3);   // riempito dallo shader
    var side = new Float32Array(nStreak * 4 * 2);
    var seed = new Float32Array(nStreak * 4 * 3);   // angolo, raggio, fase
    var dna  = new Float32Array(nStreak * 4 * 3);   // dove va a finire, nell'elica
    var role = new Float32Array(nStreak * 4);       // 0/1 filamento, 2 piolo
    var ves  = new Float32Array(nStreak * 4 * 3);   // e dove va a finire dopo
    var rol2 = new Float32Array(nStreak * 4);       // 0 sfera, 1 galassia
    var idx  = new Uint32Array(nStreak * 6);
    var TAU  = Math.PI * 2;
    for (var i = 0; i < nStreak; i++) {
      var a = Math.random() * Math.PI * 2;
      // sqrt: senza, le strisce si ammassano al centro. La densità uniforme su
      // un disco vuole il raggio distribuito come radice, non lineare.
      var r = Math.sqrt(Math.random()) * CONFIG.radius;
      var ph = Math.random();

      /* La destinazione di questa particella sull'elica.
       *
       * L'assegnazione è FISSA e decisa qui una volta sola: ogni striscia sa
       * già dove andrà a finire prima ancora di partire. È questo che rende il
       * passaggio un riordino invece che una dissolvenza — la particella che
       * era una cometa in fondo a destra diventa QUELLA precisa base azotata,
       * e ci va per la via più breve.
       *
       * Due ruoli: la maggior parte compone i due filamenti che si avvolgono,
       * il resto fa i pioli che li legano. Senza i pioli si vedono due molle
       * separate, non una doppia elica: sono loro a dire che le due spirali
       * appartengono alla stessa molecola.
       */
      var u = i / nStreak, dx, dy, dz;
      var yy = (u - 0.5) * CONFIG.dnaH;
      if (Math.random() < CONFIG.dnaRungFrac) {
        // Piolo: si aggancia a un gradino discreto e sta fra i due filamenti.
        var rung = Math.floor(u * CONFIG.dnaRungs) / CONFIG.dnaRungs;
        var ang  = rung * CONFIG.dnaTurns * TAU;
        var k    = Math.random();                    // quanto è vicino a un filamento
        yy = (rung - 0.5) * CONFIG.dnaH;
        dx = Math.cos(ang) * CONFIG.dnaR * (1 - 2 * k);
        dz = Math.sin(ang) * CONFIG.dnaR * (1 - 2 * k);
        role[i*4] = 2;
      } else {
        var strand = i % 2;                          // uno dei due filamenti
        var ang2 = u * CONFIG.dnaTurns * TAU + strand * Math.PI;
        dx = Math.cos(ang2) * CONFIG.dnaR;
        dz = Math.sin(ang2) * CONFIG.dnaR;
        role[i*4] = strand;
      }
      dy = yy;

      /* E la destinazione DOPO, in vesper: sfera o galassia.
       *
       * La scelta è indipendente da quella dell'elica, di proposito. Legandole
       * — i filamenti alla sfera, i pioli al disco — i due riordini si
       * assomigliavano troppo: la seconda trasformazione sembrava la prima
       * rifatta al contrario. Slegate, ogni particella fa un percorso suo e il
       * secondo passaggio ha una sua fisionomia.
       */
      var vx, vy, vz;
      if (Math.random() < CONFIG.vesOrbFrac) {
        // Sfera. L'angolo polare va preso dall'arcocoseno di una uniforme, se
        // no i punti si addensano ai due poli invece di coprire la superficie.
        var th = Math.random() * TAU, phi = Math.acos(2 * Math.random() - 1);
        vx = CONFIG.vesOrbR * Math.sin(phi) * Math.cos(th);
        vy = CONFIG.vesOrbR * Math.cos(phi);
        vz = CONFIG.vesOrbR * Math.sin(phi) * Math.sin(th);
        rol2[i*4] = 0;
      } else {
        // Galassia: bracci a spirale logaritmica su un disco inclinato. Il
        // raggio va come una potenza, se no il disco esce uniforme e piatto
        // invece di avere il nucleo denso.
        var arm = Math.floor(Math.random() * CONFIG.vesGalArms);
        var rr  = Math.pow(Math.random(), 0.65) * CONFIG.vesGalR;
        var aa  = (arm / CONFIG.vesGalArms) * TAU + rr * 0.42
                  + (Math.random() - 0.5) * 0.55;
        var yj  = (Math.random() - 0.5) * 0.9 * (1 - rr / CONFIG.vesGalR);
        var gx = Math.cos(aa) * rr, gz = Math.sin(aa) * rr;
        var ct = Math.cos(CONFIG.vesGalTilt), st = Math.sin(CONFIG.vesGalTilt);
        vx = gx;
        vy = yj * ct - gz * st;
        vz = yj * st + gz * ct;
        rol2[i*4] = 1;
      }

      for (var v = 0; v < 4; v++) {
        var o = (i * 4 + v);
        side[o*2]   = (v === 0 || v === 3) ? -1 : 1;   // larghezza
        side[o*2+1] = (v < 2) ? 0 : 1;                 // testa o coda
        seed[o*3] = a; seed[o*3+1] = r; seed[o*3+2] = ph;
        dna[o*3] = dx; dna[o*3+1] = dy; dna[o*3+2] = dz;
        ves[o*3] = vx; ves[o*3+1] = vy; ves[o*3+2] = vz;
        role[o] = role[i*4];
        rol2[o] = rol2[i*4];
        pos[o*3] = 0; pos[o*3+1] = 0; pos[o*3+2] = 0;
      }
      var b = i * 4;
      idx[i*6]   = b;   idx[i*6+1] = b+1; idx[i*6+2] = b+2;
      idx[i*6+3] = b;   idx[i*6+4] = b+2; idx[i*6+5] = b+3;
    }
    sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sGeo.setAttribute('aSide',    new THREE.BufferAttribute(side, 2));
    sGeo.setAttribute('aSeed',    new THREE.BufferAttribute(seed, 3));
    sGeo.setAttribute('aDna',     new THREE.BufferAttribute(dna, 3));
    sGeo.setAttribute('aRole',    new THREE.BufferAttribute(role, 1));
    sGeo.setAttribute('aVes',     new THREE.BufferAttribute(ves, 3));
    sGeo.setAttribute('aRole2',   new THREE.BufferAttribute(rol2, 1));
    sGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
  })();

  var sMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uTime, uRes: uRes, uSpeed: uSpeed, uLen: uLen, uFade: uFade,
      uFar: { value: CONFIG.far }, uNear: { value: CONFIG.near },
      uWidth: { value: CONFIG.width },
      uNearCol: { value: C_NEAR }, uFarCol: { value: C_FAR },
      uMorph: uMorph, uSpin: uSpin,
      uMorph2: uMorph2, uSpin2: uSpin2,
      uDnaZ: { value: CONFIG.dnaZ }, uVesZ: { value: CONFIG.vesZ },
      uDot: { value: CONFIG.dnaDot },
      uDnaR: { value: CONFIG.dnaR },
      uStrandA: { value: C_STRAND_A }, uStrandB: { value: C_STRAND_B },
      uRung:    { value: C_RUNG },
      uOrb:     { value: C_ORB }, uGal: { value: C_GAL }
    },
    vertexShader: [
      'attribute vec2 aSide; attribute vec3 aSeed; attribute vec3 aDna; attribute float aRole;',
      'attribute vec3 aVes; attribute float aRole2;',
      'uniform float uTime; uniform vec2 uRes; uniform float uSpeed; uniform float uLen;',
      'uniform float uFar; uniform float uNear; uniform float uWidth;',
      'uniform float uMorph; uniform float uSpin; uniform float uDnaZ; uniform float uDot;',
      'uniform float uDnaR;',
      'uniform float uMorph2; uniform float uSpin2; uniform float uVesZ;',
      'varying float vLife; varying float vTail; varying float vRole; varying vec2 vQuad;',
      'varying float vDnaDepth;',
      'varying float vMorph; varying float vMorph2; varying float vRole2;',
      '',
      'vec4 project(vec3 p){ return projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      '',
      'void main(){',
      '  float ang = aSeed.x, rad = aSeed.y, phase = aSeed.z;',
      // ---- FORMA 1: il volo. Il ciclo di vita è una frazione che gira, e non
      // costa niente alla CPU.
      '  float life = fract(phase + uTime * uSpeed * (0.6 + phase * 0.8));',
      // Accelerazione lungo la corsa: life al quadrato. Lineare si leggerebbe
      // come deriva, non come velocità — è lo scorcio a mangiarla.
      '  float t = life * life;',
      '  float zHead = mix(-uFar, -uNear, t);',
      // La coda sta INDIETRO della testa, cioè più lontano: la striscia è il
      // pezzo di spazio che la testa ha appena attraversato.
      '  float tTail = max(0.0, t - uLen * 0.06);',
      '  float zTail = mix(-uFar, -uNear, tTail);',
      '  vec3 wHead = vec3(cos(ang) * rad, sin(ang) * rad, zHead);',
      '  vec3 wTail = vec3(cos(ang) * rad, sin(ang) * rad, zTail);',
      '',
      // ---- FORMA 2: l'elica. La destinazione è fissa e decisa a monte; qui si
      // fa solo ruotare attorno al proprio asse.
      '  float cs = cos(uSpin), sn = sin(uSpin);',
      '  vec3 d = vec3(aDna.x * cs - aDna.z * sn, aDna.y, aDna.x * sn + aDna.z * cs);',
      '  vec3 wDna = vec3(d.x, d.y, d.z + uDnaZ);',
      // Da che lato dell'asse sta questo punto: +1 il filamento che ti viene
      // incontro, -1 quello che gira dietro. È il numero che dà la profondità
      // all'elica — senza, i due filamenti hanno la stessa luce e lo stesso
      // corpo, e una doppia elica vista di fronte diventa un reticolo piatto.
      '  vDnaDepth = clamp(d.z / max(0.001, uDnaR), -1.0, 1.0);',
      '',
      // ---- FORMA 3: vesper. Sfera e galassia, anche loro con la propria
      // rotazione attorno all'asse verticale.
      '  float c2 = cos(uSpin2), s2 = sin(uSpin2);',
      '  vec3 e = vec3(aVes.x * c2 - aVes.z * s2, aVes.y, aVes.x * s2 + aVes.z * c2);',
      '  vec3 wVes = vec3(e.x, e.y, e.z + uVesZ);',
      '',
      // ---- LA MESCOLA, in spazio di MONDO e non di schermo.
      // Interpolare le posizioni già proiettate sarebbe più comodo ma sbagliato:
      // la divisione prospettica non è lineare, e le particelle prenderebbero
      // traiettorie curve e incoerenti fra loro. In spazio di mondo ognuna va
      // dritta dal punto in cui era al punto in cui deve stare.
      // `smoothstep` invece di una rampa lineare: partono e arrivano piano, e
      // il riordino si legge come una cosa che si compone invece di uno scatto.
      '  float m = smoothstep(0.0, 1.0, uMorph);',
      // Le particelle non partono tutte insieme: il ritardo è dato dalla loro
      // fase, che è già casuale. Senza sfasatura l'elica si forma di colpo,
      // tutta uguale, e sembra un fotogramma che cambia invece che materia che
      // si sposta.
      '  float mi = clamp((m - phase * 0.28) / 0.72, 0.0, 1.0);',
      '  mi = smoothstep(0.0, 1.0, mi);',
      // Il secondo riordino ha la sua sfasatura, e presa dall'altro capo della
      // fase: chi era partito per primo verso l'elica parte per ultimo verso
      // vesper. Con lo stesso ordine le due trasformazioni si somigliavano —
      // la seconda sembrava la prima rifatta.
      '  float m2 = smoothstep(0.0, 1.0, uMorph2);',
      '  float mi2 = clamp((m2 - (1.0 - phase) * 0.28) / 0.72, 0.0, 1.0);',
      '  mi2 = smoothstep(0.0, 1.0, mi2);',
      '  vec3 pHead = mix(mix(wHead, wDna, mi), wVes, mi2);',
      '  vec3 pTail = mix(mix(wTail, wDna, mi), wVes, mi2);',
      '  vec3 p = mix(pHead, pTail, aSide.y);',
      '  vec4 clip = project(p);',
      '',
      // ---- IL CORPO DEL QUAD.
      // Da cometa: si scosta di mezza larghezza in pixel PERPENDICOLARMENTE
      // alla corsa, in spazio di clip, così ha lo stesso spessore a qualunque
      // profondità e DPI.
      '  vec4 cH = project(pHead); vec4 cT = project(pTail);',
      '  vec2 sH = cH.xy / max(1e-4, cH.w);',
      '  vec2 sT = cT.xy / max(1e-4, cT.w);',
      '  vec2 dir = sH - sT;',
      // Se testa e coda cadono sullo stesso pixel — e a morph completo cadono
      // sempre — la direzione è indefinita: si ripiega su un asse fisso invece
      // di produrre un NaN, che farebbe sparire il triangolo.
      '  float asp = uRes.x / uRes.y;',
      '  dir = (length(dir) < 1e-6) ? vec2(0.0, 1.0) : normalize(dir * vec2(asp, 1.0));',
      '  vec2 nrm = vec2(-dir.y, dir.x) / vec2(asp, 1.0);',
      '  clip.xy += nrm * aSide.x * (uWidth / uRes.y) * clip.w * (1.0 - mi);',
      // Da particella: un quadratino rivolto alla camera. Le due costruzioni
      // sono pesate dallo stesso `mi`, quindi la cometa si accorcia mentre il
      // quadratino cresce e non c'è un istante in cui è nessuna delle due.
      // Il corpo del quadratino segue la profondità: più grosso davanti, più
      // minuto dietro. È scorcio, non decorazione — è il motivo per cui i due
      // filamenti si distinguono anche quando si incrociano.
      '  float dnaScale = mix(1.0, 0.72 + 0.52 * (vDnaDepth * 0.5 + 0.5), mi);',
      '  clip.xy += vec2(aSide.x, aSide.y * 2.0 - 1.0) / vec2(asp, 1.0)',
      '           * (uDot / uRes.y) * clip.w * mi * dnaScale;',
      '  vLife = t;',
      '  vTail = aSide.y;',
      '  vRole = aRole;',
      '  vQuad = vec2(aSide.x, aSide.y * 2.0 - 1.0);',
      '  vMorph = mi;',
      '  vMorph2 = mi2;',
      '  vRole2 = aRole2;',
      '  gl_Position = clip;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uNearCol; uniform vec3 uFarCol; uniform float uFade;',
      'uniform vec3 uStrandA; uniform vec3 uStrandB; uniform vec3 uRung;',
      'uniform vec3 uOrb; uniform vec3 uGal;',
      'varying float vLife; varying float vTail; varying float vRole; varying vec2 vQuad;',
      'varying float vDnaDepth;',
      'varying float vMorph; varying float vMorph2; varying float vRole2;',
      'void main(){',
      // Da COMETA: la coda sfuma, la testa no — è quella differenza a farle
      // leggere come comete invece che come bastoncini. E tutta la striscia si
      // accende avvicinandosi e si spegne sul filo della lente, se no si
      // vedrebbe sparire un rettangolo.
      '  float aC = (1.0 - vTail) * (1.0 - vTail);',
      '  aC *= smoothstep(0.0, 0.16, vLife) * smoothstep(1.0, 0.86, vLife);',
      // Da PARTICELLA: un disco sfumato ricavato dal quad. Il bagliore si
      // disegna qui invece di caricare una sprite — è un cerchio morbido, e
      // costa meno di un accesso a texture per pixel.
      '  float aD = smoothstep(1.0, 0.0, length(vQuad));',
      '  aD *= aD;',
      '  float a = mix(aC, aD, vMorph);',
      // Il colore segue lo stesso passaggio: dai toni del volo a quelli
      // dell'elica, e dentro l'elica cambia col ruolo — i due filamenti hanno
      // due tinte diverse, i pioli una terza. Senza quella distinzione la
      // doppia elica si legge come un tubo di puntini.
      // Luminosità alzata su tutta la sezione (era 0.55 + 1.35): il capitolo
      // gira senza bloom — three r128 core non porta EffectComposer — e i
      // valori venivano da una scena che ce l'aveva.
      '  vec3 flight = mix(uFarCol, uNearCol, vLife) * (0.78 + vLife * 1.65);',
      '  vec3 helix  = vRole < 0.5 ? uStrandA : (vRole < 1.5 ? uStrandB : uRung);',
      '  helix *= (vRole > 1.5) ? 1.05 : 1.75;',   // i pioli stanno indietro
      // E la luce segue il lato: il filamento che viene avanti è quasi doppio
      // di quello che gira dietro. Insieme al corpo del punto (`dnaScale` nel
      // vertex) è tutto ciò che serve perché l'elica si legga come un volume.
      '  helix *= 0.62 + 0.78 * (vDnaDepth * 0.5 + 0.5);',
      // Vesper: la sfera in menta, la galassia in indaco. Il nucleo del disco
      // schiarisce verso la menta, se no la spirale è una macchia viola uniforme
      // e non si legge che ha un centro.
      '  vec3 vesper = vRole2 < 0.5 ? uOrb * 1.25 : mix(uGal * 1.6, uOrb, 0.18);',
      '  vec3 col = mix(mix(flight, helix, vMorph), vesper, vMorph2);',
      '  gl_FragColor = vec4(col, a * uFade);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending
  });
  var streaks = new THREE.Mesh(sGeo, sMat);
  streaks.frustumCulled = false;
  scene.add(streaks);

  // -------------------------------------------------------------- stelle
  // Non si muovono, ed è il loro mestiere: senza un riferimento fermo il volo
  // sembrerebbe la scena che scorre, non l'osservatore che avanza.
  function makePoints(n, fill, size, bright){
    var g = new THREE.BufferGeometry();
    var p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
    for (var i = 0; i < n; i++) fill(i, p, c, s);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aCol',     new THREE.BufferAttribute(c, 3));
    g.setAttribute('aSize',    new THREE.BufferAttribute(s, 1));
    var m = new THREE.ShaderMaterial({
      uniforms: { uRes: uRes, uFade: uFade, uSize: { value: size }, uBright: { value: bright } },
      vertexShader: [
        'attribute vec3 aCol; attribute float aSize;',
        'uniform float uSize; varying vec3 vCol;',
        'void main(){',
        '  vCol = aCol;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = uSize * aSize * (60.0 / max(1.0, -mv.z));',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uFade; uniform float uBright; varying vec3 vCol;',
        'void main(){',
        // Il bagliore si disegna nel frammento invece che con una texture: una
        // sprite per 900 stelle sarebbe una texture da caricare e un fetch in
        // più per pixel, per un cerchio sfumato che costa due istruzioni.
        '  float d = length(gl_PointCoord - 0.5) * 2.0;',
        '  float a = smoothstep(1.0, 0.0, d); a *= a;',
        '  gl_FragColor = vec4(vCol * uBright, a * uFade);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts: pts, geo: g, mat: m };
  }

  var stars = makePoints(nStar, function(i, p, c, s){
    // Guscio lontano, oltre qualunque punto la camera raggiunga.
    var r = CONFIG.starRadiusMin + Math.random() * CONFIG.starRadiusSpan;
    var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    p[i*3]   = r * Math.sin(ph) * Math.cos(th);
    p[i*3+1] = r * Math.sin(ph) * Math.sin(th);
    p[i*3+2] = r * Math.cos(ph) + CONFIG.starDepthBias;
    var col = Math.random() < CONFIG.starPink ? C_PINK : C_STAR;
    c[i*3] = col.x; c[i*3+1] = col.y; c[i*3+2] = col.z;
    s[i] = 0.6 + Math.random() * 0.9;
  }, CONFIG.starSize, 1.7);

  var dust = makePoints(nDust, function(i, p, c, s){
    // Polvere vicina: è lei a dare la parallasse, perché scorre in fretta.
    p[i*3]   = (Math.random() - 0.5) * CONFIG.dustExtent[0];
    p[i*3+1] = (Math.random() - 0.5) * CONFIG.dustExtent[1];
    p[i*3+2] = (Math.random() - 0.5) * CONFIG.dustExtent[2] + CONFIG.dustDepthBias;
    c[i*3] = C_NEAR.x; c[i*3+1] = C_NEAR.y; c[i*3+2] = C_NEAR.z;
    s[i] = 0.35 + Math.random() * 0.5;
  }, 1.1, 0.9);

  // --------------------------------------------------------------- stato
  var scrollTarget = 0, scroll = 0, fade = 0;
  var rect = { w: 1, h: 1 }, dpr = 1;
  var running = false, raf = 0, last = performance.now();
  var mx = 0, my = 0, tmx = 0, tmy = 0;

  function resize(){
    var r = rectEl.getBoundingClientRect();
    rect.w = Math.max(1, r.width); rect.h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(rect.w, rect.h, false);
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();
    uRes.value.set(rect.w * dpr, rect.h * dpr);
    // La parete si allarga sui viewport larghi, se no gli angoli restano vuoti.
    sMat.uniforms.uWidth.value = CONFIG.width * (rect.w > 1400 ? 1.15 : 1);
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;

    scroll += (scrollTarget - scroll) * G.damp(0.12, dt);
    fade   = Math.min(1, fade + dt / 0.9);
    uTime.value = now / 1000;
    uFade.value = fade;

    /* Le tre fasi dello scroll, in fila e non sovrapposte.
     *
     *   0 → 0.42   si esce dal tubo e si RALLENTA. La saldatura sta qui: si
     *              apre alla velocità con cui il capitolo prima ha chiuso.
     *   0.42 → 0.74  la stessa materia si RIORDINA nell'elica.
     *   0.74 → 1     l'elica GIRA su sé stessa.
     *
     * Sovrapporle era la prima versione e non funzionava: riordinarsi mentre si
     * sfreccia ancora dà solo confusione, perché le due letture — velocità e
     * forma — si annullano a vicenda.
     */
    var decel = G.clamp01(scroll / CONFIG.phaseMorphIn);
    uSpeed.value = CONFIG.speedFrom + (CONFIG.speedTo - CONFIG.speedFrom) * decel;
    uLen.value   = CONFIG.lengthFrom + (CONFIG.lengthTo - CONFIG.lengthFrom) * decel;

    uMorph.value = G.clamp01((scroll - CONFIG.phaseMorphIn) /
                             (CONFIG.phaseMorphOut - CONFIG.phaseMorphIn));
    uMorph2.value = G.clamp01((scroll - CONFIG.phaseVesIn) /
                              (CONFIG.phaseVesOut - CONFIG.phaseVesIn));
    // La rotazione comincia già durante il riordino, piano: una forma che si
    // compone perfettamente immobile e poi parte di scatto sembra un video che
    // riprende, non un oggetto.
    uSpin.value = (uMorph.value * 0.35 + G.clamp01((scroll - CONFIG.phaseMorphOut) /
                   (CONFIG.phaseVesIn - CONFIG.phaseMorphOut)))
                  * Math.PI * 2 * CONFIG.dnaSpinTurns;
    uSpin2.value = (uMorph2.value * 0.35 + G.clamp01((scroll - CONFIG.phaseVesOut) /
                    (1 - CONFIG.phaseVesOut)))
                   * Math.PI * 2 * CONFIG.vesSpinTurns;

    // Le due didascalie si scambiano sullo stesso valore che guida il riordino,
    // sfalsate: la prima esce prima che la seconda entri, se no per un tratto
    // si leggono sovrapposte.
    if (copyA) copyA.style.opacity = String(1 - G.clamp01(uMorph.value / 0.45));
    if (copyB) copyB.style.opacity = String(G.clamp01((uMorph.value - 0.55) / 0.45)
                                          * (1 - G.clamp01(uMorph2.value / 0.45)));
    if (copyC) copyC.style.opacity = String(G.clamp01((uMorph2.value - 0.55) / 0.45));

    // Parallasse del mouse, smorzata. Muove la camera di pochissimo: serve a
    // dare volume alle stelle, non a far girare la scena.
    mx += (tmx - mx) * G.damp(0.08, dt);
    my += (tmy - my) * G.damp(0.08, dt);
    camera.position.set(mx * 1.6, my * 1.1, CONFIG.camZ);
    camera.lookAt(0, 0, -30);

    renderer.render(scene, camera);
  }

  function start(){ if (running || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  var onMove = function(e){
    tmx = (e.clientX / window.innerWidth  - 0.5) * 2;
    tmy = -(e.clientY / window.innerHeight - 0.5) * 2;
  };

  // La distruzione delle risorse WebGL è identica per i due montaggi (schema
  // di js/saucer.js, Task 5 §disposeAll): un solo posto, la chiamano entrambi
  // i tear-down.
  function disposeAll(){
    sGeo.dispose(); sMat.dispose();
    stars.geo.dispose(); stars.mat.dispose();
    dust.geo.dispose(); dust.mat.dispose();
    renderer.dispose();
  }

  resize();

  /* ── MONTAGGIO ESTERNO (effetti.html) ─────────────────────────────────────
   * Nessuna sezione, nessuno ScrollTrigger da leggere: qui il progresso lo fa
   * un tween GSAP proprio, stesso schema di `mountOrologio` (Task 6) — un
   * oggetto di appoggio (`driver`) invece dello `state.t` dell'orologio,
   * perché qui il progresso alimenta `scrollTarget`, non una scena a stati.
   * Il tween resta creato ma in pausa finché il controller non chiama
   * `start()`, e VIVE fra un fuoco e l'altro: `stop()` lo mette in pausa (non
   * lo distrugge), quindi il volo riprende da dove si era fermato invece di
   * ripartire dal tubo ogni volta. `repeat:-1` senza `yoyo`: al giro il
   * progresso torna di scatto a 0 (stesso compromesso, non ritarato con cura
   * estetica, del tween di `orologio` — vedi il concern gemello nel report
   * del Task 6). */
  if (external){
    var driver = { v: 0 };
    var extTl = gsap.timeline({ repeat: -1, paused: true });
    extTl.to(driver, {
      v: 1, duration: 26, ease: 'none',
      onUpdate: function(){ scrollTarget = driver.v; }
    }, 0);
    var onResizeE = function(){ resize(); };
    var onVisE = function(){ if (document.hidden) stop(); else if (wantRun) start(); };
    var wantRun = false;
    window.addEventListener('resize', onResizeE);
    document.addEventListener('visibilitychange', onVisE);
    if (ctx.desktop) window.addEventListener('pointermove', onMove, { passive: true });
    return {
      start: function(){ wantRun = true; resize(); extTl.play(); start(); },
      stop:  function(){ wantRun = false; extTl.pause(); stop(); },
      resize: resize,
      dispose: function(){
        stop();
        extTl.pause(); extTl.kill();
        window.removeEventListener('resize', onResizeE);
        document.removeEventListener('visibilitychange', onVisE);
        window.removeEventListener('pointermove', onMove);
        disposeAll();
      }
    };
  }

  /* ── MONTAGGIO LEGACY (capitoli.html) — invariato ─────────────────────────*/
  section.classList.add('-live');

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
    disposeAll();
    section.classList.remove('-live');
  };
}

/* ── I DUE PADRONI ───────────────────────────────────────────────────────────
 * Legacy: si registra come sempre; se la sezione non c'è (effetti.html) l'init
 * è un no-op innocuo. Esterno: un handle recuperabile che monta il volo su una
 * tela creata dentro il `container` che gli passa il controller (vedi la nota
 * sul record del mazzo, in testa al file). */
WC.register('warp', function(ctx){
  var section = document.getElementById('capWarp');
  var pin     = document.getElementById('wcWarpPin');
  var canvas  = document.getElementById('wcWarpCanvas');
  var copyA   = document.getElementById('wcWarpCopyA');
  var copyB   = document.getElementById('wcWarpCopyB');
  var copyC   = document.getElementById('wcWarpCopyC');
  if (!section || !pin || !canvas) return;
  return mountWarp(ctx, { section: section, pin: pin, rectEl: pin, canvas: canvas,
                           copyA: copyA, copyB: copyB, copyC: copyC, external: false });
});

WC.effects = WC.effects || {};
/* Vedi la nota gemella in js/saucer.js (Task 6, §4): `container.appendChild(host)`
 * a OGNI `start()`, anche quando `inst` esiste già, sposta l'host in coda ai
 * figli di `#stage-live` — l'ultimo effetto risvegliato dipinge sempre sopra i
 * fermi-immagine congelati degli altri. */
WC.effects.warp = (function(){
  var inst = null, host = null;
  return {
    start: function(container){
      if (inst){ container.appendChild(host); inst.start(); return; }
      host = document.createElement('canvas');
      host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      container.appendChild(host);
      var ctx = { motionOk: WC.motionOk, desktop: WC.desktop };
      inst = mountWarp(ctx, { section: null, pin: null, canvas: host,
                               rectEl: container, external: true });
      if (!inst){ if (host && host.parentNode) host.parentNode.removeChild(host); host = null; return; }
      inst.start();
    },
    stop:   function(){ if (inst) inst.stop(); },
    resize: function(){ if (inst) inst.resize(); }
  };
})();
