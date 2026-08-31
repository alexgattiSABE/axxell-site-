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
const DEFAULT_OUT = '/Users/alexgatti/axxell-site-/.superpowers/sdd/2026-08-31-robot-cervello-vesper/task1-robot.png';
// Estensioni Task 2 (minime, sopra l'harness invariato di Task 1):
//  - ROBOT_SHOT_OUT: path dello screenshot (default: task1-robot.png)
//  - ROBOT_SHOT_DEBUG_PARTS=1: setta window.__debugParts=true PRIMA che
//    robot.js monti (per la tinteggiatura head/body/arm di Step 3)
//  - ROBOT_SHOT_ANGLE=34: ruota il gruppo del robot di 45° su Y prima
//    dello screenshot (vista 3/4), invece del fronte di default
// Estensioni Task 3 (minime, sopra l'harness invariato di Task 1/2):
//  - ROBOT_SHOT_ROT_DEG=<n>: ruota il gruppo `wrap` di n gradi su Y prima
//    dello screenshot (generalizza ROBOT_SHOT_ANGLE=34, che resta un
//    alias per 45° per compatibilità)
//  - ROBOT_SHOT_OPEN=<0..1>: forza window.__robot.glass.uniforms.uOpen
//    al valore dato prima dello screenshot (materiale vetro, Task 3)
//  - ROBOT_SHOT_FOCUS_HEAD=1: prima di ruotare/impostare uOpen, sposta la
//    camera (fissa, stesso schema di ANGLE_34/ROT_DEG che invece ruotano
//    `wrap`) a inquadrare da vicino il solo bbox di parts.head, così la
//    verifica del materiale vetro non dipende dall'inquadratura a corpo
//    intero decisa in Task 1. Applicato PRIMA della rotazione, cosà la
//    rotazione via ROT_DEG porta la testa già inquadrata "di taglio"
//    rispetto a una camera che resta ferma — stessa logica dell'interazione
//    reale (camera ferma, il gruppo ruota).
// Estensioni Task 4 (la testa segue il cursore):
//  - ROBOT_SHOT_POINTER=<left|center|right|-1..1>: muove il mouse REALE
//    (page.mouse.move, non un evento sintetico iniettato) sopra
//    #wcRobotStage prima dello screenshot, a una frazione orizzontale
//    dello stage (left=-0.85, center=0, right=0.85, o un numero -1..1
//    esplicito), poi aspetta la convergenza dello smoothing esponenziale
//    di robot.js (headGroup.rotation e faceAmount, entrambi *=0.12/0.08
//    per frame) prima di screenshottare. Applicato DOPO FOCUS_HEAD/ROT_DEG
//    (stessa camera ferma, l'evento mousemove reale bubbla fino al
//    listener su #wcRobotStage in robot.js).
const OUT_SHOT = process.env.ROBOT_SHOT_OUT || DEFAULT_OUT;
const DEBUG_PARTS = process.env.ROBOT_SHOT_DEBUG_PARTS === '1';
const ANGLE_34 = process.env.ROBOT_SHOT_ANGLE === '34';
const ROT_DEG = process.env.ROBOT_SHOT_ROT_DEG !== undefined
  ? Number(process.env.ROBOT_SHOT_ROT_DEG)
  : (ANGLE_34 ? 45 : null);
const OPEN_VAL = process.env.ROBOT_SHOT_OPEN !== undefined
  ? Number(process.env.ROBOT_SHOT_OPEN)
  : null;
