WC.register('cursor', function(ctx){
  var dot   = document.getElementById('cur');
  var ring  = document.getElementById('curR');
  var label = document.getElementById('curLabel');
  var trail = Array.prototype.slice.call(document.querySelectorAll('.cursor-trail'));
  if (!dot || !ring) return;

  var mx = 0, my = 0, rx = 0, ry = 0;
  var tp = trail.map(function(){ return { x: 0, y: 0 }; });

  var onMove = function(e){
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px'; dot.style.top = my + 'px';
  };
  document.addEventListener('mousemove', onMove);

  var raf;
  (function loop(){
    rx += (mx - rx) * .12; ry += (my - ry) * .12;
    ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
    // ogni elemento della scia insegue il precedente più lentamente
    for (var i = 0; i < trail.length; i++) {
      var prev = i === 0 ? { x: rx, y: ry } : tp[i - 1];
      var k = .16 - i * .035;
      tp[i].x += (prev.x - tp[i].x) * k;
      tp[i].y += (prev.y - tp[i].y) * k;
      trail[i].style.left = tp[i].x + 'px';
      trail[i].style.top  = tp[i].y + 'px';
    }
    raf = requestAnimationFrame(loop);
  })();

  // --- macchina a stati ---
  // 'dot' non ha regole CSS proprie: è il cursore base, punto e anello, senza
  // scia e senza etichetta. Deve però stare in questa lista lo stesso, perché
  // è da qui che le classi vengono RIMOSSE quando si cambia sezione: uno stato
  // fuori lista resterebbe appiccicato al body e si sommerebbe al successivo.
  var STATES = ['hidden','default','dot','read','orbit','grab','cross','invert','arrow','caret','light'];
  var current = '';

  function setState(name, text){
    if (!name || name === current) return;
    STATES.forEach(function(s){ document.body.classList.remove('cur-' + s); });
    document.body.classList.add('cur-' + name);
    label.textContent = text || '';
    current = name;
  }
  WC.setCursor = setState;   // il loader (Task 3) lo usa per 'hidden'

  setState('default');

  // Ogni sezione dichiara il proprio stato: il cursore non sa nulla dei capitoli.
  var triggers = [];
  document.querySelectorAll('[data-cursor]').forEach(function(sec){
    triggers.push(ScrollTrigger.create({
      trigger: sec, start: 'top 50%', end: 'bottom 50%',
      onEnter:     function(){ setState(sec.dataset.cursor, sec.dataset.cursorLabel); },
      onEnterBack: function(){ setState(sec.dataset.cursor, sec.dataset.cursorLabel); }
    }));
  });

  return function(){
    cancelAnimationFrame(raf);
    document.removeEventListener('mousemove', onMove);
    triggers.forEach(function(t){ t.kill(); });
    STATES.forEach(function(s){ document.body.classList.remove('cur-' + s); });
  };
});
