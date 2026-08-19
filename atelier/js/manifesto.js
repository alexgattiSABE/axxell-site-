/* CAP 02 — il manifesto si scrive mentre scendi.
 *
 * Il testo a sinistra parte da niente e compare una parola alla volta, legato
 * allo scroll. È l'unico movimento di questo blocco: non si sposta, non si
 * ingrandisce, non cambia colore. Si scrive.
 *
 * ⚠️ C'È STATA UNA SECONDA ONDA, ED È STATA TOLTA. Faceva prendere a ogni
 * parola una delle quattro tinte dell'elica che le sta accanto — prima a
 * rotazione (`PALETTE[i % 4]`, che da lontano leggeva come coriandoli), poi a
 * blocchi contigui. Nessuna delle due versioni è sopravvissuta: accanto a
 * un'elica che È GIÀ una scala di quattro colori, un testo colorato le faceva
 * concorrenza invece di lasciarla parlare. Il bianco è la scelta, non un
 * ripiego — e chi volesse rimetterla trovi qui il motivo per cui non c'è.
 */
WC.register('manifesto', function(ctx){
  var el = document.getElementById('wcManifesto');
  if (!el) return;
  var items = WC.splitWords(el);

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
   * scriversi a circa due terzi, e l'ultimo terzo resta all'elica. Era '+=130%'
   * quando le onde erano due e la seconda finiva dopo la prima; con una sola,
   * quella corsa in più sarebbe scroll speso su un testo già tutto scritto.
   */
  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#cap02',
      start: 'top top',
      end: '+=100%',
      scrub: .6
    }
  });

  /* Lo sfalsamento è per parola, non per riga: è quello che fa leggere il
   * blocco come una cosa che si scrive invece che come un paragrafo che
   * sfuma. Le parole partono a opacità zero — prima non ci sono affatto — e
   * arrivano bianche, che è il colore in cui restano. */
  var STAG = .35;

  tl.fromTo(items, { opacity: 0, color: '#f0f0f6' },
                   { opacity: 1, stagger: STAG, ease: 'none' }, 0);

  return function(){
    tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill();
    gsap.set(items, { clearProps: 'opacity,color' });
  };
});