const FOCUS_HEAD = process.env.ROBOT_SHOT_FOCUS_HEAD === '1';
const POINTER_RAW = process.env.ROBOT_SHOT_POINTER;
let POINTER_FRAC = null; // frazione orizzontale -1..1, null = nessun movimento
if (POINTER_RAW === 'left') POINTER_FRAC = -1;
else if (POINTER_RAW === 'center') POINTER_FRAC = 0;
else if (POINTER_RAW === 'right') POINTER_FRAC = 1;
else if (POINTER_RAW !== undefined && !Number.isNaN(Number(POINTER_RAW))) POINTER_FRAC = Number(POINTER_RAW);

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

    // Task 2: se richiesto, setta il flag PRIMA che qualunque script di
    // pagina giri (addInitScript esegue ad ogni navigazione, prima del
    // <script> della pagina) — robot.js lo legge dentro mount(), che
    // scatta molto più tardi (IntersectionObserver), quindi arriva in
    // tempo comunque; addInitScript resta il modo pulito per farlo.
    if (DEBUG_PARTS) {
      await page.addInitScript(() => { window.__debugParts = true; });
    }

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

    // Task 3: inquadra da vicino la testa (bbox di parts.head), camera
    // ferma — PRIMA di applicare la rotazione, così ROT_DEG ruota la testa
    // già inquadrata rispetto a una camera fissa (stesso schema
    // dell'interazione reale: la camera non si muove, ruota il modello).
    if (FOCUS_HEAD) {
      await page.evaluate(() => {
        if (!window.__robot || !window.__robot.parts || !window.__robot.camera) return;
        var box = new THREE.Box3();
        window.__robot.parts.head.forEach(function (m) { box.union(new THREE.Box3().setFromObject(m)); });
        var center = box.getCenter(new THREE.Vector3());
        var size = box.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z);
        var cam = window.__robot.camera;
        var dist = maxDim * 2.3;
        cam.position.set(center.x, center.y, center.z + dist);
        cam.lookAt(center);
        cam.near = Math.max(0.01, dist / 1000);
        cam.far = dist * 20;
        cam.updateProjectionMatrix();
      });
    }

    // Task 2/3: vista ruotata — ruota il gruppo `wrap` (non la camera: più
    // semplice, e non tocca near/far calcolati su model space) di N gradi
    // su Y prima dello screenshot finale (default Task 2: 45° fisso via
    // ROBOT_SHOT_ANGLE=34; Task 3: qualunque angolo via ROBOT_SHOT_ROT_DEG,
    // per portare la testa "di taglio" rispetto alla camera).
    if (ROT_DEG !== null && !Number.isNaN(ROT_DEG)) {
      await page.evaluate((deg) => {
        if (window.__robot && window.__robot.wrap) window.__robot.wrap.rotation.y = deg * Math.PI / 180;
      }, ROT_DEG);
    }

    // Task 4: muove il mouse reale sopra lo stage a una frazione
    // orizzontale data (left/center/right) e aspetta che lo smoothing
    // esponenziale di robot.js converga (headGroup.rotation.{x,y} e
    // state.faceAmount, entrambi si avvicinano al target di ~12%/8% per
    // frame) prima dello screenshot finale.
    if (POINTER_FRAC !== null) {
      // Il canvas dello stage non è liberamente hoverabile su tutto il
      // riquadro: .wc-robot-copy (testo, z-index:2, allineato in basso via
      // align-items:flex-end sul contenitore) sta SOPRA al canvas e ne
      // intercetta i mousemove nei due terzi inferiori del lato sinistro
      // (verificato campionando elementFromPoint su una griglia: sotto
      // ~40% di altezza, il canvas risponde solo da ~metà larghezza in
      // poi). Il terzo superiore del viewport invece è libero su TUTTA la
      // larghezza — è lì che simuliamo left/center/right, altrimenti un
      // mouse.move "a sinistra" finirebbe sopra la card di testo: nessun
      // evento raggiungerebbe il listener su #wcRobotStage (mousemove non
      // bubbla da un elemento non discendente) e la testa non si muoverebbe.
      const vw = await page.evaluate(() => window.innerWidth);
      const vh = await page.evaluate(() => window.innerHeight);
      const px = vw * (0.5 + POINTER_FRAC * 0.44); // 0.44 = margine di sicurezza dai bordi
      const py = vh * 0.22; // banda alta, libera su tutta la larghezza
      await page.mouse.move(px, py, { steps: 12 });
      // Convergenza dello smoothing esponenziale di robot.js
      // (headGroup.rotation.{x,y} += (target-current)*0.12 per frame,
      // faceAmount analogo): in headless/swiftshader il refresh rate del
      // loop rAF è più lento del normale, 1.8s dà largo margine.
      await page.waitForTimeout(1800);
    }

    // Un giro di render in più prima dello screenshot.
    await page.waitForTimeout(400);

    // Task 3: forza l'uniform uOpen del vetro testa (0=chiuso/scuro,
    // 1=aperto/trasparente) subito prima dello screenshot, per isolare
    // l'effetto dal materiale. Da Task 4 in poi il loop di robot.js pilota
    // uOpen ogni frame verso state.faceAmount (interazione reale) — un
    // valore forzato qui viene quindi eroso nei frame successivi, non è
    // più "stabile" come lo era prima di Task 4. Applicato per ULTIMO, con
    // un'attesa breve (una manciata di frame, non 400ms) per limitare la
    // deriva mantenendo comunque un render fresco col valore appena forzato.
    if (OPEN_VAL !== null && !Number.isNaN(OPEN_VAL)) {
      await page.evaluate((v) => {
        if (window.__robot && window.__robot.glass) window.__robot.glass.uniforms.uOpen.value = v;
      }, OPEN_VAL);
      await page.waitForTimeout(80);
    }

    // Task 4: stato diagnostico (rotazione testa, faceAmount, uOpen) —
    // stampato SEMPRE (non solo con POINTER) così anche i run Task 1/2/3
    // possono leggerlo senza rompere l'output esistente.
    const robotState = await page.evaluate(() => {
      const r = window.__robot;
      if (!r) return null;
      return {
        headRotY: r.headGroup ? r.headGroup.rotation.y : null,
        headRotX: r.headGroup ? r.headGroup.rotation.x : null,
        faceAmount: r.state ? r.state.faceAmount : null,
        uOpen: r.glass ? r.glass.uniforms.uOpen.value : null,
      };
    });

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
    if (robotState) {
      console.log('--- ROBOT STATE (Task 4) ---', JSON.stringify(robotState));
    }
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
