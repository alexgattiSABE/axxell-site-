/* FESTINA — il filmato che scorre solo se scorri tu.
 *
 * Un product film di 10,04 s (241 fotogrammi a 24 fps) montato su un pin: la
 * posizione dello scroll diventa il `currentTime` del video. Non parte mai da
 * solo, non va in loop, non ha controlli. Fermi il dito e si ferma a metà
 * esplosione; torni su e si rimonta all'indietro.
 *
 * ── PERCHÉ IL VIDEO È RICOMPRESSO CON I KEYFRAME FITTI ─────────────────────
 * Il master ha un keyframe ogni ~4 secondi: per mostrare un istante qualsiasi
 * il decoder deve ripartire dall'ultimo keyframe e decodificare tutto quello
 * che c'è in mezzo, e in scrub si vede — l'immagine si aggancia a scatti.
 * `assets/festina.mp4` ha un keyframe ogni 6 fotogrammi (vedi
 * `scripts/pack-festina.md`): al massimo cinque fotogrammi da decodificare per
 * ogni salto. Senza audio, perché qui non si riproduce niente.
 *
 * ── PERCHÉ NON SI SCRIVE currentTime A OGNI FRAME ──────────────────────────
 * Una richiesta di seek mentre la precedente è ancora in volo, su Safari, non
 * si accoda: si perde. Con lo scroll che aggiorna a 60 Hz vuol dire un video
 * che resta indietro e ogni tanto si pianta. Qui si tiene UNA posizione
 * desiderata (`want`) e si salta solo quando il salto precedente è finito
 * (`seeked`) — se nel frattempo `want` è cambiato, si riparte subito verso
 * l'ultimo valore. È una coda lunga uno: sempre l'istante più recente.
 *
 * ── LE FRASI STANNO DOVE IL FOTOGRAMMA È VUOTO ─────────────────────────────
 * Non sono messe a occhio. `scripts/festina-spazi.py` legge tutti i 241
 * fotogrammi, stima lo sfondo dello studio con una sfocatura larga, segna come
 * "occupato" ciò che è più scuro del proprio intorno, dilata di due celle per
 * il margine, e cerca i rettangoli che restano liberi per TUTTA la finestra in
 * cui una frase è a schermo. Le quattro finestre qui sotto e i quattro
 * rettangoli in `css/sections.css` sono il risultato di quella ricerca.
 *
 * Fra 3,05 s e 7,80 s non c'è nessuna frase, e non è una dimenticanza: in
 * piena esplosione il rettangolo libero più grande vale l'1-3% dell'inquadratura.
 * Qualsiasi parola lì sopra finirebbe su un ingranaggio. Il capitolo tace
 * mentre l'orologio si apre, e ricomincia a parlare quando si richiude.
 *
 * ⚠️ Se un giorno si cambia il filmato, le finestre e i rettangoli NON si
 * aggiustano a mano: si rilancia lo script e si riportano i numeri che dà.
 */
