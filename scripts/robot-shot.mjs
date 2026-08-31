#!/usr/bin/env node
/* Harness di verifica per CAP 05 (robot 3D, Task 1).
 *
 * Serve website-creation/ su una porta effimera, apre la home in Chromium
 * (swiftshader, headless), porta #cap05 in vista, aspetta che window.__robot
 * compaia (il modello caricato), registra TUTTE le richieste di rete e i
 * messaggi di console, e screenshotta lo stage.
 *
 * Esce con codice 1 se:
 *  - compare una richiesta verso spline.design o unpkg (a runtime);
 *  - la console riporta un errore;
 *  - window.__robot non compare entro il timeout.
 *
 * Uso: da ~/axxell-chatbot (per risolvere il require('playwright') locale)
 *   cd ~/axxell-chatbot && node ~/axxell-site-/scripts/robot-shot.mjs
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/alexgatti/axxell-chatbot/node_modules/');
const { chromium } = require('playwright');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// index.html ha <base href="/website-creation/">: il sito si aspetta di
// essere servito dalla RADICE del repo (non da dentro website-creation/),
// altrimenti tutti i path assoluti (css/js/assets) risolvono male.
const SITE_ROOT = path.resolve(__dirname, '..');
const OUT_SHOT = '/Users/alexgatti/axxell-site-/.superpowers/sdd/2026-08-31-robot-cervello-vesper/task1-robot.png';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.splinecode': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
};

function serve(root){
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const filePath = path.join(root, urlPath);
        if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function main(){
  if (!fs.existsSync(path.join(SITE_ROOT, 'website-creation', 'index.html'))) {
    console.error('FATAL: sito non trovato sotto', SITE_ROOT);
    process.exit(1);
  }

  const server = await serve(SITE_ROOT);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/website-creation/`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const hosts = new Set();
  const requestUrls = [];
  const consoleMsgs = [];
  const pageErrors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    page.on('request', (req) => {
      try {
        const u = new URL(req.url());
        hosts.add(u.host);
        requestUrls.push(req.url());
      } catch (_) { /* non-http scheme, ignore */ }
    });

    page.on('console', (msg) => {
      consoleMsgs.push({ type: msg.type(), text: msg.text() });
    });

    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    await page.goto(base, { waitUntil: 'load', timeout: 30000 });

    // La home ha un sipario d'ingresso (js/loader.js) che tiene Lenis fermo
    // (`WC.lenis.stop()`) finché l'animazione non finisce e non spara
    // `wc:loaded` / `WC.loaded = true`. Uno scroll programmato PRIMA di quel
    // momento non ha effetto (Lenis ignora scrollTo mentre è stopped).
    let curtainDone = false;
    const curtainDeadline = Date.now() + 15000;
    while (Date.now() < curtainDeadline) {
      curtainDone = await page.evaluate(() => !!(window.WC && window.WC.loaded));
      if (curtainDone) break;
      await page.waitForTimeout(150);
    }

    // Porta #cap05 in vista: passa da WC.lenis.scrollTo (come fa già
    // js/tunnel.js per lo scroll programmato) così Lenis e ScrollTrigger
    // restano sincronizzati; un window.scrollTo/scrollIntoView nudo si sfasa
    // da Lenis che, al frame dopo, riporta lo scroll dove pensa di essere.
    await page.evaluate(() => {
      const el = document.getElementById('cap05');
      if (!el) return;
      if (window.WC && window.WC.lenis) window.WC.lenis.scrollTo(el, { immediate: true });
      else el.scrollIntoView({ block: 'center' });
    });

    // Aspetta window.__robot (poll, timeout ~30s)
    let robotReady = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      robotReady = await page.evaluate(() => !!(window.__robot && window.__robot.model));
      if (robotReady) break;
      await page.waitForTimeout(250);
    }

    // Un giro di render in più prima dello screenshot.
    await page.waitForTimeout(400);

    // NB: page.screenshot() (viewport, senza scroll) e non elementHandle
    // .screenshot() — quest'ultimo scrolla l'elemento in vista DA SOLO con
    // uno scroll nativo, che sfasa di nuovo Lenis/ScrollTrigger e riporta a
    // schermo la sezione sbagliata (verificato: mostrava l'hero cap01).
    fs.mkdirSync(path.dirname(OUT_SHOT), { recursive: true });
    await page.screenshot({ path: OUT_SHOT });

    // ---- Report ----
    const hostList = Array.from(hosts).sort();
    const forbidden = hostList.filter((h) => /spline\.design$/i.test(h) || /(^|\.)unpkg\.com$/i.test(h));
    const consoleErrors = consoleMsgs.filter((m) => m.type === 'error');

    console.log('--- HOST CONTATTATI ---');
    hostList.forEach((h) => console.log(' -', h));
    console.log('--- CONSOLE ---');
    if (consoleMsgs.length === 0) console.log(' (nessun messaggio)');
    consoleMsgs.forEach((m) => console.log(` [${m.type}] ${m.text}`));
    if (pageErrors.length) {
      console.log('--- PAGE ERRORS ---');
      pageErrors.forEach((e) => console.log(' -', e));
    }
    console.log('--- SIPARIO (WC.loaded) ---', curtainDone ? 'FATTO' : 'MAI (timeout)');
    console.log('--- WINDOW.__ROBOT ---', robotReady ? 'PRESENTE' : 'ASSENTE');
    console.log('--- SCREENSHOT ---', OUT_SHOT);

    let failed = false;
    if (forbidden.length) {
      console.error('FAIL: host runtime vietati contattati:', forbidden.join(', '));
      failed = true;
    }
    if (consoleErrors.length) {
      console.error('FAIL: errori in console:', consoleErrors.map((m) => m.text).join(' | '));
      failed = true;
    }
    if (pageErrors.length) {
      console.error('FAIL: errori di pagina (uncaught):', pageErrors.join(' | '));
      failed = true;
    }
    if (!robotReady) {
      console.error('FAIL: window.__robot non è comparso entro il timeout');
      failed = true;
    }

    if (failed) {
      process.exitCode = 1;
    } else {
      console.log('OK: robot montato, nessun host vietato, console pulita.');
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
