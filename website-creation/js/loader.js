WC.register('loader', function(ctx){
  var root  = document.getElementById('wcLoader');
  var count = document.getElementById('wcLoaderCount');
  var box   = document.getElementById('wcLoaderLottie');
  if (!root) return;

  function finish(){
    root.classList.add('done');
    root.style.display = 'none';
    document.body.classList.remove('wc-locked');
    if (WC.lenis) WC.lenis.start();
    if (WC.setCursor) WC.setCursor('default');
    WC.loaded = true;                                   // per chi si registra dopo
    document.dispatchEvent(new CustomEvent('wc:loaded'));
  }

  // Reduced-motion: nessun teatro, la pagina è subito lì.
  if (!ctx.motionOk) { finish(); return; }

  document.body.classList.add('wc-locked');
  if (WC.setCursor) WC.setCursor('hidden');
  // Lenis va fermato: overflow:hidden sul body non lo blocca, continuerebbe
  // a scorrere dietro al sipario.
  if (WC.lenis) WC.lenis.stop();

  var anim = lottie.loadAnimation({
    container: box, renderer: 'svg', loop: false, autoplay: true,
    path: 'assets/logo-reveal.json'
  });

  var counter = { v: 0 };
  var tl = gsap.timeline({ onComplete: finish });

  tl.to(counter, {
    v: 100, duration: 1.6, ease: 'power2.inOut',
    onUpdate: function(){
      count.textContent = String(Math.round(counter.v)).padStart(2, '0');
    }
  })
  .to('.wc-loader-inner', { opacity: 0, duration: .35, ease: 'power2.in' }, '+=0.15')
  .to('.wc-curtain-t', { yPercent: -100, duration: .9, ease: 'expo.inOut' }, '<')
  .to('.wc-curtain-b', { yPercent:  100, duration: .9, ease: 'expo.inOut' }, '<');

  return function(){
    tl.kill(); anim.destroy();
    document.body.classList.remove('wc-locked');
    if (WC.lenis) WC.lenis.start();
  };
});
