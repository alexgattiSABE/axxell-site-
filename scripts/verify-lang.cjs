// scripts/verify-lang.cjs — la lingua viaggia nell'URL (?lang=it|en) fra sito e atelier.
// Browser INGLESE (locale en-US): il caso che falliva. Server con URL puliti su :8830:
//   python3 serve_clean.py <worktree> 8830
// Righe "[other]" = dipendono da atelier/index.html e parliamone.html (altra sessione).
const NM = '/Users/nico/Progetti/axxell-chatbot/node_modules/';
const { chromium } = require(NM + 'playwright');
const EXE = '/Users/nico/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.env.BASE || 'http://127.0.0.1:8830';
const res = [];
function rec(scn, name, ok, detail, other){ res.push({ scn, name, ok, other }); console.log((ok ? 'PASS' : 'FAIL') + (other ? ' [other]' : '') + ' ' + scn + ' — ' + name + (detail ? '  (' + detail + ')' : '')); }
const lang = p => p.evaluate(() => document.documentElement.lang);
const q = (p, k) => new URL(p.url()).searchParams.get(k);
async function ready(p){ await p.waitForLoadState('load'); await p.waitForTimeout(900); }

async function mainFlow(b, path, mobile){
  const scn = path + (mobile ? ' (mobile)' : '');
  const ctx = await b.newContext({ locale: 'en-US', viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(BASE + path); await ready(p);
  rec(scn, 'en-US browser opens in English', await lang(p) === 'en' && q(p, 'lang') === 'en', await lang(p));
  if (await p.locator('#lang-it').isVisible()) await p.click('#lang-it'); else await p.evaluate(() => setLang('it'));
  await p.waitForTimeout(300);
  rec(scn, 'IT writes ?lang=it', q(p, 'lang') === 'it' && await lang(p) === 'it', p.url());
  const hrefs = await p.$$eval('a[href*="/atelier"]', as => as.map(a => a.getAttribute('href')));
  rec(scn, 'every /atelier link carries lang=it', hrefs.length > 0 && hrefs.every(h => /[?&]lang=it\b/.test(h)), hrefs.join(' '));
  if (mobile){ await p.click('.mobile-menu-btn'); await p.waitForTimeout(300); await p.click('#mobileDropdown a.-atelier'); }
  else await p.click('#n-wc');
  await ready(p);
  rec(scn, 'ATELIER link opens the atelier in Italian', await lang(p) === 'it', p.url());
  // verso il preventivo: la porta dell'atelier e' JS (altra sessione); navigazione con referrer
  await p.evaluate(() => { location.href = '/atelier/parliamone'; }); await ready(p);
  rec(scn, '/atelier/parliamone opens in Italian', await lang(p) === 'it', p.url(), true);
  const logo = p.locator('a.nav-logo-img').first();
  const lh = await logo.getAttribute('href');
  if (mobile) await p.evaluate(h => { location.href = h; }, lh); else await logo.click();
  await ready(p);
  rec(scn, 'back to main site via logo stays Italian', await lang(p) === 'it', lh + ' -> ' + p.url(), true);
  await ctx.close();
}

async function capitoli(b){
  const scn = '/atelier/capitoli';
  const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/atelier/capitoli?lang=it'); await ready(p);
  rec(scn, '?lang=it in en-US browser stays Italian', await lang(p) === 'it' && q(p, 'lang') === 'it', p.url());
  const links = () => p.$$eval('#nav a[href], #torna, #preventivo', as => as.map(a => a.getAttribute('href')));
  const okAll = (hs, l) => hs.length >= 10 && hs.every(h => new RegExp('[?&]lang=' + l + '\\b').test(h));
  rec(scn, 'IT: all links carry lang=it', okAll(await links(), 'it'), (await links()).join(' '));
  await p.click('#lang-en'); await p.waitForTimeout(300);
  const en = await links();
  rec(scn, 'EN: URL + links lang=en, da= and hash kept', q(p, 'lang') === 'en' && okAll(en, 'en') && en.some(h => h.includes('da=effetti-speciali')) && en.some(h => h.endsWith('#preventivo')), en.join(' '));
  await p.click('#lang-it'); await p.waitForTimeout(300);
  rec(scn, 'back to IT: URL ?lang=it (not deleted) + links lang=it', q(p, 'lang') === 'it' && okAll(await links(), 'it'), p.url());
  await ctx.close();
}

async function enPath(b){
  const scn = 'EN path / toggle';
  const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/'); await ready(p);
  const txt = () => p.evaluate(() => document.body.innerText.slice(0, 4000));
  const enTxt = await txt();
  await p.click('#lang-it'); await p.waitForTimeout(300);
  const itTxt = await txt();
  await p.click('#lang-en'); await p.waitForTimeout(300);
  const enTxt2 = await txt();
  rec(scn, 'IT/EN toggle translates the page', enTxt !== itTxt && enTxt2 === enTxt && q(p, 'lang') === 'en');
  const h = await p.getAttribute('#n-wc', 'href');
  rec(scn, 'ATELIER link carries lang=en', /[?&]lang=en\b/.test(h), h);
  await p.click('#n-wc'); await ready(p);
  rec(scn, 'atelier opens in English', await lang(p) === 'en', p.url());
  // senza parametro e con browser italiano: italiano, e il link porta lang=it
  const c2 = await b.newContext({ locale: 'it-IT' }); const p2 = await c2.newPage();
  await p2.goto(BASE + '/'); await ready(p2);
  rec(scn, 'no param + it-IT browser -> Italian, links lang=it', await lang(p2) === 'it' && /lang=it/.test(await p2.getAttribute('#n-wc', 'href')));
  await c2.close(); await ctx.close();
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  for (const path of ['/', '/sabe', '/atlas']) await mainFlow(b, path, false);
  await mainFlow(b, '/', true);
  await capitoli(b);
  await enPath(b);
  await b.close();
  const mine = res.filter(r => !r.other), other = res.filter(r => r.other);
  console.log('\nOwn checks: ' + mine.filter(r => r.ok).length + '/' + mine.length + ' pass; other-session checks: ' + other.filter(r => r.ok).length + '/' + other.length + ' pass');
  process.exitCode = mine.every(r => r.ok) ? 0 : 1;
})();
