(function(){
  'use strict';
  var cur = document.getElementById('cur'), curR = document.getElementById('curR');
  var mx = 0, my = 0, rx = 0, ry = 0;
  if (!cur || !curR) return;
  document.addEventListener('mousemove', function(e){
    mx = e.clientX; my = e.clientY;
    cur.style.left = mx + 'px'; cur.style.top = my + 'px';
  });
  (function ring(){
    rx += (mx - rx) * .12; ry += (my - ry) * .12;
    curR.style.left = rx + 'px'; curR.style.top = ry + 'px';
    requestAnimationFrame(ring);
  })();
})();