WC.register('festina', function(ctx){
  var sec   = document.getElementById('capFestina');
  var pin   = document.getElementById('wcFestinaPin');
  var video = document.getElementById('wcFestinaVideo');
  if (!sec || !pin || !video) return;

  var stage = sec.querySelector('.wc-festina-stage');
  var says  = Array.prototype.slice.call(sec.querySelectorAll('.wc-festina-say'));

  // ---------------------------------------------------- il riquadro del video
  // A schermata intera il video è ritagliato (`object-fit:cover`): quello che
  // si vede è una finestra sul fotogramma, non il fotogramma. I rettangoli
  // delle frasi sono misurati SUL FOTOGRAMMA, quindi vanno riportati sul
  // riquadro reale — non sul viewport, o scivolerebbero sull'orologio a ogni
  // proporzione diversa da 16:9.
  var AR = 16 / 9;
  function frame(){
    if (!stage) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    // `cover`: si sceglie la scala che copre, e l'eccesso esce simmetrico.
    var fw = w, fh = w / AR;
    if (fh < h) { fh = h; fw = h * AR; }
    stage.style.setProperty('--fx', ((w - fw) / 2) + 'px');
    stage.style.setProperty('--fy', ((h - fh) / 2) + 'px');
    stage.style.setProperty('--fw', fw + 'px');
    stage.style.setProperty('--fh', fh + 'px');
  }

  // Durata nominale del filmato. Serve PRIMA che i metadati siano scesi,
  // perché la timeline delle frasi si costruisce all'init: le posizioni sono
  // frazioni di questa. Il seek invece usa la durata vera, quando c'è.
  var DUR = 10.04;

  // Finestre in secondi di filmato, una per frase, nell'ordine del markup.
  // Misurate, non scelte: vedi l'intestazione.
  var WIN = [[0.00, 1.80], [1.90, 2.90], [7.80, 8.95], [8.90, 10.04]];

  // Con reduced-motion il filmato non si muove affatto: resta il poster e le
  // frasi diventano una lista sotto. Un capitolo che senza movimento non dice
  // più niente sarebbe un capitolo vuoto, e un capitolo vuoto è un bug.
  if (!ctx.motionOk) { sec.classList.add('-static'); return; }

  // ------------------------------------------------------------ caricamento
  // Come la sneaker: i <source> nascono con data-src, così `preload="none"`
  // non deve nemmeno provare a fare il suo lavoro — finché non ci si avvicina
  // il browser non ha proprio un indirizzo da cui scaricare. Sono 2,2 MB in
  // fondo a una pagina che ha già cinque scene WebGL, due modelli e un video.
  var loaded = false, ready = false;

  function load(){
    if (loaded) return;
    loaded = true;
    var srcs = video.querySelectorAll('source[data-src]');
    for (var i = 0; i < srcs.length; i++){
      srcs[i].src = srcs[i].getAttribute('data-src');
      srcs[i].removeAttribute('data-src');
    }
    /* ⚠️ QUESTA RIGA È IL MOTIVO PER CUI L'OROLOGIO NON SI MUOVEVA.
     * Il tag nasce con `preload="none"` per non scaricare 2,2 MB a chi non
     * arriva fin qui. Ma con quell'attributo ancora addosso, `load()` dice al
     * browser di non precaricare NIENTE: `loadedmetadata` non arriva mai,
     * quindi `ready` resta falso, quindi `pump()` esce subito e il video non
     * si sposta di un fotogramma. Restava il poster, fermo.
     * La sneaker non aveva il problema perché fa `play()`, e la riproduzione
     * il caricamento lo forza. Qui non si riproduce niente: si cerca. Quindi
     * l'attributo va tolto nel momento esatto in cui si decide di caricare. */
    video.preload = 'auto';
    video.load();
  }

  function onMeta(){
    ready = true;
    sec.classList.add('-ready');
    // iOS non disegna niente finché il video non è stato riprodotto almeno
    // una volta: si resta col poster e si scrolla su un'immagine ferma. Un
    // play immediatamente annullato basta a sbloccare la pittura, ed è
    // permesso senza gesto perché il video è muto e playsinline.
    var p = video.play();
    if (p && p.then) p.then(function(){ video.pause(); }).catch(function(){});
    else video.pause();
    pump();
  }
  video.addEventListener('loadedmetadata', onMeta);

  // ------------------------------------------------------------------ seek
  var want = 0, seeking = false, seekAt = 0;

  function pump(){
    if (!ready) return;
    // La coda è lunga uno e si sblocca da sola. Se `seeked` non arriva — un
    // seek rifiutato, una sorgente che si riapre, un browser che decide di
    // non emetterlo — senza questa scadenza la bandiera resterebbe alzata per
    // sempre e il filmato si pianterebbe lì, in silenzio.
    if (seeking && (Date.now() - seekAt) < 500) return;
    var dur = isFinite(video.duration) && video.duration > 0 ? video.duration : DUR;
    // L'ultimissimo istante non è un fotogramma valido: un seek esattamente a
    // `duration` su alcuni browser non emette mai `seeked` e la coda si pianta.
    var t = Math.max(0, Math.min(dur - 0.04, want));
    // Mezzo fotogramma di tolleranza: sotto, il salto non cambierebbe
    // l'immagine e costerebbe comunque un seek.
    if (Math.abs(video.currentTime - t) < 1 / 48) return;
    seeking = true; seekAt = Date.now();
    try { video.currentTime = t; } catch (err) { seeking = false; }
  }

  function onSeeked(){ seeking = false; pump(); }
  video.addEventListener('seeked', onSeeked);
  // Se un seek fallisce a metà (rete che cade, sorgente che si riapre) la
  // bandiera resterebbe alzata per sempre e il video si fermerebbe lì.
  video.addEventListener('error', function(){ seeking = false; });

  // ------------------------------------------------------------- timeline
  var state = { t: 0 };

  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      pin: pin,
      // La sezione è alta 400svh apposta per fornire lei la corsa: con
      // pinSpacing:true se ne aggiungerebbe altrettanta sotto, cioè tre
      // schermate di scroll morto a filmato finito. Stesso schema dei pin
      // dei cap. 01, 03, 06 e 07.
      pinSpacing: false,
      anticipatePin: 1,
      // Un filo di ritardo: lo scrub secco su un video fa sembrare a scatti
      // anche i salti riusciti, perché la posizione salta con lo scroll
      // invece di inseguirlo.
      scrub: .45,
      invalidateOnRefresh: true,
      // Il riquadro cambia con la finestra, e ScrollTrigger passa di qui a
      // ogni resize: una misura sola all'avvio lascerebbe le frasi ferme
      // dove stavano prima di girare il telefono.
      onRefresh: frame,
      onEnter: load, onEnterBack: load
    }
  });
  frame();

  // La corsa del filmato: un solo tween lungo quanto tutta la timeline.
  tl.to(state, {
    t: 1, duration: 1, ease: 'none',
    onUpdate: function(){
      var dur = isFinite(video.duration) && video.duration > 0 ? video.duration : DUR;
      want = state.t * dur;
      pump();
    }
  }, 0);

  // Le frasi, ognuna appesa alla sua finestra. Le dissolvenze stanno DENTRO
  // la finestra, non a cavallo: il rettangolo è garantito libero solo lì, e
  // una frase che sfuma fuori tempo sfumerebbe sopra un ingranaggio.
  says.forEach(function(el, i){
    var w = WIN[i]; if (!w) return;
    var a = w[0] / DUR, b = w[1] / DUR;
    var fade = Math.min((b - a) * .30, .035);
    tl.fromTo(el, { opacity: 0, y: 16 },
                  { opacity: 1, y: 0, duration: fade, ease: 'none' }, a);
    tl.to(el, { opacity: 0, y: -12, duration: fade, ease: 'none' }, b - fade);
  });

  // Il primo pezzo di filmato serve prima di arrivarci: mezza schermata di
  // margine e il buffer è già aperto quando la sezione entra in scena.
  var stPre = ScrollTrigger.create({
    trigger: sec, start: 'top bottom+=50%', end: 'bottom top-=50%',
    onEnter: load, onEnterBack: load
  });

  sec.classList.add('-live');

  return function(){
    tl.scrollTrigger && tl.scrollTrigger.kill();
    tl.kill();
    stPre.kill();
    video.removeEventListener('loadedmetadata', onMeta);
    video.removeEventListener('seeked', onSeeked);
    gsap.set(says, { clearProps: 'opacity,transform' });
    sec.classList.remove('-live', '-ready');
  };
});
