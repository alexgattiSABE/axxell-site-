/* LA BARRA CHE SI RITIRA.
 *
 * Scendendo la nav se ne va, risalendo torna. È il comportamento standard, e
 * qui vale doppio: questa pagina è fatta di capitoli a tutta schermata — scene
 * WebGL, un video a schermo pieno, un modello 3D — e una barra opaca alta 72 px
 * fissa in cima taglia il bordo alto di ognuno di loro per tutta la pagina.
 *
 * ── PERCHÉ LA DIREZIONE ARRIVA DA SCROLLTRIGGER ────────────────────────────
 * Non si confronta `scrollY` col valore del frame prima: la pagina scorre con
 * Lenis, cioè con un momentum sintetico che oscilla di un pixel avanti e
 * indietro mentre si assesta, e un confronto grezzo farebbe lampeggiare la
 * barra a ogni fermata. `self.direction` di ScrollTrigger cambia solo quando
 * il verso cambia davvero, ed è già sincronizzato con Lenis (vedi core.js:
 * `lenis.on('scroll', ScrollTrigger.update)`).
 *
 * ── LE TRE ECCEZIONI ───────────────────────────────────────────────────────
 * 1. In cima la barra c'è sempre: sotto una schermata di scroll non ci si è
 *    ancora allontanati da niente, e nasconderla sarebbe solo un guizzo.
 * 2. Se qualcosa dentro la nav prende il focus da tastiera, la barra torna:
 *    un anello di focus su un elemento traslato fuori schermo è una trappola.
 * 3. Con reduced-motion la barra non si muove affatto (la transizione è spenta
 *    in CSS e qui non si aggiunge la classe): una barra che scatta via è
 *    esattamente il tipo di movimento che quell'impostazione chiede di non
 *    avere, e non è essenziale a niente.
 */
WC.register('nav', function(ctx){
  var nav = document.querySelector('nav');
  if (!nav) return;

  if (!ctx.motionOk) return;

  // Sotto questa quota la barra resta sempre visibile. Una schermata: è la
  // distanza oltre la quale "sto scendendo" è un'intenzione e non un rimbalzo.
  var FLOOR = function(){ return window.innerHeight; };
  var hidden = false;

  function set(h){
    if (h === hidden) return;
    hidden = h;
    nav.classList.toggle('-away', h);
  }

  var st = ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: function(self){
      if (self.scroll() < FLOOR()) { set(false); return; }
      set(self.direction === 1);
    }
  });

  var onFocus = function(){ set(false); };
  nav.addEventListener('focusin', onFocus);

  return function(){
    st.kill();
    nav.removeEventListener('focusin', onFocus);
    nav.classList.remove('-away');
  };
});
