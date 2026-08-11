WC.register('carousel', function(ctx){
  var wrap  = document.querySelector('.wc-track-wrap');
  var track = document.getElementById('wcTrack');
  if (!wrap || !track) return;

  // Il loop infinito richiede il contenuto duplicato: si scorre di una
  // larghezza intera e si riavvolge, quindi serve un secondo giro visibile.
  var original = track.innerHTML;
  track.innerHTML = original + original;

  var half = 0;
  function measure(){ half = track.scrollWidth / 2; }
  measure();
  window.addEventListener('resize', measure);

  var x = 0, auto = ctx.motionOk ? -0.55 : 0, vel = 0;
  var dragging = false, lastX = 0, raf;

  function render(){
    x += auto + vel;
    vel *= .92;                       // inerzia: decade dolcemente
    if (half > 0) {
      if (x <= -half) x += half;      // riavvolgimento in entrambe le direzioni
      if (x > 0)      x -= half;
    }
    track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    raf = requestAnimationFrame(render);
  }
  render();

  function onDown(e){
    dragging = true; wrap.classList.add('dragging');
    lastX = (e.touches ? e.touches[0].clientX : e.clientX);
    vel = 0;
  }
  function onMove(e){
    if (!dragging) return;
    var cx = (e.touches ? e.touches[0].clientX : e.clientX);
    var dx = cx - lastX; lastX = cx;
    x += dx; vel = dx * .35;
  }
  function onUp(){ dragging = false; wrap.classList.remove('dragging'); }

  wrap.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  wrap.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onUp);

  // La velocità dello scroll verticale spinge il nastro: lo scroll
  // "trascina" il carosello, che è l'effetto da dimostrare.
  var st = null;
  if (ctx.motionOk) {
    st = ScrollTrigger.create({
      trigger: '#cap04', start: 'top bottom', end: 'bottom top',
      onUpdate: function(self){
        vel += gsap.utils.clamp(-12, 12, self.getVelocity() * -0.0016);
      }
    });
  }

  return function(){
    cancelAnimationFrame(raf);
    st && st.kill();
    window.removeEventListener('resize', measure);
    wrap.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    wrap.removeEventListener('touchstart', onDown);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    track.innerHTML = original;
  };
});
