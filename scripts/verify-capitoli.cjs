// scripts/verify-capitoli.cjs — verifica a schermo di atelier/capitoli.html
const NM = '/Users/nico/Progetti/axxell-chatbot/node_modules/';
const { chromium } = require(NM + 'playwright');
const sharp = require(NM + 'sharp');
const fs = require('fs');
const OUT = '/tmp/capitoli-verify'; fs.mkdirSync(OUT, { recursive: true });
const EXE = '/Users/nico/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const argv = process.argv.slice(2);
const check = argv[0], mobile = argv.includes('--mobile'), reduce = argv.includes('--reduce');
// --en: la pagina in inglese (?lang=en). `lingua` la apre in inglese da se'.
const EN = argv.includes('--en') || check === 'lingua';
const URL = 'http://127.0.0.1:8812/atelier/capitoli.html' + (EN ? '?lang=en' : '');   // 8803 su 127.0.0.1 serve il sito del robot
const arg = argv.filter(a => !a.startsWith('--'))[1];
const VP = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };

function fail(msg){ console.log('FAIL ' + check + ': ' + msg); process.exitCode = 1; }
function pass(){ if (!process.exitCode) console.log('PASS ' + check + (mobile ? ' (mobile)' : '')); }

async function open(){
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: VP, reducedMotion: reduce ? 'reduce' : 'no-preference', hasTouch: mobile, isMobile: mobile,
                              deviceScaleFactor: check === 'poster' ? 2 : 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|ReadPixels/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.__capitoli && window.__capitoli.cards().length === 7, null, { timeout: 15000 });
  await p.waitForTimeout(4500);                     // arrivo + composizione del mazzo
  return { b, p, errs };
}
async function settle(p, i){
  await p.evaluate(i => window.__capitoli.goTo(i), i);
  await p.waitForTimeout(1600);
}
// Separating-axis test fra due poligoni convessi (quad proiettati).
function overlaps(A, B){
  for (const P of [A, B]) for (let i = 0; i < P.length; i++){
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
    const nx = y2 - y1, ny = x1 - x2;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of A){ const d = x * nx + y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, y] of B){ const d = x * nx + y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 + 0.5 || b1 <= a0 + 0.5) return false;
  }
  return true;
}
const rectQuad = r => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

async function checkOverlap(p, label){
  const s = await p.evaluate(() => ({ c: window.__capitoli.cards(), i: window.__capitoli.index(),
                                      cap: window.__capitoli.caption(), nav: window.__capitoli.nav(),
                                      ex: window.__capitoli.extra ? window.__capitoli.extra() : {} }));
  const vis = s.c.filter(c => c.reveal > 0.05);
  const obst = [{ n: 'caption', q: rectQuad(s.cap) }, { n: 'nav', q: rectQuad(s.nav) }];
  // i link fissi della pagina (round 3): #torna in basso a sinistra, #preventivo a destra (in basso a destra su telefono)
  const fissi = Object.entries(s.ex).filter(([, r]) => r && r.w > 1).map(([n, r]) => ({ n, q: rectQuad(r) }));
  obst.push(...fissi);
  for (let a = 0; a < fissi.length; a++) for (let c = a + 1; c < fissi.length; c++)
    if (overlaps(fissi[a].q, fissi[c].q)) fail(`${label}: ${fissi[a].n} overlaps ${fissi[c].n}`);
  for (const f of fissi){
    for (const o of [{ n: 'caption', q: rectQuad(s.cap) }, { n: 'nav', q: rectQuad(s.nav) }]) if (overlaps(f.q, o.q)) fail(`${label}: ${f.n} overlaps ${o.n}`);
    if (s.i.opacity > 0.1 && overlaps(f.q, s.i.quad)) fail(`${label}: ${f.n} overlaps index`);
  }
  if (s.i.opacity > 0.1) obst.push({ n: 'index', q: s.i.quad });
  for (let a = 0; a < vis.length; a++){
    for (let b = a + 1; b < vis.length; b++)
      if (overlaps(vis[a].quad, vis[b].quad)) fail(`${label}: card ${vis[a].id} overlaps card ${vis[b].id}`);
    for (const o of obst) if (overlaps(vis[a].quad, o.q)) fail(`${label}: card ${vis[a].id} overlaps ${o.n}`);
  }
  if (s.i.opacity > 0.1 && overlaps(s.i.quad, rectQuad(s.cap))) fail(`${label}: index overlaps caption`);
}

