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
// Estensioni Task 5 (cervello dentro la testa):
//  - ROBOT_SHOT_HOLD=<json>: imposta window.__robot.hold prima dello
//    screenshot, un override deterministico che il loop di robot.js consuma
//    quando il puntatore NON è attivo — {"yaw":0.45,"pitch":0}. Serve a
//    mettere la testa in una posa stabile (girata di lato) senza dover
//    combattere l'overlay .wc-robot-copy che intercetta i mousemove al
//    centro dello stage. Applicato dopo che window.__robot è pronto; si
//    attende la convergenza dello smoothing. Nota (Task 5b): un campo
//    "face" nell'oggetto è ora ignorato — il ramo hold di robot.js fa
//    decadere faceAmount a 0 incondizionatamente, il reveal del vetro/brain
//    è pilotato dalla lente Lithos via raycast, non più da faceAmount.
//  - ROBOT_SHOT_VESPER=1: flusso ALTERNATIVO che verifica il capVesper (il
//    cervello di Vesper, da cui il point-brain è estratto) invece del robot:
//    scrolla in capVesper a una frazione del suo range di pin
//    (ROBOT_SHOT_VESPER_FRAC, default 0.8, dove si forma il cervello del
//    terzo atto), lascia girare l'animazione e screenshotta. Salta le attese
//    e le asserzioni specifiche del robot (window.__robot), tiene console/host.
const HOLD_RAW = process.env.ROBOT_SHOT_HOLD;
let HOLD = null;
if (HOLD_RAW !== undefined) {
  try { HOLD = JSON.parse(HOLD_RAW); } catch (_) { console.error('ROBOT_SHOT_HOLD non è JSON valido:', HOLD_RAW); }
}
const VESPER = process.env.ROBOT_SHOT_VESPER === '1';
const VESPER_FRAC = process.env.ROBOT_SHOT_VESPER_FRAC !== undefined
  ? Number(process.env.ROBOT_SHOT_VESPER_FRAC)
  : 0.8;
const POINTER_RAW = process.env.ROBOT_SHOT_POINTER;
let POINTER_FRAC = null; // frazione orizzontale -1..1, null = nessun movimento
if (POINTER_RAW === 'left') POINTER_FRAC = -1;
else if (POINTER_RAW === 'center') POINTER_FRAC = 0;
else if (POINTER_RAW === 'right') POINTER_FRAC = 1;
else if (POINTER_RAW !== undefined && !Number.isNaN(Number(POINTER_RAW))) POINTER_FRAC = Number(POINTER_RAW);
// Estensione Task 5b (lente Lithos sul vetro testa):
//  - ROBOT_SHOT_LENS_POINT="<x>,<y>": muove il mouse REALE (page.mouse.move)
//    a coordinate ASSOLUTE di viewport (px), pensate per cadere SOPRA la
//    proiezione a schermo della testa (a differenza di ROBOT_SHOT_POINTER,
//    pensato per il solo "segue il cursore" e che a left/right cade fuori
//    dalla testa). Applicato DOPO ROBOT_SHOT_POINTER (se entrambi presenti,
//    vince l'ultimo movimento reale, cioè questo), poi aspetta la
//    convergenza dello smoothing esponenziale di uLensActive (0.18/frame).
const LENS_POINT_RAW = process.env.ROBOT_SHOT_LENS_POINT;
let LENS_POINT = null;
if (LENS_POINT_RAW !== undefined) {
  const parts = LENS_POINT_RAW.split(',').map((s) => Number(s.trim()));
  if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) LENS_POINT = { x: parts[0], y: parts[1] };
  else console.error('ROBOT_SHOT_LENS_POINT non è "x,y" valido:', LENS_POINT_RAW);
}
// Estensione Task 6 (fibre luminose nelle braccia):
//  - ROBOT_SHOT_ARM=<left|right>: muove il mouse REALE sopra la proiezione a
//    schermo del gomito (parts.joints.elbowL/elbowR, world→NDC→pixel via la
//    stessa camera/canvas che renderizza lo stage) di quel braccio — a
//    differenza di ROBOT_SHOT_LENS_POINT (pixel assoluti scelti a mano per la
//    testa), qui il punto è CALCOLATO dalla geometria reale, quindi resta
//    valido anche se l'inquadratura cambia. Applicato dopo ROT_DEG/FOCUS_HEAD
//    (stessa camera ferma), poi aspetta la convergenza del surge esponenziale
//    di robot.js (0.15/frame in salita).
const ARM_SIDE = process.env.ROBOT_SHOT_ARM === 'left' ? 'left'
  : (process.env.ROBOT_SHOT_ARM === 'right' ? 'right' : null);
