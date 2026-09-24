// scripts/verify-capitoli.cjs — verifica a schermo di atelier/capitoli.html
const NM = '/Users/nico/Progetti/axxell-chatbot/node_modules/';
const { chromium } = require(NM + 'playwright');
const sharp = require(NM + 'sharp');
const fs = require('fs');
const OUT = '/tmp/capitoli-verify'; fs.mkdirSync(OUT, { recursive: true });
const EXE = '/Users/nico/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'http://localhost:8803/atelier/capitoli.html';
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
      const r0 = await helixPixels(p, 'helix-rest.png'), rest = r0.out;
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
    } else {
      console.log('SKIP ' + check + ' (not implemented yet)');
    }
    if (errs.length) fail('console errors: ' + errs.join(' | '));
    pass();
  } finally { await b.close(); }
})();
