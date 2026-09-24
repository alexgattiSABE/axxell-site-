// scripts/verify-capitoli.cjs — verifica a schermo di atelier/capitoli.html
const NM = '/Users/nico/Progetti/axxell-chatbot/node_modules/';
const { chromium } = require(NM + 'playwright');
const sharp = require(NM + 'sharp');
const fs = require('fs');
const OUT = '/tmp/capitoli-verify'; fs.mkdirSync(OUT, { recursive: true });
const EXE = '/Users/nico/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'http://127.0.0.1:8812/atelier/capitoli.html';   // 8803 su 127.0.0.1 serve il sito del robot
const argv = process.argv.slice(2);
const check = argv[0], mobile = argv.includes('--mobile'), reduce = argv.includes('--reduce');
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
                                      cap: window.__capitoli.caption(), nav: window.__capitoli.nav() }));
  const vis = s.c.filter(c => c.reveal > 0.05);
  const obst = [{ n: 'caption', q: rectQuad(s.cap) }, { n: 'nav', q: rectQuad(s.nav) }];
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
// Pixel ciano dell'elica nella colonna centrale: `out` = fuori da ogni card
// visibile (l'elica c'e'), `inFront` = dentro la card davanti (deve essere ~0:
// il buco taglia davvero). Le card si leggono PRIMA della cattura.
async function helixPixels(p, file){
  const cards = await p.evaluate(() => window.__capitoli.cards());
  const front = await p.evaluate(() => window.__capitoli.front());
  const buf = await p.screenshot({ path: OUT + '/' + file });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const vis = cards.filter(c => c.reveal > 0.05).map(c => c.quad);
  const fq = cards[front].quad;
  const x0 = Math.round(info.width * 0.40), x1 = Math.round(info.width * 0.60);
  let out = 0, inFront = 0;
  for (let y = 0; y < info.height; y += 2) for (let x = x0; x < x1; x += 2){
    const o = (y * info.width + x) * info.channels, r = data[o], g = data[o + 1], bl = data[o + 2];
    if (!(bl > 150 && g > 120 && r < 120)) continue;   // il ciano dei punti del DNA
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
        const want = await p.evaluate(i => window.EFFETTI[i].lp.h.join(''), i);
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