// Estensioni Task 7 (interazione+levitazione+drag+reduced-motion+cleanup):
//  - ROBOT_SHOT_REDUCED=1: emula `prefers-reduced-motion: reduce` PRIMA
//    della navigazione (page.emulateMedia). robot.js deve bailare prima di
//    allocare nulla di WebGL (ctx.motionOk===false, vedi mount()): niente
//    window.__robot, niente <canvas>, resta la card statica con l'hint di
//    fallback. Salta l'attesa/poll di window.__robot (non comparirà mai) e
//    le interazioni via env che seguono (tutte no-op senza __robot).
//  - ROBOT_SHOT_DRAG=<px totali>: dopo il mount normale, simula un vero
//    trascinamento (page.mouse.down/move/up, non un evento sintetico) sulla
//    banda alta dello stage (stessa banda "libera" di ROBOT_SHOT_POINTER,
//    vedi sotto — .wc-robot-copy non la intercetta), muovendo il mouse di
//    <px totali> in orizzontale su alcuni step. Verifica che
//    window.__robot.wrap.rotation.y sia cambiato per davvero attraverso i
//    listener pointerdown/pointermove reali di robot.js — non un override
//    JS diretto.
//  - ROBOT_SHOT_LEAK=1: dopo il mount normale, forza un ciclo
//    teardown+remount USANDO lo stesso meccanismo reale del sito
//    (gsap.matchMedia in core.js si ri-esegue quando cambia l'esito di una
//    query — vedi STATO/core.js): emula reduced-motion (→ teardown di
//    robot.js, la cleanup unificata del Task 7 gira) poi lo disattiva (→
//    nuovo mount da zero). Verifica: nessun canvas duplicato, window.__robot
//    resettato durante il teardown, poi ripopolato dopo il remount, nessun
//    errore di pagina.
const REDUCED = process.env.ROBOT_SHOT_REDUCED === '1';
const DRAG_PX = process.env.ROBOT_SHOT_DRAG !== undefined ? Number(process.env.ROBOT_SHOT_DRAG) : null;
const LEAK_CHECK = process.env.ROBOT_SHOT_LEAK === '1';

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

    // Task 7: reduced-motion PRIMA della navigazione — deve essere la
    // condizione che core.js/robot.js vedono già al primo boot (gsap
    // matchMedia legge `prefers-reduced-motion` all'avvio), non qualcosa
    // che scatta a pagina già caricata.
    if (REDUCED) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }

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
      // location().url porta l'URL della risorsa per i "Failed to load
      // resource" generati dal browser — msg.text() per quei messaggi è
      // un testo generico senza URL (verificato: non basta un match su
      // testo per isolare i 404 noti sotto, serve la location).
      let loc = null;
      try { loc = msg.location(); } catch (_) { /* ignore */ }
      consoleMsgs.push({ type: msg.type(), text: msg.text(), url: loc && loc.url });
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

    let robotReady = false;
    let robotState = null;

    if (VESPER) {
      // ---- Flusso capVesper (Task 5): il cervello di Vesper, da cui il
      // point-brain è estratto. Scrolla in capVesper a una frazione del suo
      // range di pin (dove nel terzo atto si forma il cervello), poi lascia
      // girare l'animazione. Salta l'attesa/asserzione di window.__robot. ----
      await page.evaluate((frac) => {
        const el = document.getElementById('capVesper');
        if (!el) return;
        const top = (window.scrollY || window.pageYOffset || 0) + el.getBoundingClientRect().top;
        const range = Math.max(1, el.offsetHeight - window.innerHeight);
        const y = top + frac * range;
        if (window.WC && window.WC.lenis) window.WC.lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      }, VESPER_FRAC);
      // Il raduno del cervello + il respiro hanno bisogno di qualche secondo.
      await page.waitForTimeout(2800);
    } else {
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

      if (REDUCED) {
        // Task 7: reduced-motion → NIENTE si monta (ctx.motionOk===false in
        // robot.js, controllato prima di qualunque new THREE.WebGLRenderer).
        // window.__robot non comparirà mai: un poll di 30s sarebbe solo
        // tempo sprecato ad aspettare qualcosa che per design non arriva.
        // Un'attesa fissa basta a lasciare girare fail()/l'IntersectionObserver.
        await page.waitForTimeout(2000);
        robotReady = await page.evaluate(() => !!(window.__robot && window.__robot.model));
      } else {
        // Aspetta window.__robot (poll, timeout ~30s)
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          robotReady = await page.evaluate(() => !!(window.__robot && window.__robot.model));
          if (robotReady) break;
          await page.waitForTimeout(250);
        }
      }
    }

    // Task 7: sotto reduced-motion deve restare la card statica — nessun
    // canvas montato, lo stage marcato -failed, l'hint di fallback ancora
    // nel DOM (fail() lo scrive PRIMA di rimuoverlo — hint.remove() gira
    // solo nel percorso di successo del caricamento GLB).
    let staticCardInfo = null;
    if (REDUCED) {
      staticCardInfo = await page.evaluate(() => {
        const stg = document.getElementById('wcRobotStage');
        const hnt = document.getElementById('wcRobotHint');
        return {
          failed: stg ? stg.classList.contains('-failed') : null,
          hint: hnt ? hnt.textContent : null,
          canvasCount: stg ? stg.querySelectorAll('canvas').length : null,
        };
      });
    }

    // Task 7: drag-to-rotate REALE (page.mouse.down/move/up, non un
    // override JS di wrap.rotation.y) — verifica che i listener
    // pointerdown/pointermove di robot.js siano davvero agganciati.
    // Banda alta dello stage, stessa di ROBOT_SHOT_POINTER sopra: libera su
    // tutta la larghezza, .wc-robot-copy non la intercetta lì.
    let dragInfo = null;
    if (DRAG_PX !== null && !Number.isNaN(DRAG_PX) && robotReady) {
      const rotBefore = await page.evaluate(() => (window.__robot && window.__robot.wrap) ? window.__robot.wrap.rotation.y : null);
      const vw = await page.evaluate(() => window.innerWidth);
      const vh = await page.evaluate(() => window.innerHeight);
      const startX = vw * 0.3, y = vh * 0.22;
      await page.mouse.move(startX, y, { steps: 5 });
      await page.mouse.down();
      await page.mouse.move(startX + DRAG_PX, y, { steps: 16 });
      await page.mouse.up();
      // Lascia girare qualche frame di inerzia/ritorno prima di leggere.
      await page.waitForTimeout(300);
      const rotAfter = await page.evaluate(() => (window.__robot && window.__robot.wrap) ? window.__robot.wrap.rotation.y : null);
      dragInfo = { rotBefore, rotAfter };
    }

    // Task 7: leak check — ricicla il meccanismo REALE di teardown/remount
    // (gsap.matchMedia in core.js si ri-esegue quando cambia l'esito di una
    // query — vedi core.js): emula reduced-motion (→ teardown di robot.js,
    // la cleanup unificata del Task 7 gira) poi lo disattiva (→ nuovo mount
    // da zero, l'IntersectionObserver riparte e la sezione è già in vista).
    let leakInfo = null;
    if (LEAK_CHECK && robotReady) {
      const canvasBefore = await page.evaluate(() => document.querySelectorAll('#wcRobotStage canvas').length);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(800); // il 'change' della media query + il teardown sincrono di gsap.matchMedia
      const afterTeardown = await page.evaluate(() => ({
        robotUndefined: window.__robot === undefined,
        canvasCount: document.querySelectorAll('#wcRobotStage canvas').length,
      }));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      // Effetto collaterale NOTO e non specifico del robot: ogni ciclo di
      // gsap.matchMedia in core.js distrugge/ricrea Lenis (destroyLenis()
      // nel cleanup, initLenis() nel nuovo context) — Lenis tiene lo scroll
      // "vero" del browser vicino a 0 e finge lo scroll via CSS, quindi
      // distruggerlo a metà sessione fa scattare window.scrollY al suo
      // valore nativo reale, ben lontano da cap05: l'IntersectionObserver
      // di robot.js smette di vedere la sezione come intersecante (verificato
      // isolando il problema: stesso comportamento su QUALUNQUE sezione
      // WC, non solo il robot) e mount() non riparte finché non arriva un
      // altro scroll. In un browser vero basterebbe lo scroll successivo
      // dell'utente; qui lo si rifà esplicito, stesso schema del mount
      // iniziale sopra.
      await page.evaluate(() => {
        const el = document.getElementById('cap05');
        if (!el) return;
        if (window.WC && window.WC.lenis) window.WC.lenis.scrollTo(el, { immediate: true });
        else el.scrollIntoView({ block: 'center' });
      });
      let remounted = false;
      const remountDeadline = Date.now() + 15000;
      while (Date.now() < remountDeadline) {
        remounted = await page.evaluate(() => !!(window.__robot && window.__robot.model));
        if (remounted) break;
        await page.waitForTimeout(250);
      }
      const afterRemount = await page.evaluate(() => document.querySelectorAll('#wcRobotStage canvas').length);
      leakInfo = { canvasBefore, afterTeardown, remounted, afterRemountCanvasCount: afterRemount };
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

    // Task 5b: muove il mouse REALE su un punto assoluto di viewport pensato
    // per cadere sopra la testa (raycast reale in robot.js, non un override
    // sintetico) — verifica che la lente Lithos si apra lì e segua il
    // cursore fra due scatti diversi.
    if (LENS_POINT) {
      await page.mouse.move(LENS_POINT.x, LENS_POINT.y, { steps: 12 });
      // Convergenza dello smoothing esponenziale di uLensActive
      // (+= (target-current)*0.18 per frame in robot.js).
      await page.waitForTimeout(1800);
    }

    // Task 6: proietta un punto SULLA mesh del braccio richiesto (non sul
    // giunto `elbow*` di WC.robotParts.split: quel giunto è il centro X/Z
    // del bbox dell'INTERO braccio, una linea verticale approssimata che
    // ancora bene le curve delle fibre ma NON segue la piega reale del
    // modello — verificato: un raycast lì per la maggior parte del
    // percorso MANCA la mesh vera, che si piega in X. Il centro del bbox di
    // una singola mesh-braccio invece è affidabile — verificato su tutte e
    // 13 le mesh di un lato, hit garantito. Si sceglie la mesh il cui
    // centro Y è più vicino al gomito (metà del braccio, non spalla/mano)
    // così il punto legge come "cursore a metà braccio".
    if (ARM_SIDE) {
      const pt = await page.evaluate((side) => {
        const r = window.__robot;
        if (!r || !r.parts || !r.camera) return null;
        const arr = side === 'left' ? r.parts.armL : r.parts.armR;
        const joints = r.parts.joints;
        if (!arr || !arr.length || !joints) return null;
        const targetY = (side === 'left' ? joints.elbowL : joints.elbowR).y;
        var best = null, bestDist = Infinity;
        arr.forEach(function (m) {
          var c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
          var d = Math.abs(c.y - targetY);
          if (d < bestDist) { bestDist = d; best = c; }
        });
        if (!best) return null;
        const stage = document.getElementById('wcRobotStage');
        const rect = stage.getBoundingClientRect();
        const ndc = best.clone().project(r.camera);
        return {
          x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (1 - (ndc.y * 0.5 + 0.5)) * rect.height,
        };
      }, ARM_SIDE);
      if (pt) {
        await page.mouse.move(pt.x, pt.y, { steps: 12 });
        // Convergenza del surge esponenziale (+= (1-surge)*0.15 per frame
        // in salita, robot.js) — margine largo come le altre attese sopra.
        await page.waitForTimeout(2200);
      } else {
        console.error('ROBOT_SHOT_ARM: nessun punto sulla mesh trovato per lato', ARM_SIDE);
      }
    }

    // Task 5: posa deterministica della testa (hold) — la testa è girata di
    // lato senza puntatore reale (che l'overlay .wc-robot-copy intercetterebbe
    // al centro). Il loop di robot.js, quando il puntatore non è attivo,
    // consuma window.__robot.hold {yaw,pitch} (un eventuale campo "face" è
    // ignorato dal Task 5b — vedi nota sopra). Si attende la convergenza
    // dello smoothing esponenziale.
    if (HOLD) {
      await page.evaluate((h) => { if (window.__robot) window.__robot.hold = h; }, HOLD);
      await page.waitForTimeout(1800);
    }

    // Un giro di render in più prima dello screenshot.
    await page.waitForTimeout(400);

    // Task 3 (SUPERATO da Task 5b — vedi spec §2/§3, correzione 2026-08-31):
    // forzava l'uniform uOpen del vetro testa. Quell'uniform non esiste più
    // (rimpiazzata dalla lente Lithos uLensActive/uLensPos, guidata dal
    // raycast reale — vedi ROBOT_SHOT_LENS_POINT sopra). ROBOT_SHOT_OPEN
    // resta letto per compatibilità di interfaccia ma non ha più un target
    // da scrivere: guardia esplicita così non lancia (uniforms.uOpen
    // sarebbe undefined) se qualcuno lo passa ancora per abitudine.
    if (OPEN_VAL !== null && !Number.isNaN(OPEN_VAL)) {
      await page.evaluate((v) => {
        if (window.__robot && window.__robot.glass && window.__robot.glass.uniforms.uOpen) {
          window.__robot.glass.uniforms.uOpen.value = v;
        }
      }, OPEN_VAL);
      await page.waitForTimeout(80);
    }

    // Task 4: stato diagnostico (rotazione testa, faceAmount, uOpen) —
    // stampato SEMPRE (non solo con POINTER) così anche i run Task 1/2/3
    // possono leggerlo senza rompere l'output esistente.
    robotState = await page.evaluate(() => {
      const r = window.__robot;
      if (!r) return null;
      return {
        headRotY: r.headGroup ? r.headGroup.rotation.y : null,
        headRotX: r.headGroup ? r.headGroup.rotation.x : null,
        faceAmount: r.state ? r.state.faceAmount : null,
        // Task 5b: uOpen è sparito (glass.js non ha più quell'uniform),
        // sostituito dalla lente Lithos — uLensActive (0..1, smorzato) e il
        // punto colpito in mondo (uLensPos), diagnostica per lo screenshot.
        uLensActive: (r.glass && r.glass.uniforms.uLensActive) ? r.glass.uniforms.uLensActive.value : null,
        uLensPos: (r.glass && r.glass.uniforms.uLensPos) ? r.glass.uniforms.uLensPos.value.toArray() : null,
        uLensRadius: (r.glass && r.glass.uniforms.uLensRadius) ? r.glass.uniforms.uLensRadius.value : null,
        brainAlpha: (r.brain && r.brain.uniforms && r.brain.uniforms.iAlpha) ? r.brain.uniforms.iAlpha.value : null,
        // Task 6: surge delle fibre — letto direttamente dalle uniform dei
        // due ShaderMaterial (uno per braccio, vedi robot-fibers.js), non da
        // uno stato esposto apposta: robot.js tiene surgeL/surgeR chiuse
        // nella closure di tick(), l'unico segnale osservabile da fuori è
        // quello che arriva a fibers.update() ogni frame.
        fiberSurgeL: (r.fibers && r.fibers.object && r.fibers.object.children[0] && r.fibers.object.children[0].children[0])
          ? r.fibers.object.children[0].children[0].material.uniforms.uSurge.value : null,
        fiberSurgeR: (r.fibers && r.fibers.object && r.fibers.object.children[1] && r.fibers.object.children[1].children[0])
          ? r.fibers.object.children[1].children[0].material.uniforms.uSurge.value : null,
        // Task 7: levitazione (bob sinusoidale su Y) + drag (rotation.y)
        // dell'intero robot — diagnostica per lo screenshot finale.
        wrapPosY: r.wrap ? r.wrap.position.y : null,
        wrapRotY: r.wrap ? r.wrap.rotation.y : null,
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
    // Task 7: sotto reduced-motion, `.wc-alt`/`.wc-offer` (altri capitoli,
    // non il robot) passano a un poster CSS statico — `css/sections.css`
    // referenzia `url(assets/starry-poster.webp)`/`glass-poster.webp`
    // RELATIVO AL FILE CSS (quindi risolve a `css/assets/...`), ma i file
    // veri stanno in `website-creation/assets/...`: 404, mai emerso prima
    // perché nessun harness aveva mai esercitato prefers-reduced-motion.
    // Bug pre-esistente, non introdotto da questo task e fuori scope
    // (questo task tocca solo js/robot.js) — escluso qui esplicitamente
    // (non silenziosamente: resta comunque loggato sopra in --- CONSOLE ---)
    // così non si confonde con una regressione del robot. Segnalato nel
    // report come concern.
    const KNOWN_UNRELATED_404 = /starry-poster\.webp|glass-poster\.webp/;
    const consoleErrors = consoleMsgs.filter((m) => m.type === 'error' && !KNOWN_UNRELATED_404.test(m.url || ''));

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
    if (staticCardInfo) {
      console.log('--- STATIC CARD (Task 7, reduced-motion) ---', JSON.stringify(staticCardInfo));
    }
    if (dragInfo) {
      console.log('--- DRAG (Task 7) ---', JSON.stringify(dragInfo));
    }
    if (leakInfo) {
      console.log('--- LEAK CHECK (Task 7) ---', JSON.stringify(leakInfo));
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
    if (!VESPER && !REDUCED && !robotReady) {
      console.error('FAIL: window.__robot non è comparso entro il timeout');
      failed = true;
    }
    if (REDUCED) {
      if (robotReady) {
        console.error('FAIL: reduced-motion ma window.__robot è comparso comunque');
        failed = true;
      }
      if (!staticCardInfo || !staticCardInfo.failed || staticCardInfo.canvasCount !== 0) {
        console.error('FAIL: reduced-motion non mostra la card statica attesa:', JSON.stringify(staticCardInfo));
        failed = true;
      }
    }
    if (dragInfo) {
      if (dragInfo.rotBefore === null || dragInfo.rotAfter === null || dragInfo.rotBefore === dragInfo.rotAfter) {
        console.error('FAIL: il drag non ha ruotato wrap.rotation.y:', JSON.stringify(dragInfo));
        failed = true;
      }
    }
    if (leakInfo) {
      if (!leakInfo.afterTeardown.robotUndefined || leakInfo.afterTeardown.canvasCount !== 0) {
        console.error('FAIL: teardown non pulito (window.__robot o canvas residuo):', JSON.stringify(leakInfo.afterTeardown));
        failed = true;
      }
      if (!leakInfo.remounted) {
        console.error('FAIL: nessun remount dopo il teardown');
        failed = true;
      }
      if (leakInfo.afterRemountCanvasCount !== 1) {
        console.error('FAIL: canvas duplicato/assente dopo il remount:', leakInfo.afterRemountCanvasCount);
        failed = true;
      }
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
