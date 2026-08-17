/* EFFETTI DI CURSORE PER CAPITOLO.
 *
 * Portati da CursorX (github.com/Felix-au/CursorX-Interactive-Cursor-Effects),
 * che è React + hook: qui diventano cinque funzioni vanilla che si montano su
 * un elemento e restituiscono il proprio smontaggio. La matematica è la loro,
 * riga per riga; cambia l'impianto attorno.
 *
 * ── COME SI ASSEGNANO ──────────────────────────────────────────────────────
 * Questo modulo NON sa niente dei capitoli, esattamente come js/cursor.js: è
 * la sezione a dichiarare cosa vuole, con un attributo sul suo elemento
 * ospite (il pin, dove c'è, se no la sezione stessa):
 *
 *     data-cursor-fx="dna"           → l'elica che segue il puntatore
 *     data-cursor-fx="torch"         → la torcia: buio, e un cono di luce
 *     data-cursor-fx="fire"          → la scia di fiamme
 *     data-cursor-fx="constellation" → stelle che si legano al puntatore
 *     data-cursor-fx="mirror"        → quattro fantasmi specchiati
 *     data-magnetic                  → questo elemento viene attratto
 *
 * ── PERCHÉ SOLO A SEZIONE IN QUADRO ────────────────────────────────────────
 * Ogni effetto è un canvas e un rAF suo. Sopra ci sono già le scene WebGL dei
 * capitoli, che di budget ne lasciano poco: il loop parte quando la sezione
 * entra e si ferma quando esce, quindi ne gira sempre e solo uno. Fuori dal
 * desktop e con reduced-motion non parte nulla.
 *
 * ── DIFFERENZE DAL SORGENTE, e perché ──────────────────────────────────────
 * 1. RISOLUZIONE DEL DISPOSITIVO. Il sorgente disegna a 1×: su uno schermo
 *    HiDPI le linee da 1-2 px dell'elica, della costellazione e degli anelli
 *    escono sfocate. Qui il canvas è scalato per il devicePixelRatio.
 * 2. NIENTE `elementsFromPoint` A OGNI FRAME. Il sorgente lo chiama nel loop
 *    per sapere se il puntatore è sopra un elemento interattivo: è una query
 *    di hit testing sessanta volte al secondo su tutto il documento. Qui lo
 *    stato "sopra un link" arriva da `mouseover`, che il browser manda da sé.
 * 3. I RETTANGOLI SI TENGONO IN CACHE. Il magnetico del sorgente chiama
 *    `getBoundingClientRect()` per ogni parola a ogni frame — con cinquanta
 *    parole sono cinquanta ricalcoli di layout per fotogramma. Qui si misurano
 *    una volta e si rimisurano quando la pagina cambia forma.
 * 4. NIENTE `click`. Le animazioni di clic del sorgente restano fuori: su
 *    queste sezioni il clic non è previsto (nessuna è cliccabile) e il gesto
 *    che conta è il passaggio.
 */
