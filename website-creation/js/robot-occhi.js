/* CAP 05 — gli OCCHI a LED del visore, disegnati da noi.
 *
 * Prima gli occhi erano un video (assets/robot-spline/eyes.mp4, 512×288, un
 * giro di 6,3 s sempre uguale). Nike: «facciamogli fare delle espressioni con
 * gli occhi, ad es l'occhiolino oppure quando li chiude e li riapre cambiano
 * forma». Un video non può cambiare idea, quindi gli occhi adesso si disegnano
 * su una <canvas> della STESSA misura e con lo STESSO orientamento del
 * fotogramma del video, e la canvas entra nello shader del visore al posto del
 * video (setOcchi in robot-spline-materials.js). Lo shader non cambia: legge
 * una texture 512×288 come prima, con gli stessi 16 prelievi per pixel.
 *
 * A RIPOSO devono essere identici al video. Tutti i numeri di CONFIG sotto
 * «misure del video» sono MISURATI sul poster (eyes-poster.png, lo stesso
 * fotogramma 0 del video) e sui 380 fotogrammi estratti con ffmpeg: griglia,
 * profilo dei puntini, alone, forma e posizione degli occhi, tempi e ampiezze
 * di battito e sguardo. La tela a riposo scarta dal poster di 0,67/255 in
 * media per pixel, 0,27 dopo una sfocatura di 2 px (la scala a cui il visore
 * la mostra davvero): meno di quanto il poster scarti dal video decodificato
 * (0,37).
 *
 * Come si disegna (e perché così — su telefono il robot andava a scatti):
 *  - DUE strati si preparano UNA volta sola: il `fondo` (nero + tutti i
 *    puntini spenti) e gli `accesi` (nero + tutti i puntini accesi al
 *    massimo), calcolati pixel per pixel col profilo misurato.
 *  - A ogni disegno si copia il fondo, poi per ogni puntino acceso si copia
 *    il SUO quadratino dagli `accesi` in modalità additiva ('lighter'), con
 *    globalAlpha = quanto è acceso. Copie a coordinate intere: nessun
 *    ricampionamento, il puntino resta quello misurato al sottopixel.
 *  - Quali puntini, e quanto: una funzione di forma per occhio (distanza con
 *    segno, come un SDF: superellisse, cerchio, «^», triangolo, rettangolo)
 *    valutata SOLO sui puntini dentro il riquadro degli occhi, più l'alone
 *    (bloom) che ogni puntino acceso sparge sui vicini, come nel video.
 *  - Si ridisegna e si carica sulla GPU (texture.needsUpdate) SOLO quando
 *    l'immagine cambia davvero: occhi fermi = zero lavoro e zero upload.
 *    Con la testa aperta gli occhi sono spenti dallo shader (uEyes) e qui non
 *    si fa niente; lo stesso fuori schermo (setPlaying di robot.js).
 */
