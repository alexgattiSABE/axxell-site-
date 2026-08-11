// Split a mano: SplitText è un plugin a pagamento e non si usa.
WC.splitWords = function(el){
  var words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map(function(w){
    return '<span class="w"><span class="wi">' + w + '</span></span>';
  }).join(' ');
  return el.querySelectorAll('.wi');
};

WC.register('hero', function(ctx){
  var canvas = document.getElementById('wcWarp');
  var title  = document.querySelector('.wc-hero-title');
  var cta    = document.getElementById('wcHeroCta');
  if (!title) return;

  var items = WC.splitWords(title);

  // --- ingresso del titolo ---
  gsap.set(items, { yPercent: 110 });
  function enter(){
    if (!ctx.motionOk) { gsap.set(items, { yPercent: 0 }); return; }
    gsap.to(items, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: .05 });
    gsap.fromTo('.wc-hero-content .lead, .wc-magnet',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: .8, ease: 'power2.out', stagger: .1, delay: .35 });
    gsap.fromTo('.wc-scroll-cue span', { yPercent: -100 },
      { yPercent: 250, duration: 1.8, ease: 'power1.inOut', repeat: -1 });
  }
  // Il loader può aver già finito prima che questo script si registri —
  // succede sempre con reduced-motion, dove finish() è sincrono. Senza questo
  // controllo il titolo resterebbe a yPercent:110, cioè invisibile.
  if (WC.loaded) enter();
  else document.addEventListener('wc:loaded', enter, { once: true });

  var cleanups = [];

  // --- CTA magnetica ---
  if (ctx.motionOk && ctx.desktop && cta) {
    var onMove = function(e){
      var r = cta.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      var dist = Math.hypot(dx, dy);
      var pull = dist < 140 ? 1 - dist / 140 : 0;
      gsap.to(cta, { x: dx * .35 * pull, y: dy * .35 * pull,
                     duration: .5, ease: 'power3.out' });
    };
    window.addEventListener('mousemove', onMove);
    cleanups.push(function(){ window.removeEventListener('mousemove', onMove); });
  }

  // --- WARP: campo di stelle proiettato, niente librerie ---
  if (ctx.motionOk && canvas) {
    var g = canvas.getContext('2d');
    var stars = [], N = ctx.desktop ? 520 : 200;
    var w, h, cx, cy, mouseX = 0, mouseY = 0, raf;

    function resize(){
      w = canvas.width  = canvas.offsetWidth  * Math.min(devicePixelRatio, 2);
      h = canvas.height = canvas.offsetHeight * Math.min(devicePixelRatio, 2);
      cx = w / 2; cy = h / 2;
    }
    function seed(){
      stars.length = 0;
      for (var i = 0; i < N; i++) {
        stars.push({ x: (Math.random() - .5) * w, y: (Math.random() - .5) * h,
                     z: Math.random() * w, pz: 0 });
      }
    }
    function frame(){
      g.fillStyle = 'rgba(6,6,9,.35)';
      g.fillRect(0, 0, w, h);
      var ox = mouseX * 70, oy = mouseY * 70;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.pz = s.z; s.z -= 5.5;
        if (s.z < 1) { s.z = w; s.x = (Math.random() - .5) * w;
                       s.y = (Math.random() - .5) * h; s.pz = s.z; }
        var sx = (s.x / s.z) * w * .5 + cx + ox;
        var sy = (s.y / s.z) * w * .5 + cy + oy;
        var px = (s.x / s.pz) * w * .5 + cx + ox;
        var py = (s.y / s.pz) * w * .5 + cy + oy;
        var a  = Math.min(1, (1 - s.z / w) * 1.4);
        g.strokeStyle = 'rgba(0,212,255,' + (a * .55).toFixed(3) + ')';
        g.lineWidth = a * 1.6;
        g.beginPath(); g.moveTo(px, py); g.lineTo(sx, sy); g.stroke();
      }
      raf = requestAnimationFrame(frame);
    }
    var onResize = function(){ resize(); seed(); };
    var onMouse  = function(e){
      mouseX = (e.clientX / innerWidth)  - .5;
      mouseY = (e.clientY / innerHeight) - .5;
    };
    resize(); seed(); frame();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouse);
    cleanups.push(function(){
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouse);
    });
  }

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