WC.register('cursorfx', function(ctx){
  var hosts = Array.prototype.slice.call(
    document.querySelectorAll('[data-cursor-fx], [data-magnetic-sel]'));
  if (!hosts.length) return;

  // Il puntatore fine è il presupposto di tutto: su un touch non c'è niente da
  // seguire, e questi effetti sarebbero solo GPU sprecata.
  var coarse = matchMedia('(pointer:coarse)').matches;
  if (!ctx.motionOk || !ctx.desktop || coarse) return;

  var cleanups = [];

  /* ---------------------------------------------------------------- utilità */

  // Un canvas che copre l'ospite, scalato per il devicePixelRatio. `ctx2d` è
  // già in coordinate CSS: chi disegna non deve sapere niente del ratio.
  function makeCanvas(host, z){
    var c = document.createElement('canvas');
    c.className = 'wc-fx';
    c.style.zIndex = z;
    host.appendChild(c);
    var g = c.getContext('2d');
    var size = { w: 1, h: 1, dpr: 1 };

    function resize(){
      var w = Math.max(1, host.offsetWidth), h = Math.max(1, host.offsetHeight);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (size.w === w && size.h === h && size.dpr === dpr) return;
      size.w = w; size.h = h; size.dpr = dpr;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    return { el: c, g: g, size: size, resize: resize,
             destroy: function(){ c.remove(); } };
  }

  /* Il puntatore relativo all'ospite.
   * Le coordinate si prendono dal rettangolo dell'ospite a ogni movimento e non
   * una volta sola: metà di queste sezioni sono pinnate, quindi la loro origine
   * cambia sotto i piedi mentre si scorre. */
  function makePointer(host){
    var p = { x: -9999, y: -9999, inside: false, over: false };
    function onMove(e){
      var r = host.getBoundingClientRect();
      p.x = e.clientX - r.left; p.y = e.clientY - r.top;
      p.inside = true;
    }
    function onLeave(){ p.inside = false; p.x = -9999; p.y = -9999; }
    // Lo stato "sopra qualcosa di interattivo" lo dice il browser con
    // mouseover/mouseout: il sorgente lo ricavava con `elementsFromPoint` a
    // ogni frame, che è hit testing su tutto il documento sessanta volte al
    // secondo per una domanda a cui gli eventi rispondono gratis.
    function isInteractive(el){
      return !!(el && el.closest && el.closest('a, button, input, label, [role="button"]'));
    }
    function onOver(e){ p.over = isInteractive(e.target); }
    host.addEventListener('mousemove', onMove, { passive: true });
    host.addEventListener('mouseleave', onLeave, { passive: true });
    host.addEventListener('mouseover', onOver, { passive: true });
    return { p: p, destroy: function(){
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mouseleave', onLeave);
      host.removeEventListener('mouseover', onOver);
    } };
  }

  /* ---------------------------------------------------------------- effetti */

  var FX = {};

  /* DNA — due filamenti che si avvolgono attorno alla scia del puntatore.
   * La scia è una coda di ottanta posizioni; per ognuna si prende la NORMALE
   * al percorso e ci si oscilla sopra con una sinusoide sfasata di mezzo giro
   * fra i due filamenti. L'ampiezza cresce con l'età del punto (`t`), quindi
   * l'elica si apre allontanandosi dalla punta invece di essere un tubo. */
  FX.dna = function(host){
    var cv = makeCanvas(host, 40), ptr = makePointer(host);
    var HIST = 80, path = [], phase = 0;
    var COL1 = '#7c5cfc', COL2 = '#5cf4fc', AMP = 16, SPEED = 0.09;
    var tipScale = 1;

    function frame(){
      var g = cv.g, w = cv.size.w, h = cv.size.h;
      g.clearRect(0, 0, w, h);
      phase += SPEED;
      path.push({ x: ptr.p.x, y: ptr.p.y });
      if (path.length > HIST) path.shift();

      tipScale += ((ptr.p.over ? 3.2 : 1) - tipScale) * 0.15;

      if (ptr.p.inside) {
        g.save();
        g.beginPath();
        g.arc(ptr.p.x, ptr.p.y, Math.max(1, 4 * tipScale), 0, Math.PI * 2);
        g.fillStyle = '#fff';
        g.globalAlpha = ptr.p.over ? 0.45 : 1;
        g.fill();
        g.restore();
      }
      if (path.length < 4) return;

      for (var strand = 0; strand < 2; strand++) {
        var phOff = strand * Math.PI, started = false;
        g.beginPath();
        for (var i = 0; i < path.length; i++) {
          var p = path[i], t = i / path.length;
          var amp = AMP * t;
          var wp = phase * 0.65 + i * 0.2 + phOff;
          var next = path[Math.min(i + 1, path.length - 1)], prev = path[Math.max(i - 1, 0)];
          var dx = next.x - prev.x, dy = next.y - prev.y;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          var nx = -dy / len, ny = dx / len;
          var wx = p.x + nx * Math.sin(wp) * amp, wy = p.y + ny * Math.sin(wp) * amp;
          if (!started) { g.moveTo(wx, wy); started = true; } else g.lineTo(wx, wy);
        }
        g.strokeStyle = strand === 0 ? COL1 : COL2;
        g.lineWidth = 2; g.lineCap = 'round';
        g.shadowColor = g.strokeStyle; g.shadowBlur = 6;
        g.stroke();
      }

      // I pioli, uno ogni dieci punti: sono loro a far leggere i due filamenti
      // come una sola elica invece che come due scie parallele.
      for (var k = 0; k < path.length; k += 10) {
        var tt = k / path.length, a2 = AMP * tt;
        var wp2 = phase * 0.65 + k * 0.2;
        var n2 = path[Math.min(k + 1, path.length - 1)], p2 = path[Math.max(k - 1, 0)];
        var ddx = n2.x - p2.x, ddy = n2.y - p2.y;
        var l2 = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        var mx2 = -ddy / l2, my2 = ddx / l2;
        g.beginPath();
        g.moveTo(path[k].x + mx2 * Math.sin(wp2) * a2, path[k].y + my2 * Math.sin(wp2) * a2);
        g.lineTo(path[k].x + mx2 * Math.sin(wp2 + Math.PI) * a2, path[k].y + my2 * Math.sin(wp2 + Math.PI) * a2);
        g.strokeStyle = 'rgba(200,200,255,.22)'; g.lineWidth = 1; g.shadowBlur = 0;
        g.stroke();
      }
    }
    return { frame: frame, resize: cv.resize,
             destroy: function(){ ptr.destroy(); cv.destroy(); } };
  };

  /* TORCIA — la sezione va al buio e resta un alone attorno al puntatore.
   * Non è un canvas: è un gradiente radiale su un velo, che il browser compone
   * da solo. Il raggio sfarfalla su due sinusoidi di frequenza diversa, che è
   * il trucco che lo fa sembrare una fiamma e non un cerchio che respira. */
  FX.torch = function(host){
    var veil = document.createElement('div');
    veil.className = 'wc-fx wc-fx-torch';
    var flame = document.createElement('div');
    flame.className = 'wc-fx-flame';
    host.appendChild(veil); host.appendChild(flame);

    var ptr = makePointer(host);
    var cx = host.offsetWidth / 2, cy = host.offsetHeight / 2, flick = 0;
    var RADIUS = 140, DARK = 0.91, FLICKER = 9;

    function frame(){
      var t = ptr.p.inside ? ptr.p : { x: cx, y: cy, over: false };
      cx += (t.x - cx) * 0.11; cy += (t.y - cy) * 0.11;
      flame.style.opacity = ptr.p.inside ? '1' : '0';
      flame.style.left = ptr.p.x + 'px'; flame.style.top = ptr.p.y + 'px';

      var over = ptr.p.over;
      var intensity = FLICKER * (over ? 2.5 : 1);
      flick += over ? 0.28 : 0.09;
      var wobble = Math.sin(flick) * intensity + Math.sin(flick * 2.4) * intensity * 0.44;
      var r = RADIUS + wobble;

      veil.style.background =
        'radial-gradient(circle ' + r.toFixed(1) + 'px at ' + cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px,' +
        'rgba(255,120,18,' + (over ? 0.14 : 0.09) + ') 0%,rgba(255,80,0,.04) 38%,' +
        'rgba(0,0,0,' + DARK + ') 72%,rgba(0,0,0,' + Math.min(DARK + 0.06, 1) + ') 100%)';
      flame.style.transform = 'translate(-50%,-50%) scale(' + (over ? 1.6 : 1) + ')';
    }
    return { frame: frame, resize: function(){},
             destroy: function(){ ptr.destroy(); veil.remove(); flame.remove(); } };
  };

  /* FIAMME — particelle che salgono dal puntatore.
   * La tinta esce dalla VITA della particella, non dal tempo: nasce gialla
   * (hue 42), vira all'arancio e muore grigia. È quello che la fa leggere come
   * brace che si spegne invece che come coriandoli colorati. */
  FX.fire = function(host){
    var cv = makeCanvas(host, 40), ptr = makePointer(host);
    var parts = [], PER_FRAME = 5, RISE = 2, SIZE = 4, MAX = 420;

    function spawn(x, y){
      return { x: x + (Math.random() - 0.5) * 8, y: y,
               vx: (Math.random() - 0.5) * 1.8,
               vy: -(Math.random() * RISE + 1.2),
               life: 1, decay: Math.random() * 0.028 + 0.016,
               size: Math.random() * SIZE + 4 };
    }

    function frame(){
      var g = cv.g;
      g.clearRect(0, 0, cv.size.w, cv.size.h);
      if (ptr.p.inside) for (var i = 0; i < PER_FRAME; i++) parts.push(spawn(ptr.p.x, ptr.p.y));
      // Tetto al numero di particelle: senza, una finestra lasciata aperta su
      // questa sezione le accumula finché il frame non cede.
      if (parts.length > MAX) parts.splice(0, parts.length - MAX);

      var alive = [];
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        p.x += p.vx; p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.35;
        p.life -= p.decay; p.size *= 0.968;
        if (p.life <= 0) continue;
        alive.push(p);

        var hue = p.life > 0.55 ? 42 + (1 - p.life) * 22 : p.life > 0.2 ? 12 : 0;
        var sat = p.life > 0.2 ? 100 : Math.max(0, (p.life / 0.2) * 40);
        var lit = p.life > 0.2 ? 52 + p.life * 18 : 35;
        g.save();
        g.globalAlpha = Math.max(0, p.life * 0.92) * (ptr.p.over ? 0.35 : 1);
        g.fillStyle = 'hsl(' + hue + ',' + sat + '%,' + lit + '%)';
        g.shadowColor = 'hsl(' + hue + ',100%,55%)'; g.shadowBlur = 14;
        g.beginPath();
        g.arc(p.x, p.y, Math.max(0.1, p.size) * (ptr.p.over ? 1.5 : 1), 0, Math.PI * 2);
        g.fill(); g.restore();
      }
      parts = alive;
    }
    return { frame: frame, resize: cv.resize,
             destroy: function(){ ptr.destroy(); cv.destroy(); } };
  };

  /* COSTELLAZIONE — stelle alla deriva che si legano fra loro e al puntatore.
   * Il legame stella-stella è O(n²): con novanta stelle sono quattromila
   * distanze per fotogramma, che a questa scala è poco — ma è la ragione per
   * cui il conteggio non va alzato con leggerezza. */
  FX.constellation = function(host){
    var cv = makeCanvas(host, 40), ptr = makePointer(host);
    var N = 90, MAXD = 115, CURD = 175, COL = '#c8c8ff';
    var stars = [], time = 0;
    for (var i = 0; i < N; i++) {
      stars.push({ x: Math.random() * cv.size.w, y: Math.random() * cv.size.h,
                   vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
                   r: Math.random() * 2 + 0.5 });
    }

    function frame(){
      var g = cv.g, w = cv.size.w, h = cv.size.h;
      g.clearRect(0, 0, w, h);
      time += 0.05;
      var pulse = ptr.p.over ? 1 + Math.sin(time * 6) * 0.25 : 1;
      var curD = CURD * (ptr.p.over ? 1.25 : 1);

      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.x += s.vx; s.y += s.vy;
        if (s.x < 0) s.x = w; if (s.x > w) s.x = 0;
        if (s.y < 0) s.y = h; if (s.y > h) s.y = 0;
      }
      for (var a = 0; a < stars.length; a++) {
        var A = stars[a];
        for (var b = a + 1; b < stars.length; b++) {
          var B = stars[b], d = Math.hypot(A.x - B.x, A.y - B.y);
          if (d < MAXD) {
            g.beginPath();
            g.strokeStyle = 'rgba(124,92,252,' + ((1 - d / MAXD) * 0.35).toFixed(3) + ')';
            g.lineWidth = 0.7;
            g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
          }
        }
        if (ptr.p.inside) {
          var dc = Math.hypot(A.x - ptr.p.x, A.y - ptr.p.y);
          if (dc < curD) {
            g.beginPath();
            g.strokeStyle = 'rgba(92,244,252,' + ((1 - dc / curD) * 0.75 * pulse).toFixed(3) + ')';
            g.lineWidth = ptr.p.over ? 1.5 * pulse : 1;
            g.moveTo(A.x, A.y); g.lineTo(ptr.p.x, ptr.p.y); g.stroke();
          }
        }
        g.beginPath(); g.fillStyle = COL;
        g.arc(A.x, A.y, A.r, 0, Math.PI * 2); g.fill();
      }
    }
    return { frame: frame, resize: cv.resize,
             destroy: function(){ ptr.destroy(); cv.destroy(); } };
  };

  /* FANTASMI SPECCHIATI — quattro anelli: uno segue il puntatore, gli altri tre
   * seguono la sua immagine riflessa sugli assi del riquadro. Ognuno insegue
   * con una costante diversa, quindi non arrivano mai insieme — ed è lo
   * sfasamento a far sembrare che siano quattro cose e non una sola copiata. */
  FX.mirror = function(host){
    var cv = makeCanvas(host, 40), ptr = makePointer(host);
    var COL = '#c45cfc', SIZE = 20, LERP = 0.14;
    var ghosts = [
      { x: 0, y: 0, sx: 1,  sy: 1,  l: 1,          a: 0.9,  d: 0 },
      { x: 0, y: 0, sx: -1, sy: 1,  l: LERP,       a: 0.5,  d: -2 },
      { x: 0, y: 0, sx: 1,  sy: -1, l: LERP,       a: 0.5,  d: -2 },
      { x: 0, y: 0, sx: -1, sy: -1, l: LERP * 0.7, a: 0.28, d: -4 }
    ];
    var scale = 1;

    function frame(){
      var g = cv.g, w = cv.size.w, h = cv.size.h;
      g.clearRect(0, 0, w, h);
      var cx = w / 2, cy = h / 2;
      var mx = ptr.p.inside ? ptr.p.x : cx, my = ptr.p.inside ? ptr.p.y : cy;
      scale += ((ptr.p.over ? 2.2 : 1) - scale) * 0.15;

      for (var i = 0; i < ghosts.length; i++) {
        var gh = ghosts[i];
        var tx = cx + (mx - cx) * gh.sx, ty = cy + (my - cy) * gh.sy;
        gh.x += (tx - gh.x) * gh.l; gh.y += (ty - gh.y) * gh.l;
        g.save();
        g.beginPath();
        g.arc(gh.x, gh.y, Math.max(1, (SIZE + gh.d) * scale) / 2, 0, Math.PI * 2);
        g.strokeStyle = COL; g.globalAlpha = gh.a; g.lineWidth = 2;
        g.shadowColor = COL; g.shadowBlur = 12 * gh.a;
        g.stroke(); g.restore();
      }
      if (ptr.p.inside) {
        g.save(); g.beginPath();
        g.arc(mx, my, Math.max(0.5, 3 * (ptr.p.over ? 0.5 : 1)), 0, Math.PI * 2);
        g.fillStyle = '#fff'; g.fill(); g.restore();
      }
    }
    return { frame: frame, resize: cv.resize,
             destroy: function(){ ptr.destroy(); cv.destroy(); } };
  };

  /* MAGNETICO — le parole si sporgono verso il puntatore.
   * Non c'è canvas: si scrive una `transform` su ogni bersaglio. I centri si
   * misurano UNA volta e si rimisurano quando la pagina cambia forma, perché
   * chiederli a ogni frame per ogni parola vuol dire far ricalcolare il layout
   * cinquanta volte per fotogramma (è quello che fa il sorgente). */
  function makeMagnetic(host){
    /* I bersagli si possono dichiarare in due modi. Con `data-magnetic` sul
     * singolo elemento, quando è scritto nel markup; oppure con un selettore
     * su `data-magnetic-sel`, quando gli elementi NON esistono nel markup
     * perché li fabbrica un altro modulo a caricamento — è il caso delle parole
     * del manifesto, che le ritaglia `WC.splitWords` in js/manifesto.js.
     * Nel secondo caso l'attributo glielo mettiamo noi, così vale anche la
     * regola CSS che le rende `inline-block` (su uno span in linea la transform
     * non farebbe nulla). */
    var sel = host.dataset.magneticSel;
    var targets = Array.prototype.slice.call(
      host.querySelectorAll(sel || '[data-magnetic]'));
    if (sel) targets.forEach(function(el){ el.setAttribute('data-magnetic', ''); });
    if (!targets.length) return null;
    var ptr = makePointer(host);
    /* Due scostamenti dal sorgente, tutti e due misurati.
     *
     * LA FORZA. Il sorgente ha 0.025, tarato sui suoi bersagli: pulsanti e
     * card. Su una parola dà 0,7 px di spostamento — verificato leggendo la
     * `transform` col mouse accanto: c'è, ma non si vede. 0.35 porta il massimo
     * a una dozzina di pixel, che su una parola si legge come una sporgenza e
     * non come un tremolio.
     *
     * IL DECADIMENTO. Nel sorgente la spinta è proporzionale alla distanza e
     * poi si azzera di netto al bordo del raggio: la parola è spostata al
     * massimo proprio un istante prima di scattare indietro. Qui si moltiplica
     * per `1 - d/RANGE`, quindi la spinta è massima a mezza distanza, si spegne
     * dolcemente al bordo e non c'è nessuno scatto da attraversare. */
    var RANGE = 160, STRENGTH = 0.35;
    var state = targets.map(function(){ return { x: 0, y: 0, cx: 0, cy: 0 }; });

    function measure(){
      var hr = host.getBoundingClientRect();
      for (var i = 0; i < targets.length; i++) {
        // Si misura a trasformazione azzerata, se no il centro letto è quello
        // spostato e i bersagli scivolano via un poco a ogni misura.
        var prev = targets[i].style.transform;
        targets[i].style.transform = 'none';
        var r = targets[i].getBoundingClientRect();
        state[i].cx = r.left - hr.left + r.width / 2;
        state[i].cy = r.top - hr.top + r.height / 2;
        targets[i].style.transform = prev;
      }
    }
    measure();

    function frame(){
      for (var i = 0; i < targets.length; i++) {
        var s = state[i];
        var dx = ptr.p.x - s.cx, dy = ptr.p.y - s.cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (ptr.p.inside && d < RANGE) {
          var fall = 1 - d / RANGE;          // massimo a mezza distanza, zero al bordo
          s.x += (dx * STRENGTH * fall - s.x) * 0.25;
          s.y += (dy * STRENGTH * fall - s.y) * 0.25;
        } else {
          s.x += (0 - s.x) * 0.12;
          s.y += (0 - s.y) * 0.12;
        }
        targets[i].style.transform = 'translate(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px)';
      }
    }
    return { frame: frame, resize: measure,
             destroy: function(){
               ptr.destroy();
               targets.forEach(function(el){ el.style.transform = ''; });
             } };
  }

  /* ---------------------------------------------------------------- montaggio */

  hosts.forEach(function(host){
    var name = host.dataset.cursorFx;
    var parts = [];
    if (name && FX[name]) parts.push(FX[name](host));
    else if (name) console.warn('[WC] effetto di cursore sconosciuto:', name);
    var mag = makeMagnetic(host);
    if (mag) parts.push(mag);
    if (!parts.length) return;

    var raf = 0, running = false;
    function loop(){
      raf = requestAnimationFrame(loop);
      for (var i = 0; i < parts.length; i++) parts[i].frame();
    }
    function start(){
      if (running || document.hidden) return;
      running = true;
      parts.forEach(function(p){ p.resize(); });
      raf = requestAnimationFrame(loop);
    }
    function stop(){
      if (!running) return;
      running = false; cancelAnimationFrame(raf);
    }

    // La sezione che comanda è quella che CONTIENE l'ospite: l'ospite spesso è
    // il pin, e un pin non ha una posizione propria nella pagina da misurare.
    var section = host.closest('section') || host;
    var st = ScrollTrigger.create({
      trigger: section, start: 'top bottom', end: 'bottom top',
      onToggle: function(self){ self.isActive ? start() : stop(); }
    });
    var onResize = function(){ parts.forEach(function(p){ p.resize(); }); };
    var onVis = function(){ if (document.hidden) stop(); else if (st.isActive) start(); };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    if (st.isActive) start();

    cleanups.push(function(){
      stop(); st.kill();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      parts.forEach(function(p){ p.destroy(); });
    });
  });

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
