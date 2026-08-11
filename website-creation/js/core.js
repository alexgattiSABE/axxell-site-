window.WC = (function(){
  'use strict';

  var registry = [];
  var api = {
    lenis: null,
    motionOk: true,
    desktop: true,
    loaded: false,   // messo a true dal loader (Task 3) a sipario aperto
    register: function(name, initFn){ registry.push({ name: name, init: initFn }); }
  };

  // ---- CURSORE ----
  function initCursor(){
    var cur = document.getElementById('cur'), curR = document.getElementById('curR');
    if (!cur || !curR) return;
    var mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener('mousemove', function(e){
      mx = e.clientX; my = e.clientY;
      cur.style.left = mx + 'px'; cur.style.top = my + 'px';
    });
    (function ring(){
      rx += (mx - rx) * .12; ry += (my - ry) * .12;
      curR.style.left = rx + 'px'; curR.style.top = ry + 'px';
      requestAnimationFrame(ring);
    })();
    document.addEventListener('mouseover', function(e){
      if (e.target.closest('a,button,.wc-hover')) {
        cur.style.width = '14px'; cur.style.height = '14px';
        curR.style.width = '44px'; curR.style.height = '44px';
        curR.style.borderColor = 'rgba(0,212,255,.7)';
      }
    });
    document.addEventListener('mouseout', function(e){
      if (e.target.closest('a,button,.wc-hover')) {
        cur.style.width = '8px'; cur.style.height = '8px';
        curR.style.width = '32px'; curR.style.height = '32px';
        curR.style.borderColor = 'rgba(0,212,255,.4)';
      }
    });
  }

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
    initCursor();

    var mm = gsap.matchMedia();
    mm.add({
      motionOk: '(prefers-reduced-motion: no-preference)',
      desktop:  '(min-width: 900px)'
    }, function(ctx){
      var c = { motionOk: !!ctx.conditions.motionOk, desktop: !!ctx.conditions.desktop };
      api.motionOk = c.motionOk;
      api.desktop  = c.desktop;

      if (c.motionOk) initLenis();

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