window.WC = window.WC || {};
WC.robotOcchi = (function () {
  'use strict';

  var CONFIG = {
    // --- MISURE DEL VIDEO (non si toccano: sono il «come prima») ----------
    // Tela: la misura del fotogramma di eyes.mp4. Lo shader la mappa sul
    // visore con uVideoMat/uVideoSize, che restano quelle del video.
    tela: { w: 512, h: 288 },
    // Griglia esagonale dei LED, in «indici di pixel» (il centro del pixel i
    // sta in i, come l'ha misurata numpy; sulla canvas è i + 0,5). 16 righe:
    // le pari hanno 27 puntini, le dispari 28 e partono mezzo passo più a
    // sinistra. Ogni puntino ha una «mezza colonna» c (0..54) e sta in
    // x = x0 + c·mezzoPasso, y = y0 + k·passoRiga, con k + c dispari.
    // Scarto del fit sui 440 centri: 0,037 px in x, 0,017 px in y. Passo
    // 16,322 px, righe a 14,152 px: rapporto √3/2, esagoni regolari.
    griglia: { x0: 32.4986, mezzoPasso: 8.16097, y0: 32.4086, passoRiga: 14.15247, righe: 16, mezzeColonne: 55 },
    puntino: {
      // Puntino ACCESO: pieno fino a rPieno, zero da rZero, rampa lineare in
      // mezzo (il bordo nel video è morbido: compressione + sfocatura).
      rPieno: 3.174, rZero: 4.564,
      // Quanto un puntino a cavallo del bordo alimenta l'alone dei vicini:
      // la quota di un disco di QUESTO raggio che sta dentro la forma. È più
      // largo del puntino vero (5,9 contro 4,6): misurato, anche i puntini
      // appena fuori dal bordo regalano un filo di luce ai vicini.
      rAlone: 5.906,
      // Puntino SPENTO: profilo radiale misurato sui puntini lontani dagli
      // occhi, a passi di 0,25 px (valore a r = (i + 0,5)/4). Non è un disco
      // piatto: ha un centro un po' più chiaro (23/255) che scende a 0 a 4,6 px.
      fondo: [23.0, 22.65, 22.1, 20.76, 19.79, 18.68, 17.81, 17.18, 16.52, 15.91,
              15.38, 14.51, 12.86, 11.1, 8.55, 4.92, 2.14, 0.61, 0.03, 0]
    },
    luce: {
      // Quanto si somma (su 255, sopra il fondo) alla parte di un puntino che
      // sta DENTRO la forma. Sommata all'alone dei vicini accesi supera 255:
      // il centro satura, bianco pieno come nel video.
      accesi: 186.9,
      // Quanto ogni puntino acceso regala ai vicini: primo anello (6 vicini
      // a 16,3 px), secondo (a 28,3 px), terzo (a 32,6 px). È l'alone grigio
      // attorno agli occhi del video: misurato, è una gaussiana (σ 14,6 px)
      // di QUANTI puntini accesi ci sono vicino, non della distanza dal bordo
      // — per questo la riga dell'occhio chiuso ha un alone più tenue
      // dell'occhio aperto, come nel video.
      alone: [18.4, 5.3, 2.84]
    },
    // Gli occhi a riposo, sinistro e destro della TELA (= dello schermo).
    // Non sono ellissi: sono superellissi |x/a|^n + |y/b|^n = 1 con n 2,363,
    // un filo più «squadrate». Con n = 2 il fit sbaglia proprio i puntini
    // del bordo (spicchi in alto e in basso che nel video non ci sono).
    occhi: [
      { x: 126.512, y: 138.541, a: 52.068, b: 31.065 },
      { x: 381.918, y: 138.472, a: 52.121, b: 31.153 }
    ],
    esponente: 2.363,

    // --- COME SI MUOVONO (tempi e ampiezze del video, poi i gusti di Nike) --
    battito: {
      ogni: [3, 6],        // secondi fra un battito e l'altro (a caso)
      // Nel video l'occhio si chiude in 3 fotogrammi, resta chiuso e si
      // riapre in 2: chiusura secca, apertura ancora più secca. ~0,25 s.
      chiudi: 0.06, chiuso: 0.14, apri: 0.05,
      // Da chiuso l'occhio è UNA riga di puntini 1,5 righe sotto il centro
      // (nel video la riga 9, y 159,8, con l'occhio a y 138,5): il bordo
      // alto scende, quello basso sale appena. `riga` = mezza altezza della
      // riga chiusa: 6 px, la riga intera accesa e le vicine no.
      discesa: 21.2, riga: 6
    },
    sguardo: {
      ogni: [4, 8],
      va: 0.2, torna: 0.2,          // nel video 12-13 fotogrammi per spostarsi
      resta: [0.35, 0.9],
      catena: 0.5,                  // probabilità di passare all'altro lato prima di tornare (come fa il video)
      // Nel video lo sguardo va in basso a sinistra / in basso a destra di
      // 22,7 px e una riga, e l'occhio si stringe (a × 0,825): sembra
      // girare. «su» nel video non c'è: una riga in alto, e si stringe meno.
      direzioni: {
        sinistra: { x: -22.7, y: 14.0, a: 0.825, b: 0.97 },
        destra:   { x:  22.7, y: 14.0, a: 0.825, b: 0.97 },
        su:       { x:   0.0, y: -14.15, a: 0.94, b: 0.94 }
      }
    },
    espressioni: {
      ogni: [7, 10],
      // Il cambio di forma avviene DIETRO un battito: chiudi → cambia →
      // apri. `chiuso` è quanto resta chiuso mentre cambia.
      chiudi: 0.07, chiuso: 0.08, apri: 0.09,
      occhiolino: { chiudi: 0.08, chiuso: 0.42, apri: 0.09 },
      stupore:    { resta: 1.5, raggio: 43 },
      // Spessore 11: con 8 la «^» accendeva una riga di puntini sì e no, e
      // a schermo si leggeva come puntini sparsi, non come un arco.
      felice:     { resta: 1.5, larga: 44, alta: 30, spessore: 11 },
      // Un occhio solo, rettangolare, da un occhio all'altro: alto quattro
      // righe di LED come gli occhi a riposo (con due si leggeva come una
      // riga, non come un rettangolo). Dentro corre una luce più forte da
      // sinistra a destra. Base 0,8: a mezza luce (0,42) sul visore la banda
      // spariva e restava solo la luce che corre.
      scansione:  { resta: 2.0, altezza: 24, base: 0.8, picco: 1.6, larghezzaLuce: 26, passate: 2 },
      concentrato: { resta: 1.2, larga: 48, alta: 26 }
    },
    // prefers-reduced-motion: solo qualche battito, lento. Niente sguardi,
    // niente espressioni.
    ridotto: { ogni: [6, 10], chiudi: 0.18, chiuso: 0.12, apri: 0.2 }
  };

  var NOMI = ['occhiolino', 'stupore', 'felice', 'scansione', 'concentrato'];

  // ---------------------------------------------------------------------
  // Utilità
  function rnd(r) { return r[0] + Math.random() * (r[1] - r[0]); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smooth(e0, e1, v) { var t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }
  function easeOut(u) { return 1 - (1 - u) * (1 - u); }
  function easeInOut(u) { return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); }
  // Letta a ogni decisione e non una volta sola: chi cambia l'impostazione
  // del sistema a pagina aperta la vede rispettata dal battito successivo.
  var mqRidotto = null;
  function ridotto() {
    if (mqRidotto === null) mqRidotto = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : false;
    return !!(mqRidotto && mqRidotto.matches);
  }

  // ---------------------------------------------------------------------
  // Forme: distanza con segno in px (negativa dentro), in coordinate LOCALI
  // (x, y relative al centro della forma, y verso il basso come la tela).
  // Serve precisa solo vicino al bordo: a più di 6 px la copertura è già 0 o 1.
  function dSuperellisse(x, y, a, b, n) {
    // Distanza al primo ordine, f/|∇f|: esatta sul bordo.
    var X = Math.abs(x) / a + 1e-9, Y = Math.abs(y) / b + 1e-9;
    var Xn = Math.pow(X, n - 1), Yn = Math.pow(Y, n - 1);
    var f = Xn * X + Yn * Y - 1, gx = n * Xn / a, gy = n * Yn / b, g = Math.sqrt(gx * gx + gy * gy);
    return g < 1e-9 ? -Math.min(a, b) : f / g;
  }
  function dEllisse(x, y, a, b) { return dSuperellisse(x, y, a, b, 2); }
  function dSegmento(x, y, ax, ay, bx, by) {
    var px = x - ax, py = y - ay, vx = bx - ax, vy = by - ay;
    var h = clamp01((px * vx + py * vy) / (vx * vx + vy * vy));
    var dx = px - vx * h, dy = py - vy * h;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function dScatola(x, y, hw, hh) {
    var qx = Math.abs(x) - hw, qy = Math.abs(y) - hh;
    var ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
  }
  // Triangolo qualunque (sdTriangle di Inigo Quilez): t = [x0,y0,x1,y1,x2,y2].
  function dTriangolo(x, y, t) {
    var e0x = t[2] - t[0], e0y = t[3] - t[1], e1x = t[4] - t[2], e1y = t[5] - t[3], e2x = t[0] - t[4], e2y = t[1] - t[5];
    var v0x = x - t[0], v0y = y - t[1], v1x = x - t[2], v1y = y - t[3], v2x = x - t[4], v2y = y - t[5];
    var h0 = clamp01((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y));
    var h1 = clamp01((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y));
    var h2 = clamp01((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y));
    var p0x = v0x - e0x * h0, p0y = v0y - e0y * h0, p1x = v1x - e1x * h1, p1y = v1y - e1y * h1, p2x = v2x - e2x * h2, p2y = v2y - e2y * h2;
    var s = e0x * e2y - e0y * e2x > 0 ? 1 : -1;
    var d = Math.min(p0x * p0x + p0y * p0y, p1x * p1x + p1y * p1y, p2x * p2x + p2y * p2y);
    var sg = Math.min(s * (v0x * e0y - v0y * e0x), s * (v1x * e1y - v1y * e1x), s * (v2x * e2y - v2y * e2x));
    return sg < 0 ? Math.sqrt(d) : -Math.sqrt(d);
  }

  // Una «forma» è un occhio da disegnare: centro (cx, cy), mezza larghezza e
  // mezza altezza (hw, hh: il riquadro, e quanto c'è da schiacciare nel
  // battito), la distanza locale d(x, y) e, se c'è, la luce che la
  // attraversa (scansione). `forme()` aggiunge la riga di chiusura.
  function formaOcchio(o, g) {
    var a = o.a * g.a, b = o.b * g.b, n = CONFIG.esponente;
    return { cx: o.x + g.x, cy: o.y + g.y, hw: a, hh: b, d: function (x, y) { return dSuperellisse(x, y, a, b, n); } };
  }
  function formaCerchio(o, r) {
    return { cx: o.x, cy: o.y, hw: r, hh: r, d: function (x, y) { return Math.sqrt(x * x + y * y) - r; } };
  }
  // Felice: una «^» (punta in alto: la tela ha y verso il basso).
  function formaFelice(o, E) {
    var w = E.larga, h = E.alta / 2, s = E.spessore;
    return { cx: o.x, cy: o.y, hw: w + s, hh: h + s, d: function (x, y) {
      return Math.min(dSegmento(x, y, -w, h, 0, -h), dSegmento(x, y, 0, -h, w, h)) - s;
    } };
  }
  // Concentrato: triangolo col lato alto che scende verso il centro del
  // viso (il sopracciglio aggrottato). `verso` = +1 per l'occhio a sinistra
  // della tela (il suo lato interno è a destra), -1 per quello a destra.
  function formaConcentrato(o, E, verso) {
    var w = E.larga, h = E.alta, t = [-w * verso, -h, w * verso, h, -w * verso, h];
    return { cx: o.x, cy: o.y, hw: w, hh: h, d: function (x, y) { return dTriangolo(x, y, t); } };
  }
  function formaScansione(A, B, E) {
    var hw = (B.x - A.x) / 2 + (A.a + B.a) / 2, hh = E.altezza;
    return { cx: (A.x + B.x) / 2, cy: (A.y + B.y) / 2, hw: hw, hh: hh, d: function (x, y) { return dScatola(x, y, hw, hh); } };
  }

  // Le forme di un «look». Lo sguardo g sposta e stringe solo gli occhi
  // normali (durante le espressioni gli occhi guardano dritto).
  function forme(V) {
    var O = CONFIG.occhi, E = CONFIG.espressioni, B = CONFIG.battito, G = CONFIG.griglia, out;
    if (V.look === 'stupore') out = [formaCerchio(O[0], E.stupore.raggio), formaCerchio(O[1], E.stupore.raggio)];
    else if (V.look === 'felice') out = [formaFelice(O[0], E.felice), formaFelice(O[1], E.felice)];
    else if (V.look === 'concentrato') out = [formaConcentrato(O[0], E.concentrato, 1), formaConcentrato(O[1], E.concentrato, -1)];
    else if (V.look === 'scansione') {
      var sc = formaScansione(O[0], O[1], E.scansione), P = E.scansione, lx = V.luceX;
      sc.luce = function (x) { var u = (x - lx) / P.larghezzaLuce; return P.base + (P.picco - P.base) * Math.exp(-u * u); };
      out = [sc];
    } else out = [formaOcchio(O[0], V.g), formaOcchio(O[1], V.g)];
    for (var i = 0; i < out.length; i++) {
      var s = out[i], occhio = O[out.length === 1 ? 0 : i];
      // Riga di chiusura: 1,5 righe sotto il centro dell'OCCHIO (non della
      // forma: ogni look si chiude sulla stessa riga, così il cambio a occhi
      // chiusi non si vede), agganciata alla riga di LED più vicina — a metà
      // fra due righe la riga chiusa sarebbe due righe accese a metà.
      var yl = occhio.y + V.g.y + B.discesa;
      s.lineY = G.y0 + Math.round((yl - G.y0) / G.passoRiga) * G.passoRiga;
      s.chiusura = out.length === 1 ? Math.max(V.cl, V.cr) : (i === 0 ? V.cl : V.cr);
    }
    return out;
  }
  // Distanza di un punto della tela da una forma che si sta chiudendo (t =
  // 0 aperta, 1 chiusa). Il battito SCHIACCIA la forma in verticale verso la
  // sua riga di chiusura (come nel video: il bordo alto scende, quello basso
  // sale appena) e, verso la fine, la fonde in quella riga (un'ellisse
  // piatta larga quanto la forma): così una «^» o un triangolo si chiudono
  // in una riga piena e non in due trattini.
  function distanza(s, x, y, t) {
    var lx = x - s.cx;
    if (t <= 0) return s.d(lx, y - s.cy);
    var B = CONFIG.battito;
    var h = s.hh + (B.riga - s.hh) * t, yc = s.cy + (s.lineY - s.cy) * t, k = s.hh / h;
    var qy = (y - yc) * k, f0 = s.d(lx, qy);
    // Schiacciare deforma le distanze (in verticale si accorciano di k):
    // si rinormalizzano col gradiente preso sulla tela.
    var e = 0.5, fx = s.d(lx + e, qy) - f0, fy = s.d(lx, (y + e - yc) * k) - f0;
    var g = Math.sqrt(fx * fx + fy * fy) / e;
    var dq = g > 1e-6 ? f0 / g : f0;
    var w = smooth(0.35, 1, t);
    if (w > 0) dq += (dEllisse(lx, y - s.lineY, s.hw, B.riga) - dq) * w;
    return dq;
  }

  // ---------------------------------------------------------------------
  // La tela (costruita alla prima update con robot.spline pronto).
  var T = null;
  var LONTANO = 1e9;

  function costruisci(robot) {
    var C = CONFIG, G = C.griglia, W = C.tela.w, H = C.tela.h;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var fondo = document.createElement('canvas'); fondo.width = W; fondo.height = H;
    var accesi = document.createElement('canvas'); accesi.width = W; accesi.height = H;

    // I puntini: posizione e quadratino da copiare. Indice j = k·56 + c
    // (una tabella piatta, con i buchi dove k + c è pari).
    var N = G.righe * 56;
    var px = new Float32Array(N), py = new Float32Array(N), ok = new Uint8Array(N);
    var bx = new Int16Array(N), by = new Int16Array(N), bw = new Int16Array(N), bh = new Int16Array(N);
    var R1 = C.puntino.rZero;
    for (var k = 0; k < G.righe; k++) {
      for (var c = 0; c < G.mezzeColonne; c++) {
        if ((k + c) % 2 === 0) continue;
        var j = k * 56 + c;
        ok[j] = 1; px[j] = G.x0 + c * G.mezzoPasso; py[j] = G.y0 + k * G.passoRiga;
        bx[j] = Math.ceil(px[j] - R1); by[j] = Math.ceil(py[j] - R1);
        bw[j] = Math.floor(px[j] + R1) - bx[j] + 1; bh[j] = Math.floor(py[j] + R1) - by[j] + 1;
      }
    }

    // I due strati fissi, pixel per pixel col profilo misurato. I puntini
    // non si toccano (16 px di passo, raggio 4,6): ogni pixel ne vede uno.
    var fd = new ImageData(W, H), ad = new ImageData(W, H);
    for (var i = 3; i < fd.data.length; i += 4) { fd.data[i] = 255; ad.data[i] = 255; }
    var prof = C.puntino.fondo, R0 = C.puntino.rPieno;
    for (var q = 0; q < N; q++) {
      if (!ok[q]) continue;
      for (var yy = by[q]; yy < by[q] + bh[q]; yy++) {
        for (var xx = bx[q]; xx < bx[q] + bw[q]; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          var r = Math.sqrt((xx - px[q]) * (xx - px[q]) + (yy - py[q]) * (yy - py[q]));
          var f = r * 4 - 0.5, i0 = Math.floor(f), fr = f - i0;
          var vb = i0 < 0 ? prof[0] : (i0 >= prof.length - 1 ? 0 : prof[i0] + (prof[i0 + 1] - prof[i0]) * fr);
          var o = (yy * W + xx) * 4;
          fd.data[o] = fd.data[o + 1] = fd.data[o + 2] = Math.round(vb);
          ad.data[o] = ad.data[o + 1] = ad.data[o + 2] = Math.round(255 * clamp01((R1 - r) / (R1 - R0)));
        }
      }
    }
    fondo.getContext('2d').putImageData(fd, 0, 0);
    accesi.getContext('2d').putImageData(ad, 0, 0);

    T = {
      spline: robot.spline, canvas: canvas, ctx: canvas.getContext('2d'), fondo: fondo, accesi: accesi,
      texture: new THREE.CanvasTexture(canvas),
      px: px, py: py, ok: ok, bx: bx, by: by, bw: bw, bh: bh,
      dist: new Float32Array(N).fill(LONTANO), quale: new Int8Array(N), alone: new Float32Array(N),
      segnato: new Uint8Array(N), toccati: [],
      firma: '', disegni: 0, caricamenti: 0
    };
    // Primo disegno PRIMA di passare la tela allo shader: gli occhi a riposo
    // sono già lì, identici al poster che si vedeva fino a un attimo fa.
    var V = statoVisivo();
    disegna(V);
    T.firma = firma(V);
    // setOcchi copia sulla texture le impostazioni della VideoTexture
    // (encoding, flipY, formato, mipmap, filtri) e la carica.
    robot.spline.setOcchi(T.texture);
    T.caricamenti++;
  }

  // ---------------------------------------------------------------------
  // Il disegno di uno stato visivo V (look, chiusure, sguardo, luce).
  var ANELLI = [
    [[0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    [[1, 3], [1, -3], [-1, 3], [-1, -3], [2, 0], [-2, 0]],
    [[0, 4], [0, -4], [2, 2], [2, -2], [-2, 2], [-2, -2]]
  ];
  // Quota di un disco di raggio r coperta da un semipiano a distanza d dal
  // suo centro.
  function copertura(d, r) {
    var t = d / r;
    if (t <= -1) return 1;
    if (t >= 1) return 0;
    return (Math.acos(t) - t * Math.sqrt(1 - t * t)) / Math.PI;
  }
  function segna(j) { if (!T.segnato[j]) { T.segnato[j] = 1; T.toccati.push(j); } }
  function disegna(V) {
    var C = CONFIG, G = C.griglia, dist = T.dist, quale = T.quale, alone = T.alone, tocc = T.toccati;
    for (var z0 = 0; z0 < tocc.length; z0++) { var jz = tocc[z0]; dist[jz] = LONTANO; alone[jz] = 0; T.segnato[jz] = 0; }
    tocc.length = 0;
    var FF = forme(V), R1 = C.puntino.rZero, rA = C.puntino.rAlone, margine = rA + 1;
    // 1) Distanza di ogni puntino dalla forma più vicina (solo nel riquadro).
    var fonti = [];
    for (var f = 0; f < FF.length; f++) {
      var s = FF[f], t = s.chiusura;
      var y0 = Math.min(s.cy - s.hh, s.lineY - C.battito.riga) - margine;
      var y1 = Math.max(s.cy + s.hh, s.lineY + C.battito.riga) + margine;
      var k0 = Math.max(0, Math.ceil((y0 - G.y0) / G.passoRiga)), k1 = Math.min(G.righe - 1, Math.floor((y1 - G.y0) / G.passoRiga));
      var c0 = Math.max(0, Math.ceil((s.cx - s.hw - margine - G.x0) / G.mezzoPasso));
      var c1 = Math.min(G.mezzeColonne - 1, Math.floor((s.cx + s.hw + margine - G.x0) / G.mezzoPasso));
      for (var k = k0; k <= k1; k++) {
        for (var c = c0; c <= c1; c++) {
          var j = k * 56 + c;
          if (!T.ok[j]) continue;
          var d = distanza(s, T.px[j], T.py[j], t);
          if (d >= rA || d >= dist[j]) continue;
          if (dist[j] === LONTANO) fonti.push(j);
          dist[j] = d; quale[j] = f;
          segna(j);
        }
      }
    }
    // 2) L'alone: ogni fonte regala luce ai vicini, in proporzione a quanto
    //    è dentro la forma (e a quanto è forte la luce che la attraversa).
    var K = C.luce.alone;
    for (var a = 0; a < fonti.length; a++) {
      var jj = fonti[a], sf = FF[quale[jj]];
      var v = copertura(dist[jj], rA) * (sf.luce ? sf.luce(T.px[jj]) : 1);
      var kk = (jj / 56) | 0, cc = jj - kk * 56;
      for (var ri = 0; ri < 3; ri++) {
        var an = ANELLI[ri], kr = K[ri] * v;
        for (var n = 0; n < 6; n++) {
          var nk = kk + an[n][0], nc = cc + an[n][1];
          if (nk < 0 || nk >= G.righe || nc < 0 || nc >= G.mezzeColonne) continue;
          var nj = nk * 56 + nc;
          if (!T.ok[nj]) continue;
          alone[nj] += kr; segna(nj);
        }
      }
    }
    // 3) Sulla tela: il fondo, poi i quadratini accesi sommati.
    var ctx = T.ctx, A = C.luce.accesi, pieno = -(R1 + 0.5);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(T.fondo, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (var z = 0; z < tocc.length; z++) {
      var p = tocc[z], dp = dist[p], L = alone[p];
      var sp = dp < R1 + 0.5 ? FF[quale[p]] : null;
      var Hd = sp ? A * (sp.luce ? sp.luce(T.px[p]) : 1) : 0;
      if (Hd > 0 && dp <= pieno) { somma(p, L + Hd); continue; }   // tutto dentro
      somma(p, L);                                                  // alone sul disco intero
      if (Hd > 0) {
        // A cavallo del bordo: acceso solo lo SPICCHIO dentro la forma, come
        // nel video (non un puntino intero a mezza luce). Il bordo, alla
        // scala di un puntino, è una retta: si ritaglia col semipiano
        // tangente, normale presa dal gradiente della distanza.
        var e = 0.5, x = T.px[p], y = T.py[p];
        var gx = distanza(sp, x + e, y, sp.chiusura) - dp, gy = distanza(sp, x, y + e, sp.chiusura) - dp;
        var gl = Math.sqrt(gx * gx + gy * gy);
        if (gl < 1e-9) { gx = 0; gy = 1; gl = 1; }
        var nx = gx / gl, ny = gy / gl;
        ctx.save();
        ctx.beginPath();
        // Riferimento ruotato: u lungo la normale (verso fuori), origine nel
        // centro del puntino (+0,5: dagli indici di pixel alla canvas).
        // Dentro = u < -d.
        ctx.setTransform(nx, ny, -ny, nx, x + 0.5, y + 0.5);
        ctx.rect(-8, -8, 8 - dp, 16);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clip();
        somma(p, Hd);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    T.disegni++;
  }
  // Somma al puntino p il suo disco acceso con livello L (su 255). Sopra 255
  // si somma in più passate: il centro è già bianco, ma la rampa del bordo
  // si allarga come nel video.
  function somma(p, L) {
    var ctx = T.ctx, x = T.bx[p], y = T.by[p], w = T.bw[p], h = T.bh[p];
    L /= 255;
    while (L > 0.002) {
      ctx.globalAlpha = L > 1 ? 1 : L;
      ctx.drawImage(T.accesi, x, y, w, h, x, y, w, h);
      L -= 1;
    }
  }

  // ---------------------------------------------------------------------
  // Il tempo: un'«azione» alla volta (battito, sguardo, espressione), fatta
  // di segmenti. Ogni segmento dice quanto dura, che forma hanno gli occhi,
  // da quanto a quanto è chiuso ciascuno e dove guardano.
  var CENTRO = { x: 0, y: 0, a: 1, b: 1 };
  var S = {
    t: 0,              // orologio degli occhi (s): avanza solo quando si vedono
    azione: null,
    // false = ciclo normale; true = fermi a riposo; un numero = azione
    // congelata a quel secondo (per i test: vedi forza()).
    fermo: false,
    prossimo: { battito: 1.5, sguardo: 5, espressione: 6 },
    ultima: null
  };

  function seg(d, look, cl, cr, g0, g1, extra) {
    var o = { d: d, look: look, cl: cl, cr: cr, g0: g0 || 'centro', g1: g1 || g0 || 'centro' };
    if (extra) for (var key in extra) o[key] = extra[key];
    return o;
  }
  function azione(nome, segmenti) {
    var tot = 0; segmenti.forEach(function (s) { tot += s.d; });
    return { nome: nome, seg: segmenti, durata: tot, t0: S.t };
  }
  function azBattito(lento) {
    var B = lento ? CONFIG.ridotto : CONFIG.battito;
    return azione('battito', [
      seg(B.chiudi, 'riposo', [0, 1], [0, 1]),
      seg(B.chiuso, 'riposo', [1, 1], [1, 1]),
      seg(B.apri, 'riposo', [1, 0], [1, 0])
    ]);
  }
  function azSguardo(dir) {
    var Sg = CONFIG.sguardo, dirs = ['sinistra', 'destra', 'su'];
    dir = dir || dirs[(Math.random() * dirs.length) | 0];
    var s = [seg(Sg.va, 'riposo', [0, 0], [0, 0], 'centro', dir), seg(rnd(Sg.resta), 'riposo', [0, 0], [0, 0], dir)];
    var ult = dir;
    if (dir !== 'su' && Math.random() < Sg.catena) {
      var altro = dir === 'sinistra' ? 'destra' : 'sinistra';
      s.push(seg(Sg.va, 'riposo', [0, 0], [0, 0], dir, altro), seg(rnd(Sg.resta), 'riposo', [0, 0], [0, 0], altro));
      ult = altro;
    }
    s.push(seg(Sg.torna, 'riposo', [0, 0], [0, 0], ult, 'centro'));
    return azione('sguardo-' + dir, s);
  }
  // Espressione con cambio di forma: chiudi → cambia → apri → resta →
  // chiudi → torna normale → apri. Il cambio cade a occhi chiusi.
  function azForma(nome, resta, extra) {
    var E = CONFIG.espressioni;
    return azione(nome, [
      seg(E.chiudi, 'riposo', [0, 1], [0, 1]),
      seg(E.chiuso / 2, 'riposo', [1, 1], [1, 1]),
      seg(E.chiuso / 2, nome, [1, 1], [1, 1]),
      seg(E.apri, nome, [1, 0], [1, 0]),
      seg(resta, nome, [0, 0], [0, 0], null, null, extra),
      seg(E.chiudi, nome, [0, 1], [0, 1]),
      seg(E.chiuso / 2, nome, [1, 1], [1, 1]),
      seg(E.chiuso / 2, 'riposo', [1, 1], [1, 1]),
      seg(E.apri, 'riposo', [1, 0], [1, 0])
    ]);
  }
  function azEspressione(nome) {
    var E = CONFIG.espressioni;
    if (nome === 'occhiolino') {
      // Un occhio solo, e niente cambio di forma: l'occhiolino È il battito.
      var O = E.occhiolino, sx = Math.random() < 0.5;
      var ch = function (a, b) { return sx ? [[a, b], [0, 0]] : [[0, 0], [a, b]]; };
      var s1 = ch(0, 1), s2 = ch(1, 1), s3 = ch(1, 0);
      var az = azione('occhiolino', [
        seg(O.chiudi, 'riposo', s1[0], s1[1]),
        seg(O.chiuso, 'riposo', s2[0], s2[1]),
        seg(O.apri, 'riposo', s3[0], s3[1])
      ]);
      az.lato = sx ? 'sinistro' : 'destro';
      return az;
    }
    if (nome === 'scansione') return azForma(nome, E.scansione.resta, { scan: true });
    return azForma(nome, E[nome].resta);
  }

  function interpSguardo(a, b, u) {
    var D = CONFIG.sguardo.direzioni, A = a === 'centro' ? CENTRO : D[a], B = b === 'centro' ? CENTRO : D[b];
    return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u, a: A.a + (B.a - A.a) * u, b: A.b + (B.b - A.b) * u };
  }
  function tempoAzione() {
    return typeof S.fermo === 'number' ? S.fermo : S.t - S.azione.t0;
  }
  // Stato visivo adesso: look, chiusura dei due occhi, sguardo, luce.
  function statoVisivo() {
    var az = S.azione;
    if (!az) return { look: 'riposo', cl: 0, cr: 0, g: CENTRO, luceX: null };
    var u = Math.min(az.durata, tempoAzione()), acc = 0, sg = az.seg[az.seg.length - 1], v = 1, inizio = 0;
    for (var i = 0; i < az.seg.length; i++) {
      if (u <= acc + az.seg[i].d || i === az.seg.length - 1) { sg = az.seg[i]; inizio = acc; v = sg.d > 0 ? clamp01((u - acc) / sg.d) : 1; break; }
      acc += az.seg[i].d;
    }
    // Chiudere e aprire: ease-out (nel video l'occhio è già a metà al primo
    // fotogramma). Lo sguardo: ease-in-out.
    var e = easeOut(v);
    var cl = sg.cl[0] + (sg.cl[1] - sg.cl[0]) * e, cr = sg.cr[0] + (sg.cr[1] - sg.cr[0]) * e;
    var g = interpSguardo(sg.g0, sg.g1, easeInOut(v));
    var luceX = null;
    if (sg.look === 'scansione') {
      // Fuori dal segmento della luce (mentre la banda si apre e si chiude)
      // la luce sta lontana a sinistra: la banda è al suo livello base, lo
      // stesso da cui la luce parte e a cui torna. Niente salti.
      luceX = -1e4;
      if (sg.scan) {
        // A ogni passata la luce entra da fuori a sinistra ed esce da fuori
        // a destra: niente scatto quando ricomincia.
        var O = CONFIG.occhi, P = CONFIG.espressioni.scansione;
        var xa = O[0].x - O[0].a - 2 * P.larghezzaLuce, xb = O[1].x + O[1].a + 2 * P.larghezzaLuce;
        var fase = ((u - inizio) / sg.d * P.passate) % 1;
        luceX = xa + (xb - xa) * easeInOut(fase);
      }
    }
    return { look: sg.look, cl: cl, cr: cr, g: g, luceX: luceX };
  }
  // Due stati con la stessa firma danno la stessa immagine: niente disegno.
  function firma(V) {
    return V.look + '|' + V.cl.toFixed(3) + '|' + V.cr.toFixed(3) + '|' + V.g.x.toFixed(2) + ',' + V.g.y.toFixed(2) + ',' +
      V.g.a.toFixed(4) + ',' + V.g.b.toFixed(4) + '|' + (V.luceX === null ? '-' : V.luceX.toFixed(1));
  }

  function avvia(az) { az.t0 = S.t; S.azione = az; }
  function fine(az) {
    var P = S.prossimo;
    if (az.nome === 'battito') P.battito = S.t + rnd(ridotto() ? CONFIG.ridotto.ogni : CONFIG.battito.ogni);
    else if (az.nome.indexOf('sguardo') === 0) P.sguardo = S.t + rnd(CONFIG.sguardo.ogni);
    else {
      P.espressione = S.t + rnd(CONFIG.espressioni.ogni);
      // Un'espressione ha già battuto le palpebre: il battito normale
      // aspetta un po' invece di arrivare subito dopo.
      P.battito = Math.max(P.battito, S.t + rnd([1.5, 3]));
    }
    // Chi è scaduto durante l'azione non parte a ruota: prima una pausa.
    ['battito', 'sguardo', 'espressione'].forEach(function (k) {
      if (P[k] < S.t + 0.5) P[k] = S.t + 0.5 + Math.random() * 0.7;
    });
  }
  function pianifica() {
    if (S.fermo !== false) return;
    var az = S.azione;
    if (az && S.t - az.t0 >= az.durata) { S.azione = null; fine(az); az = null; }
    if (az) return;
    var P = S.prossimo, lento = ridotto();
    if (!lento && S.t >= P.espressione) {
      // A caso, ma mai la stessa due volte di fila.
      var scelte = NOMI.filter(function (n) { return n !== S.ultima; });
      S.ultima = scelte[(Math.random() * scelte.length) | 0];
      avvia(azEspressione(S.ultima));
    } else if (S.t >= P.battito) avvia(azBattito(lento));
    else if (!lento && S.t >= P.sguardo) avvia(azSguardo());
  }

  // ---------------------------------------------------------------------
  // Per la verifica headless (window.__robot.occhi). stato() dice cosa sta
  // succedendo (e quante volte si è disegnato/caricato: a occhi fermi i
  // contatori non si muovono). forza(nome[, secondi]) fa partire subito
  // un'espressione — o 'battito', 'sguardo-sinistra|destra|su' — e, se si
  // passano i secondi, la CONGELA a quel punto: i fotogrammi del test non
  // dipendono dalla velocità di swiftshader. forza('riposo') ferma tutto a
  // riposo, forza('auto') riprende il ciclo normale.
  var API = {
    stato: function () {
      var V = statoVisivo();
      return {
        azione: S.azione ? S.azione.nome : null,
        tempo: S.azione ? tempoAzione() : 0, durata: S.azione ? S.azione.durata : 0,
        look: V.look, chiusura: [V.cl, V.cr], sguardo: { x: V.g.x, y: V.g.y }, luceX: V.luceX,
        lato: S.azione && S.azione.lato || null, ultima: S.ultima,
        fermo: S.fermo !== false, ridotto: ridotto(), orologio: S.t,
        prossimo: { battito: S.prossimo.battito, sguardo: S.prossimo.sguardo, espressione: S.prossimo.espressione },
        disegni: T ? T.disegni : 0, caricamenti: T ? T.caricamenti : 0, pronto: !!T
      };
    },
    forza: function (nome, secondi) {
      if (nome === 'auto') { S.fermo = false; S.azione = null; return true; }
      if (nome === 'riposo') { S.azione = null; S.fermo = true; return true; }
      var az = null;
      if (NOMI.indexOf(nome) >= 0) { az = azEspressione(nome); S.ultima = nome; }
      else if (nome === 'battito') az = azBattito(ridotto());
      else if (/^sguardo-(sinistra|destra|su)$/.test(nome)) az = azSguardo(nome.slice(8));
      if (!az) return false;
      avvia(az);
      S.fermo = typeof secondi === 'number' ? secondi : false;
      return true;
    },
    canvas: function () { return T ? T.canvas : null; }
  };

  function update(robot, dt) {
    if (!robot || !robot.spline || !robot.spline.setOcchi) return;
    // Un robot nuovo (smontato e rimontato): la tela vecchia l'ha già
    // smaltita spline.dispose() (setOcchi la mette fra le sue texture).
    if (!T || T.spline !== robot.spline) {
      if (typeof THREE === 'undefined' || !THREE.CanvasTexture) return;
      costruisci(robot);
      robot.occhi = API;
    }
    // Fuori schermo o testa aperta (occhi spenti dallo shader): niente
    // tempo, niente disegno, niente upload. Il tempo si ferma e riparte da
    // dove era: un'espressione lasciata a metà la si vede finire.
    if (robot.spline.inVista && !robot.spline.inVista()) return;
    if (robot.hover && robot.hover.testa > 0.99) return;
    if (S.fermo === false) S.t += Math.min(dt || 0, 0.1);
    pianifica();
    var V = statoVisivo(), fm = firma(V);
    if (fm === T.firma) return;
    T.firma = fm;
    disegna(V);
    T.texture.needsUpdate = true;
    T.caricamenti++;
  }

  return { update: update, config: CONFIG, api: API };
})();
