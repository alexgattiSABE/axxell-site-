window.WC = (function(){
  'use strict';

  var registry = [];
  var api = {
    lenis: null,
    motionOk: true,
    desktop: true,
    ease: 'expo.out',  // sostituita dalla curva del sito in boot(), se CustomEase c'è
    loaded: false,   // messo a true dal loader (Task 3) a sipario aperto
    register: function(name, initFn){ registry.push({ name: name, init: initFn }); },

    // Split a mano per parole. Da GSAP 3.13 SplitText è pubblico e il sito lo
    // carica (lo usa js/headings.js per le righe dei titoli), ma questa resta:
    // produce la coppia .w/.wi su cui è costruita la coreografia dell'hero
    // (tunnel.js fa volare .w e riserva .wi all'entrata dal loader), e il
    // manifesto colora i .wi allo scrub. Riscriverla con SplitText cambierebbe
    // quei nodi senza aggiungere nulla: qui serve il taglio a parole, non a righe.
    //
    // Passa attraverso i nodi figli invece di leggere textContent: diversi
    // titoli portano un <br> voluto, e riscrivere l'innerHTML dal solo testo
    // lo cancellerebbe insieme al ritorno a capo.
    splitWords: function(el){
      var out = document.createDocumentFragment();
      Array.prototype.slice.call(el.childNodes).forEach(function(node){
        if (node.nodeType !== 3) { out.appendChild(node.cloneNode(true)); return; }
        node.textContent.split(/(\s+)/).forEach(function(chunk){
          if (!chunk) return;
          if (/^\s+$/.test(chunk)) { out.appendChild(document.createTextNode(' ')); return; }
          var outer = document.createElement('span');
          outer.className = 'w';
          var inner = document.createElement('span');
          inner.className = 'wi';
          inner.textContent = chunk;
          outer.appendChild(inner);
          out.appendChild(outer);
        });
      });
      el.textContent = '';
      el.appendChild(out);
      return el.querySelectorAll('.wi');
    }
  };

  // ---- SMOOTH SCROLL ----
  // Lenis si avvia solo se il motion è consentito. Con reduced-motion
  // resta lo scroll nativo del browser.
  var lenisTick = null;

  function initLenis(){
    api.lenis = new Lenis({
      duration: 1.1,
      easing: function(t){ return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }
    });
    api.lenis.on('scroll', ScrollTrigger.update);
    // Il riferimento alla callback va tenuto. Senza, il cleanup non ha modo
    // di staccarla dal ticker: chi attiva "riduci animazioni" a pagina aperta
    // vedrebbe Lenis distrutto e api.lenis a null, ma la callback continuerebbe
    // a girare e a chiamare raf() su null a ogni frame.
    lenisTick = function(time){ api.lenis.raf(time * 1000); };
    gsap.ticker.add(lenisTick);
    gsap.ticker.lagSmoothing(0);
  }

  function destroyLenis(){
    if (lenisTick) { gsap.ticker.remove(lenisTick); lenisTick = null; }
    if (api.lenis) { api.lenis.destroy(); api.lenis = null; }
  }

  function boot(){
    gsap.registerPlugin(ScrollTrigger);

    // SplitText e CustomEase sono opzionali: se il CDN non risponde il sito
    // resta in piedi, solo senza il reveal dei titoli.
    if (typeof SplitText !== 'undefined') gsap.registerPlugin(SplitText);
    if (typeof Flip !== 'undefined') gsap.registerPlugin(Flip);
    if (typeof CustomEase !== 'undefined') {
      gsap.registerPlugin(CustomEase);
      // Curve del sito, non preset. `wcOut` parte più decisa e frena più a
      // lungo di expo.out: il movimento è già finito quando l'occhio arriva,
      // e quello che resta è solo l'assestamento.
      CustomEase.create('wcOut', 'M0,0 C0.12,0.86 0.16,1 1,1');
      // Simmetrica, per andate e ritorni: accelera e frena con la stessa
      // curva, così un elemento che va e torna non sembra due animazioni.
      CustomEase.create('wcInOut', 'M0,0 C0.76,0 0.24,1 1,1');
    }
    api.ease = typeof CustomEase !== 'undefined' ? 'wcOut' : 'expo.out';

    var mm = gsap.matchMedia();
    mm.add({
      motionOk: '(prefers-reduced-motion: no-preference)',
      desktop:  '(min-width: 900px)'
    }, function(ctx){
      var c = { motionOk: !!ctx.conditions.motionOk, desktop: !!ctx.conditions.desktop };
      api.motionOk = c.motionOk;
      api.desktop  = c.desktop;

      // Lenis solo su desktop: su mobile lo scroll inerziale di sistema è già
      // buono e il momentum sintetico lo peggiora (atelier D2).
      if (c.motionOk && c.desktop) initLenis();

      var cleanups = [];
      registry.forEach(function(entry){
        try {
          var teardown = entry.init(c);
          if (typeof teardown === 'function') cleanups.push(teardown);
        } catch (err) {
          console.error('[WC] init fallita per sezione "' + entry.name + '"', err);
        }
      });

      return function(){
        // Il teardown è protetto come gli init: il cleanup di una sezione che
        // lancia non deve impedire quelli successivi né la distruzione di Lenis.
        cleanups.forEach(function(fn){
          try { fn(); } catch (err) { console.error('[WC] cleanup fallito', err); }
        });
        destroyLenis();
      };
    });
  }

  // Le sezioni si registrano con script caricati dopo core.js.
  // L'avvio va rimandato a dopo il parsing di tutti gli script.
  document.addEventListener('DOMContentLoaded', boot);

  return api;
})();