function inQuad(q, x, y){                       // punto dentro un quad convesso
  let s = 0;
  for (let i = 0; i < 4; i++){
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
    const c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (c !== 0){ if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
  }
  return true;
}
// Pixel accesi dell'elica nella colonna centrale: `out` = fuori da ogni card
// visibile (l'elica c'e'), `inFront` = dentro la card davanti (deve essere ~0:
// il buco taglia davvero). Le card si leggono PRIMA della cattura.
// Dal 2026-09-24 l'elica prende il colore della card davanti (arancio, ciano,
// bianco, viola...): non si filtra piu' il ciano ma i pixel CHIARI, e per non
// contare le lettere bianche della didascalia e della nav, durante la cattura
// le scritte DOM sopra all'elica si nascondono.
async function helixPixels(p, file){
  const cards = await p.evaluate(() => window.__capitoli.cards());
  const front = await p.evaluate(() => window.__capitoli.front());
  const testi = on => p.evaluate(on => {
    document.querySelectorAll('#focus, #hint, #nav').forEach(e => { e.style.visibility = on ? 'hidden' : ''; });
  }, on);
  await testi(true);
  const buf = await p.screenshot({ path: OUT + '/' + file });
  await testi(false);
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const vis = cards.filter(c => c.reveal > 0.05).map(c => c.quad);
  const fq = cards[front].quad;
  const x0 = Math.round(info.width * 0.40), x1 = Math.round(info.width * 0.60);
  let out = 0, inFront = 0;
  for (let y = 0; y < info.height; y += 2) for (let x = x0; x < x1; x += 2){
    const o = (y * info.width + x) * info.channels, r = data[o], g = data[o + 1], bl = data[o + 2];
    if (Math.max(r, g, bl) < 150) continue;            // un punto acceso del DNA, di qualunque colore
    if (inQuad(fq, x, y)) inFront++;
    else if (!vis.some(q => inQuad(q, x, y))) out++;
  }
  return { out, inFront };
}

(async () => {
  const { b, p, errs } = await open();
  try {
    if (check === 'helix'){
      await settle(p, 0);
      // Per il conto a riposo si guarda SOLO l'elica: l'effetto vivo sulla
      // card davanti (il fumo ciano di Vapore, mosso dal puntatore fantasma)
      // e la copy (kicker nel colore della card) passano il filtro del ciano
      // e verrebbero contati come punti del DNA dentro la card.
      const solo = on => p.evaluate(on => {
        document.querySelectorAll('canvas:not(#helixCanvas), #stage-live, #lp').forEach(e => { e.style.visibility = on ? 'hidden' : ''; });
      }, on);
      await solo(true);
      const r0 = await helixPixels(p, 'helix-rest.png'), rest = r0.out;
      await solo(false);
      // la card davanti copre davvero l'elica (il buco taglia): quasi zero punti dentro
      if (r0.inFront > 25) fail('helix drawn over the front card: ' + r0.inFront + ' px');
      // raffica di rotellina: tre card, catture durante il moto
      let min = Infinity;
      await p.mouse.move(VP.width * 0.9, VP.height * 0.5);
      for (let k = 0; k < 6; k++){
        await p.mouse.wheel(0, 600);
        await p.waitForTimeout(90);
        min = Math.min(min, (await helixPixels(p, `helix-move-${k}.png`)).out);
      }
      const cp = await p.evaluate(() => getComputedStyle(document.getElementById('helixStage')).clipPath);
      if (!/^path\(/.test(cp) && cp !== 'none') fail('clip-path is not a path(): ' + cp);
      const mask = await p.evaluate(() => getComputedStyle(document.getElementById('helixStage')).maskImage || '');
      if (/data:image/.test(mask)) fail('mask-image data URI still in use');
      if (rest < 150) fail('helix barely visible at rest: ' + rest);
      if (min < rest * 0.35) fail(`helix vanishes while moving: rest=${rest} min=${min}`);
    } else if (check === 'overlap'){
      for (let i = 0; i < 7; i++){ await settle(p, i); await checkOverlap(p, 'rest ' + i); }
      // a meta' transizione: spin frazionario ±0.5, fermo
      await p.evaluate(() => window.__capitoli.setSpin(3.5));
      await p.waitForTimeout(400); await checkOverlap(p, 'mid 3.5');
      await p.evaluate(() => window.__capitoli.setSpin(2.5));
      await p.waitForTimeout(400); await checkOverlap(p, 'mid 2.5');
      // resize dal vivo: desktop -> ritratto (o viceversa) e ricontrollo
      await p.setViewportSize(mobile ? { width: 1440, height: 900 } : { width: 390, height: 844 });
      await p.waitForTimeout(800); await settle(p, 0); await checkOverlap(p, 'after resize');
      await p.screenshot({ path: OUT + '/overlap-after-resize.png' });
    } else if (check === 'index'){
      await settle(p, 3);
      const t = await p.evaluate(() => ({
        names: window.EFFETTI.map(e => e.nome),
        fname: document.getElementById('fName').textContent,
        hint: document.getElementById('hint').textContent,
        hintPx: parseFloat(getComputedStyle(document.getElementById('hint')).fontSize),
        hintA: getComputedStyle(document.getElementById('hint')).color,
        subA: getComputedStyle(document.getElementById('fSub')).color
      }));
      const want = ['Vapore','Gravità','Anatomia','Nebulosa','Contatto','Genesi','Rivela'];
      if (JSON.stringify(t.names) !== JSON.stringify(want)) fail('titles: ' + t.names.join(','));
      if (t.fname !== 'Nebulosa') fail('caption title: ' + t.fname);
      if (t.hintPx < 11) fail('hint font ' + t.hintPx);
      const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); const v = m[1].split(',').map(Number); return v.length > 3 ? v[3] : 1; };
      if (alpha(t.hintA) < 0.72 || alpha(t.subA) < 0.72) fail('caption alpha ' + t.hintA + ' / ' + t.subA);
      // la riga 5 dell'elenco porta davanti la card 5 — ma non in ritratto,
      // dove l'elenco resta a opacita' zero per scelta (non c'e' una fascia
      // libera che lo contenga intero senza toccare una vicina): li' il
      // clic non ha nulla da colpire, e non e' un fallimento del check.
      const q = await p.evaluate(() => window.__capitoli.index().quad);
      const idxOpacity = await p.evaluate(() => window.__capitoli.index().opacity);
      if (idxOpacity < 0.1){
        console.log('SKIP ' + check + ': index hidden in portrait (by design)');
      } else {
        const pt = await p.evaluate(() => window.__capitoli.indexRowPt(5, 0.25));
        await p.mouse.click(pt[0], pt[1]);
        await p.waitForTimeout(1600);
        if (await p.evaluate(() => window.__capitoli.front()) !== 5) fail('index row click did not bring card 5');
      }
      await p.screenshot({ path: OUT + '/index.png' });
      await checkOverlap(p, 'index');
    } else if (check === 'interact'){
      await settle(p, 6);                               // Rivela: reagisce al puntatore
      await p.waitForTimeout(900);
      if (!(await p.evaluate(() => window.__capitoli.awake()))) fail('no effect awake on card 6');
      const url0 = p.url(), s0 = await p.evaluate(() => window.__capitoli.spin());
      const q = (await p.evaluate(() => window.__capitoli.cards()))[6].quad;
      const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
      await p.mouse.click(cx, cy);
      await p.mouse.move(cx - 120, cy); await p.mouse.down();
      await p.mouse.move(cx + 160, cy + 40, { steps: 12 }); await p.mouse.up();
      await p.waitForTimeout(700);
      const s1 = await p.evaluate(() => window.__capitoli.spin());
      if (p.url() !== url0) fail('navigated to ' + p.url());
      if (Math.abs(s1 - s0) > 0.01) fail(`drag on preview spun the deck ${s0} -> ${s1}`);
      if (!(await p.evaluate(() => window.__capitoli.awake()))) fail('effect froze during interaction');
      await p.keyboard.press('Enter'); await p.waitForTimeout(500);
      if (p.url() !== url0) fail('Enter navigated');
      // la rotellina sopra l'anteprima cambia ancora card
      await p.mouse.move(cx, cy); await p.mouse.wheel(0, 1200); await p.waitForTimeout(1800);
      if (await p.evaluate(() => window.__capitoli.front()) === 6) fail('wheel over preview did not change card');
      // un clic su una card di fianco la porta davanti
      await settle(p, 2);
      const side = (await p.evaluate(() => window.__capitoli.cards()))[3].quad;
      await p.mouse.click((side[0][0] + side[2][0]) / 2, (side[0][1] + side[2][1]) / 2);
      await p.waitForTimeout(1600);
      if (await p.evaluate(() => window.__capitoli.front()) !== 3) fail('click on side card did not bring it front');
    } else if (check === 'tapfuori'){
      // Round 3 (Nike: «quando tocco fuori dalla card si refresha l'animazione»,
      // su telefono e su pc): un tocco/clic su un punto vuoto, fuori dalla card
      // davanti, non deve congelare l'effetto nemmeno per un fotogramma.
      await settle(p, 3); await p.waitForTimeout(1200);
      const mod = await p.evaluate(() => window.__capitoli.awake());
      if (mod !== 'vesper') fail('card 3 not awake before the tap: ' + mod);
      // un punto vuoto: fuori da ogni card visibile, dalla nav, dalla didascalia e dall'elenco
      const pt = await p.evaluate(mobile => {
        const c = window.__capitoli, cards = c.cards().filter(k => k.reveal > 0.02);
        const box = [c.caption(), c.nav()];
        const ix = c.index(); if (ix.opacity > 0.05) cards.push({ quad: ix.quad });
        const inQ = (q, x, y) => { let s = 0; for (let i = 0; i < 4; i++){ const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
          const k = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1); if (k){ if (!s) s = Math.sign(k); else if (Math.sign(k) !== s) return false; } } return true; };
        const libero = (x, y) => !cards.some(k => inQ(k.quad, x, y)) &&
          !box.some(r => x >= r.x - 12 && x <= r.x + r.w + 12 && y >= r.y - 12 && y <= r.y + r.h + 12) &&
          !document.elementFromPoint(x, y).closest('#nav,#dots,#lp,#stage-live,button,a');
        const f = c.cards()[c.front()].quad, cy = (f[0][1] + f[2][1]) / 2;
        const W = innerWidth, H = innerHeight;
        const prove = mobile ? [[W * 0.5, (f[2][1] + H * 0.8) / 2], [W * 0.5, H * 0.58], [W * 0.15, H * 0.6], [W * 0.85, H * 0.18]]
                             : [[Math.min(...f.map(v => v[0])) / 2, cy], [(Math.max(...f.map(v => v[0])) + W) / 2, cy], [W * 0.1, H * 0.5], [W * 0.9, H * 0.5]];
        for (const [x, y] of prove) if (libero(x, y)) return [Math.round(x), Math.round(y)];
        return null;
      }, mobile);
      if (!pt) fail('no empty point found outside the front card');
      else {
        const campioni = [];
        const campiona = async n => { for (let k = 0; k < n; k++){ campioni.push(await p.evaluate(() => window.__capitoli.awake())); await p.waitForTimeout(50); } };
        const tap = mobile ? p.touchscreen.tap(pt[0], pt[1]) : p.mouse.click(pt[0], pt[1]);
        await Promise.all([tap, campiona(20)]);
        const s0 = await p.evaluate(() => window.__capitoli.spin());
        if (campioni.some(v => v !== mod)) fail(`effect froze after a tap at ${pt}: ` + campioni.map(v => v || 'null').join(','));
        if (await p.evaluate(() => window.__capitoli.front()) !== 3) fail('the tap changed card');
        await p.screenshot({ path: OUT + `/tapfuori${mobile ? '-m' : ''}.png` });
        console.log('tapfuori: tap at', pt.join(','), 'samples', campioni.length, 'spin', s0.toFixed(3));
      }
    } else if (check === 'colori'){
      // la pagina prende il colore della card davanti: una cattura per card
      if (!(await p.evaluate(() => !!(window.WC && WC.helix && WC.helix.setTint)))) fail('WC.helix.setTint missing');
      for (let i = 0; i < 7; i++){
        await settle(p, i); await p.waitForTimeout(1200);          // la dissolvenza dura 0.8 s
        await p.screenshot({ path: OUT + `/colori-${i}${mobile ? '-m' : ''}.png` });
      }
    } else if (check === 'swipe'){
      // Su telefono lo strisciare in verticale gira il mazzo come la rotellina,
      // ANCHE sopra l'anteprima viva; in orizzontale sull'anteprima il gesto e'
      // dell'effetto. Tocchi veri via CDP: diventano Pointer Events 'touch'.
      if (!mobile){ console.log('SKIP swipe: phone only (run with --mobile)'); }
      else {
        const cdp = await p.context().newCDPSession(p);
        const tocca = async (x0, y0, x1, y1) => {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
          for (let k = 1; k <= 12; k++)
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / 12, y: y0 + (y1 - y0) * k / 12 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        };
        const centro = async i => { const q = (await p.evaluate(() => window.__capitoli.cards()))[i].quad;
                                    return [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]; };
        // L'anteprima riceve i tocchi (li conta un ascoltatore su #stage-live):
        // il tocco e il trascino di lato arrivano all'effetto.
        await p.evaluate(() => { window.__tocchi = 0;
          document.getElementById('stage-live').addEventListener('pointermove', e => { if (e.pointerType === 'touch') window.__tocchi++; }, true); });
        // Vapore, e le card che seguono il dito: Contatto e Rivela
        for (const i of [0, 4, 6]){
          await settle(p, i); await p.waitForTimeout(900);
          const viva = await p.evaluate(() => document.getElementById('stage-live').classList.contains('-viva'));
          if (!viva) fail(`card ${i}: preview not live, the swipe-over-preview case is not exercised`);
          // 1) verticale sopra l'anteprima viva: cambia card, la pagina non scorre
          let [cx, cy] = await centro(i);
          const y0 = await p.evaluate(() => window.scrollY);
          await tocca(cx, cy + 60, cx, cy - 60); await p.waitForTimeout(1800);
          if (await p.evaluate(() => window.__capitoli.front()) === i) fail(`card ${i}: vertical swipe over the preview did not change card`);
          if (await p.evaluate(() => window.scrollY) !== y0) fail(`card ${i}: vertical swipe scrolled the page`);
          // 3) orizzontale sopra l'anteprima: il mazzo resta fermo, l'effetto riceve il dito
          await settle(p, i); await p.waitForTimeout(900);
          [cx, cy] = await centro(i);
          const s0 = await p.evaluate(() => window.__capitoli.spin()), t0 = await p.evaluate(() => window.__tocchi);
          await tocca(cx - 80, cy, cx + 80, cy + 10); await p.waitForTimeout(700);
          const s1 = await p.evaluate(() => window.__capitoli.spin()), t1 = await p.evaluate(() => window.__tocchi);
          if (Math.abs(s1 - s0) > 0.01) fail(`card ${i}: horizontal drag on the preview spun the deck ${s0} -> ${s1}`);
          if (!(t1 > t0)) fail(`card ${i}: horizontal drag never reached the preview`);
          if (!(await p.evaluate(() => window.__capitoli.awake()))) fail(`card ${i}: effect fell asleep during the horizontal drag`);
        }
        // 2) verticale sopra la card davanti, fuori dall'anteprima: in alto,
        //    fra la nav e la card (~190px: piu' di mezza card, se no lo scatto
        //    riporta indietro)
        await settle(p, 0);
        await tocca(VP.width * 0.5, VP.height * 0.34, VP.width * 0.5, VP.height * 0.12); await p.waitForTimeout(1800);
        if (await p.evaluate(() => window.__capitoli.front()) === 0) fail('vertical swipe outside the cards did not change card');
        // 4) il ☰ apre il menu e non tocca il mazzo; uno striscio sul menu nemmeno
        const s2 = await p.evaluate(() => window.__capitoli.spin());
        const bb = await p.evaluate(() => { const r = document.getElementById('navBurger').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
        await p.touchscreen.tap(bb[0], bb[1]); await p.waitForTimeout(400);
        if (!(await p.evaluate(() => document.getElementById('mobileDropdown').classList.contains('-on')))) fail('burger did not open the menu');
        const dd = await p.evaluate(() => { const r = document.getElementById('mobileDropdown').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 10, r.bottom - 10]; });
        await tocca(dd[0], dd[2], dd[0], dd[1]); await p.waitForTimeout(700);
        if (Math.abs((await p.evaluate(() => window.__capitoli.spin())) - s2) > 0.01) fail('burger or menu swipe spun the deck');
        await p.screenshot({ path: OUT + '/swipe-m.png' });
      }
    } else if (check === 'copy'){
      for (const i of [0, 2, 3, 4]){
        await settle(p, i); await p.waitForTimeout(1600);   // lo scramble dura ~1.3s
        const r = await p.evaluate(i => {
          const lp = document.getElementById('lp'), q = window.__capitoli.cards()[i].quad;
          const b = lp.getBoundingClientRect(), h = lp.querySelector('.lp-h');
          const minx = Math.min(...q.map(v => v[0])), maxx = Math.max(...q.map(v => v[0]));
          const miny = Math.min(...q.map(v => v[1])), maxy = Math.max(...q.map(v => v[1]));
          const kids = [...lp.querySelectorAll('.lp-k,.lp-l,.lp-s,.lp-b')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect());
          return { op: getComputedStyle(lp).opacity, text: h.textContent, b: { l: b.left, t: b.top, r: b.right, bt: b.bottom },
                   card: { minx, maxx, miny, maxy }, kids: kids.map(k => ({ l: k.left, t: k.top, r: k.right, b: k.bottom })) };
        }, i);
        // il titolo atteso e' quello della lingua della pagina (--en: la meta' `en` del record)
        const want = await p.evaluate(i => { const e = window.EFFETTI[i];
          return (document.documentElement.lang === 'en' && e.en ? e.en.lp : e.lp).h.join(''); }, i);
        if (parseFloat(r.op) < 0.9) fail(`card ${i}: copy not visible (opacity ${r.op})`);
        if (r.text.replace(/\s/g, '') !== want.replace(/\s/g, '')) fail(`card ${i}: headline "${r.text}" != "${want}"`);
        const pad = (r.card.maxx - r.card.minx) * 0.05;
        // la copy resta nella meta' sinistra (o nella fascia bassa su telefono): il centro e' dell'effetto
        const narrow = (r.card.maxx - r.card.minx) < 420;
        if (!narrow) for (const k of r.kids) if (k.r > r.card.minx + (r.card.maxx - r.card.minx) * 0.52) fail(`card ${i}: copy reaches the centre`);
        if (narrow) for (const k of r.kids) if (k.t < r.card.miny + (r.card.maxy - r.card.miny) * 0.45) fail(`card ${i}: mobile copy above the bottom band`);
        for (const k of r.kids){
          if (k.l < r.card.minx + pad || k.r > r.card.maxx - pad || k.t < r.card.miny + pad || k.b > r.card.maxy - pad)
            fail(`card ${i}: copy touches the card edge`);
        }
        for (let a = 0; a < r.kids.length; a++) for (let c = a + 1; c < r.kids.length; c++){
          const A = r.kids[a], B = r.kids[c];
          if (A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b) fail(`card ${i}: copy lines overlap`);
        }
        await p.screenshot({ path: OUT + `/copy-${i}${mobile ? '-m' : ''}${reduce ? '-r' : ''}.png` });
      }
    } else if (check === 'lingua'){
      // Nike: «la traduzione in inglese non traduce tutto». Aperta con ?lang=en
      // la pagina e' inglese ovunque; un clic su IT la riporta in italiano dal
      // vivo, un clic su EN di nuovo in inglese — senza ricaricare.
      const leggi = async () => {
        await settle(p, 4); await p.waitForTimeout(1600);       // Contatto: lo scramble dura ~1.3s
        return p.evaluate(() => {
          const e = window.EFFETTI[4], T = window.atelierTesti;
          const mob = matchMedia('(max-width:760px)').matches || matchMedia('(pointer:coarse)').matches;
          return { lang: document.documentElement.lang, title: document.title,
                   fname: document.getElementById('fName').textContent, fsub: document.getElementById('fSub').textContent,
                   hint: document.getElementById('hint').textContent,
                   h: document.querySelector('#lp .lp-h').textContent.replace(/\s/g, ''),
                   torna: document.getElementById('torna').getAttribute('href'),
                   mondo: document.getElementById('preventivo').getAttribute('href'),
                   cta: [...document.querySelectorAll('#navPreventivo')].map(a => a.getAttribute('href')),
                   dot: window.EFFETTI[4].dot.getAttribute('aria-label'),
                   it: { nome: e.nome, sett: e.sett, h: e.lp.h.join('').replace(/\s/g, ''), hint: mob ? T.it.hintM : T.it.hint, title: T.it.titolo },
                   en: { nome: e.en.nome, sett: e.en.sett, h: e.en.lp.h.join('').replace(/\s/g, ''), hint: mob ? T.en.hintM : T.en.hint, title: T.en.titolo } };
        });
      };
      const inglese = (s, quando) => {
        if (s.lang !== 'en') fail(`${quando}: html lang is ${s.lang}`);
        if (s.fname === s.it.nome || s.fname !== s.en.nome) fail(`${quando}: caption title "${s.fname}"`);
        if (s.fsub !== s.en.sett) fail(`${quando}: caption type "${s.fsub}"`);
        if (s.hint === s.it.hint || s.hint !== s.en.hint) fail(`${quando}: hint "${s.hint}"`);
        if (s.h === s.it.h || s.h !== s.en.h) fail(`${quando}: headline "${s.h}"`);
        if (s.title !== s.en.title) fail(`${quando}: title "${s.title}"`);
        if (!/lang=en/.test(s.torna) || !/lang=en/.test(s.mondo)) fail(`${quando}: fixed links without ?lang=en: ${s.torna} ${s.mondo}`);
        if (!s.dot.startsWith(s.en.nome)) fail(`${quando}: dot label "${s.dot}"`);
        // il preventivo: «Il tuo mondo» e il «Free quote» del menu portano al modulo dei siti
        const Q_EN = '/atelier/parliamone?da=effetti-speciali&lang=en';
        if (s.mondo !== Q_EN) fail(`${quando}: «Il tuo mondo» goes to ${s.mondo}`);
        if (!s.cta.length || s.cta.some(h => h !== Q_EN)) fail(`${quando}: nav quote goes to ${s.cta.join(' ')}`);
      };
      const clicca = async id => {
        const vis = await p.evaluate(id => !!document.getElementById(id).getClientRects().length, id);
        if (vis) await p.click('#' + id); else await p.evaluate(id => document.getElementById(id).click(), id);
      };
      const a = await leggi(); inglese(a, 'opened with ?lang=en');
      await p.screenshot({ path: OUT + `/lingua-en${mobile ? '-m' : ''}.png` });
      await clicca('lang-it');
      const b2 = await leggi();
      if (b2.lang !== 'it') fail('after IT: html lang is ' + b2.lang);
      if (b2.fname !== b2.it.nome) fail('after IT: caption title "' + b2.fname + '"');
      if (b2.fsub !== b2.it.sett) fail('after IT: caption type "' + b2.fsub + '"');
      if (b2.hint !== b2.it.hint) fail('after IT: hint "' + b2.hint + '"');
      if (b2.h !== b2.it.h) fail('after IT: headline "' + b2.h + '"');
      if (b2.title !== b2.it.title) fail('after IT: title "' + b2.title + '"');
      if (/lang=en/.test(b2.torna) || /lang=en/.test(b2.mondo)) fail('after IT: fixed links still carry ?lang=en');
      const Q_IT = '/atelier/parliamone?da=effetti-speciali';
      if (b2.mondo !== Q_IT) fail('after IT: «Il tuo mondo» goes to ' + b2.mondo);
      if (!b2.cta.length || b2.cta.some(h => h !== Q_IT)) fail('after IT: nav quote goes to ' + b2.cta.join(' '));
      if (/lang=en/.test(p.url())) fail('after IT: URL still says ?lang=en');
      await p.screenshot({ path: OUT + `/lingua-it${mobile ? '-m' : ''}.png` });
      await clicca('lang-en');
      inglese(await leggi(), 'after EN again');
      // il suggerimento resta su una riga (su telefono: fra le due icone d'angolo)
      const hr = await p.evaluate(() => { const h = document.getElementById('hint'); return { h: h.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(h).fontSize) * 1.6, r: h.getBoundingClientRect().right, l: h.getBoundingClientRect().left }; });
      if (hr.h > hr.lh) fail('EN hint wraps: ' + hr.h + 'px tall');
      if (hr.l < 0 || hr.r > VP.width) fail('EN hint leaves the screen');
      await checkOverlap(p, 'lingua en');
    } else if (check === 'alive'){
      const ids = arg !== undefined ? [Number(arg)] : [0, 1, 2, 3, 4, 5, 6];
      for (const i of ids){
        await settle(p, i); await p.waitForTimeout(1200);
        const q = (await p.evaluate(i => window.__capitoli.cards()[i].quad, i));
        const x = Math.max(0, Math.round(Math.min(...q.map(v => v[0])) + 8)), y = Math.max(0, Math.round(Math.min(...q.map(v => v[1])) + 8));
        const w = Math.round(Math.max(...q.map(v => v[0])) - x - 16), h = Math.round(Math.max(...q.map(v => v[1])) - y - 16);
        const clip = { x, y, width: w, height: h };
        const awake = await p.evaluate(() => window.__capitoli.awake());
        const a = await p.screenshot({ clip, path: OUT + `/alive-${i}-a.png` });
        await p.waitForTimeout(Number(process.env.ALIVE_WAIT || 2000));
        const b2 = await p.screenshot({ clip, path: OUT + `/alive-${i}-b.png` });
        const { data: A, info } = await sharp(a).raw().toBuffer({ resolveWithObject: true });
        const B = await sharp(b2).raw().toBuffer();
        const ch = info.channels;                       // i PNG di Playwright arrivano a 3 canali
        let d = 0; for (let k = 0; k < A.length; k += ch) if (Math.abs(A[k] - B[k]) + Math.abs(A[k+1] - B[k+1]) + Math.abs(A[k+2] - B[k+2]) > 30) d++;
        const frac = d / (A.length / ch);
        if (!awake) fail(`card ${i}: no effect awake`);
        if (frac < 0.02) fail(`card ${i}: not moving on its own (changed ${(frac*100).toFixed(2)}%)`);
      }
    } else if (check === 'ritorno'){
      // Review Focus 5: nella STESSA pagina si torna su card gia' svegliate
      for (const i of [1, 3, 1, 5, 3, 5]){
        await settle(p, i); await p.waitForTimeout(1200);
        if (await p.evaluate(() => window.__capitoli.awake()) !== (await p.evaluate(i => window.EFFETTI[i].modulo, i)))
          fail(`card ${i}: not awake on return`);
        const probe = await p.evaluate(() => window.__warpProbe ? window.__warpProbe() : null);
        if (i === 5 && probe && probe.morph < 0.99) fail('warp replayed the tunnel on return');
        // il video dell'host VISIBILE: quello di altitude (Vapore, la card di
        // partenza) resta nel layer, nascosto e in pausa, e verrebbe prima
        const t0 = await p.evaluate(() => { const v = [...document.querySelectorAll('#stage-live video')].find(v => v.getClientRects().length); return v ? v.currentTime : null; });
        await p.waitForTimeout(800);
        const t1 = await p.evaluate(() => { const v = [...document.querySelectorAll('#stage-live video')].find(v => v.getClientRects().length); return v ? v.currentTime : null; });
        if (i === 1 && !(t1 > t0)) fail('sneaker video not playing on return');
      }
    } else if (check === 'format'){
      await settle(p, 2); await p.waitForTimeout(1500);
      const q = (await p.evaluate(() => window.__capitoli.cards()[2].quad));
      const x = Math.round(Math.min(...q.map(v => v[0]))) + 10, y = Math.round(Math.min(...q.map(v => v[1]))) + 10;
      const w = Math.round(Math.max(...q.map(v => v[0]))) - x - 10, h = Math.round(Math.max(...q.map(v => v[1]))) - y - 10;
      const buf = await p.screenshot({ clip: { x, y, width: w, height: h }, path: OUT + `/format${mobile ? '-m' : ''}.png` });
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      // le due strisce ai lati (4% della larghezza) devono essere bianche piene
      let bad = 0, n = 0;
      for (const x0 of [2, info.width - 3]) for (let yy = 0; yy < info.height; yy += 3){
        const o = (yy * info.width + x0) * info.channels; n++;
        if (data[o] < 225 || data[o + 1] < 225 || data[o + 2] < 225) bad++;
      }
      if (bad / n > 0.1) fail(`side bands are not the frame background (${bad}/${n} dark samples)`);
    } else if (check === 'tunnel'){
      await settle(p, 5);
      const samples = [];
      for (let k = 0; k < 8; k++){
        await p.waitForTimeout(1500);
        samples.push(await p.evaluate(() => window.__warpProbe ? window.__warpProbe() : null));
      }
      if (samples.some(s => s === null)) fail('no warp probe');
      else if (samples.some(s => s.morph < 0.99)) fail('tunnel phase visible: ' + samples.map(s => s.morph.toFixed(2)).join(','));
      await p.screenshot({ path: OUT + '/tunnel.png' });
    } else if (check === 'vapore'){
      await settle(p, 0); await p.waitForTimeout(3500);   // mouse fermo > 1,5 s
      const a = await p.evaluate(() => window.__altProbe ? window.__altProbe() : null);
      await p.waitForTimeout(1500);
      const b = await p.evaluate(() => window.__altProbe ? window.__altProbe() : null);
      if (!a) fail('no altitude probe');
      else if (!(b.fantasma > a.fantasma)) fail('phantom pointer is not stirring: ' + a.fantasma + ' -> ' + b.fantasma);
    } else if (check === 'poster'){
      for (const i of [1, 2, 3, 5]){
        await settle(p, i); await p.waitForTimeout(2500);
        const id = await p.evaluate(i => window.EFFETTI[i].id, i);
        const r = await p.evaluate(() => { const e = document.getElementById('stage-live'); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
        await p.evaluate(() => { for (const id of ['lp', 'helixStage']) document.getElementById(id).style.visibility = 'hidden'; });
        const buf = await p.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
        await p.evaluate(() => { for (const id of ['lp', 'helixStage']) document.getElementById(id).style.visibility = ''; });
        await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 })
          .toFile(`atelier/assets/effetti/${id}.webp`);
        console.log('poster', id);
      }
    } else {
      console.log('SKIP ' + check + ' (not implemented yet)');
    }
    if (errs.length) fail('console errors: ' + errs.join(' | '));
    pass();
  } finally { await b.close(); }
})();
