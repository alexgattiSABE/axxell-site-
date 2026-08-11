WC.register('manifesto', function(ctx){
  var el = document.getElementById('wcManifesto');
  if (!el) return;
  var items = WC.splitWords(el);

  // Reduced-motion: testo pieno, nessuno scrub.
  if (!ctx.motionOk) {
    gsap.set(items, { color: '#f0f0f6' });
    return;
  }

  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: el,
      start: 'top 75%',
      end: 'bottom 55%',
      scrub: .6
    }
  });
  tl.to(items, { color: '#f0f0f6', stagger: .35, ease: 'none' });

  return function(){ tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); };
});
