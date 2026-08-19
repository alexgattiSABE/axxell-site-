WC.register('manifesto', function(ctx){
  var el = document.getElementById('wcManifesto');
  if (!el) return;
  var items = WC.splitWords(el);

  /* I COLORI DELLA SEZIONE, non una palette decorativa: sono gli stessi quattro
   * dell'elica (js/dna.js, `colorLow` / `colorAqua` / `colorHigh` / `colorRed`),
   * portati alla luminosità che serve a un testo su nero. Quelli dell'elica
   * sono scuri perché lì la fusione è additiva e si sommano punto su punto;
   * qui sono inchiostro, e vanno letti. Stessa quaterna, stessa sequenza dal
   * basso verso l'alto: chi guarda l'elica e poi il testo vede la stessa
   * scala. */
  var PALETTE = ['#4a7bff', '#2fe0c4', '#a75cff', '#ff5a68'];

  // Reduced-motion: testo pieno, nessuno scrub.
  if (!ctx.motionOk) {
    gsap.set(items, { color: '#f0f0f6', opacity: 1 });
    return;
  }

  /* Il riferimento è la SEZIONE, non il paragrafo, e comincia quando comincia
   * il pin (`top top`).
   *
   * Prima era `trigger: el` con `top 75%` → `bottom 55%`: misure prese sulla
   * posizione del testo nel flusso. Da quando il capitolo è pinnato (js/dna.js)
   * quella posizione si congela appena il pin scatta, e tutto lo scrub finiva
   * PRIMA che la sezione si fermasse: arrivavi sul capitolo e il testo era già
   * tutto bianco. Visto a schermo.
   *
   * `+=100%` è una schermata di scroll: su 160svh di corsa, il testo finisce di
   * accendersi a circa due terzi, e l'ultimo terzo resta all'elica. */
  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#cap02',
      start: 'top top',
      // '+=130%' e non più '+=100%': le onde sono due e la seconda finisce
      // dopo la prima. Con una schermata sola l'ultima parola prendeva il suo
      // colore proprio nell'ultimo pixel di corsa, cioè non lo prendeva.
      end: '+=130%',
      scrub: .6
    }
  });
  /* DUE ONDE, non una.
   *
   * Prima ce n'era una sola: le parole partivano grigie e diventavano bianche.
   * Adesso partono da NIENTE — opacità zero — e succedono due cose in fila,
   * sfalsate, sulle stesse parole e nello stesso ordine:
   *
   *   1ª onda   la parola compare, e compare BIANCA. È il momento in cui il
   *             testo si scrive: fin qui non c'era.
   *   2ª onda   la parola prende il suo colore, uno dei quattro della sezione.
   *             Parte quando la prima è a circa un terzo, quindi le due onde
   *             si accavallano: mentre in fondo al paragrafo le parole stanno
   *             ancora comparendo, in cima si stanno già colorando. Se
   *             partisse a prima finita si leggerebbero come due animazioni
   *             separate su un testo fermo in mezzo.
   *
   * `span` è la durata vera della prima onda: lo sfalsamento moltiplicato per
   * il numero di parole, più il tween. Va calcolato e non indovinato — il
   * manifesto può cambiare lunghezza, e una posizione scritta a mano ("parti
   * al secondo 6") si scollerebbe alla prima riscrittura del testo. */
  var STAG = .35;
  var span = STAG * (items.length - 1) + .5;

  tl.fromTo(items, { opacity: 0, color: '#f0f0f6' },
                   { opacity: 1, stagger: STAG, ease: 'none' }, 0);
  tl.to(items, {
    color: function(i){ return PALETTE[i % PALETTE.length]; },
    stagger: STAG, ease: 'none'
  }, span * .34);

  return function(){
    tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill();
    gsap.set(items, { clearProps: 'opacity,color' });
  };
});
