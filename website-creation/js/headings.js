/* Titoli di sezione — entrano una riga alla volta.
 *
 * Prima di questo modulo gli h2 comparivano già scritti: dodici capitoli con
 * scene 3D allo scroll e la copy ferma in mezzo. Il taglio è per *riga* e non
 * per parola perché è la riga l'unità di lettura di un titolo — e perché dove
 * il browser mandi a capo lo sa solo il browser: cambia con la larghezza della
 * finestra, con il font quando finisce di caricare, con la lingua. È l'unico
 * taglio che a mano non si fa, ed è la ragione per cui qui serve SplitText e
 * altrove basta WC.splitWords.
 *
 * `autoSplit` ritaglia a ogni ricalcolo di riga; `onSplit` ricrea l'animazione
 * sulle righe nuove, che sono nodi diversi dai precedenti.
 *
 * ESCLUSI, di proposito:
 *   - cap. 01: la copy dell'hero non entra, *vola* nel tunnel (tunnel.js), e
 *     scrive lei transform e opacity a ogni frame.
 *   - .wc-warp-copy: le tre copy del cap. 02 hanno l'opacità guidata dal morph
 *     delle particelle (warp.js). Due sistemi sullo stesso nodo si
 *     sovrascrivono a vicenda e vince l'ultimo che ha scritto.
 */
WC.register('headings', function(ctx){
  // Senza il plugin il sito resta come prima: i titoli si leggono comunque.
  if (typeof SplitText === 'undefined') return;

  var heads = Array.prototype.slice.call(document.querySelectorAll('section h2'))
    .filter(function(h){
      return !h.closest('#cap01') && !h.closest('.wc-warp-copy');
    });
  if (!heads.length) return;

  // Reduced-motion: nessuno split. Il titolo non va toccato affatto — spezzarlo
  // e rimetterlo a posto lascia comunque wrapper in mezzo al testo, che i
  // lettori di schermo attraversano.
  if (!ctx.motionOk) return;

  var splits = [];

  // Il titolo del disco volante non entra: si DECODIFICA. La sezione è l'unica
  // notturna della pagina, il modello è un oggetto che sorvola un prato al
  // buio, e il titolo parla di numeri ("Quarantamila fili d'erba, una sola
  // chiamata di disegno") — un testo che si risolve da caratteri casuali gli
  // sta addosso meglio di una riga che sale.
  //
  // Lo scramble gira comunque sulle righe di SplitText, non sull'h2 intero: il
  // titolo porta un <br> voluto, e ScrambleText che riscrive il nodo se lo
  // mangerebbe. Riga per riga il ritorno a capo resta dov'è.
  var SCRAMBLE_IN = '#capSaucer';

  function scramble(lines, h, onEnter){
    return gsap.to(lines, {
      duration: 1.3,
      // "{original}" = il testo che la riga ha già: non va ripetuto qui, e
      // continua a funzionare se la copy cambia.
      scrambleText: { text: '{original}', chars: 'upperAndLowerCase', speed: 0.5, revealDelay: 0.15 },
      ease: 'none',
      stagger: 0.22,
      scrollTrigger: { trigger: h, start: 'top 85%', once: true, onEnter: onEnter }
    });
  }

  heads.forEach(function(h){
    // Una volta che il titolo è entrato resta entrato: al ritaglio successivo
    // (resize, font caricato) le righe nuove vanno messe a posto, non rianimate.
    var shown = false;
    var scrambles = typeof ScrambleTextPlugin !== 'undefined' && !!h.closest(SCRAMBLE_IN);

    var split = new SplitText(h, {
      type: 'lines',
      mask: 'lines',          // wrapper con overflow:clip — la riga sale da dietro
      // Senza trattino di proposito: SplitText costruisce il nome della classe
      // della maschera con `className.replace(/(\b\w+\b)/g, '$1-mask')`, e il
      // trattino spezza la parola — da "wc-line" esce "wc-mask-line-mask".
      // Da "wcline" esce "wcline-mask", che è il nome usato nel CSS.
      linesClass: 'wcline',
      autoSplit: true,
      onSplit: function(self){
        if (shown) {
          // Al ritaglio successivo il titolo è già stato letto: rimetterlo a
          // posto, non rifarlo. Per lo scramble non c'è niente da rimettere —
          // il testo è già quello giusto — quindi basta annullare lo scorrimento.
          gsap.set(self.lines, { yPercent: 0 });
          return;
        }
        if (scrambles) return scramble(self.lines, h, function(){ shown = true; });
        return gsap.from(self.lines, {
          yPercent: 110,
          duration: 0.9,
          ease: WC.ease,
          stagger: 0.085,
          scrollTrigger: {
            trigger: h,
            start: 'top 85%',
            once: true,
            onEnter: function(){ shown = true; }
          }
        });
      }
    });
    splits.push(split);

    // L'occhiello sopra il titolo entra con lui, appena prima: da solo si
    // legge come un'etichetta staccata, insieme fa gruppo.
    var eyebrow = h.previousElementSibling;
    if (eyebrow && eyebrow.classList.contains('eyebrow')) {
      var tw = gsap.from(eyebrow, {
        opacity: 0,
        y: 12,
        duration: 0.6,
        ease: WC.ease,
        scrollTrigger: { trigger: h, start: 'top 85%', once: true }
      });
      splits.push({ revert: function(){
        tw.scrollTrigger && tw.scrollTrigger.kill();
        tw.kill();
        gsap.set(eyebrow, { clearProps: 'opacity,transform' });
      } });
    }
  });

  return function(){
    // revert() rimette il testo originale e uccide il tween creato in onSplit.
    splits.forEach(function(s){ s.revert(); });
    splits.length = 0;
  };
});
