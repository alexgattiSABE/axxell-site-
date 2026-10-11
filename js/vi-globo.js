import { riduci } from './utili.js';
import { STRATI } from './vi-terre.js';

// Dove stiamo andando: un globo a puntini, con le terre emerse vere (Natural Earth) e un reticolo leggero.
// Prima l'Italia da vicino: i suoi puntini si colorano a ondata partendo da Milano. Poi la vista si allarga
// sull'Europa e da Milano partono uno alla volta archi colorati verso le capitali, che all'arrivo si accendono con un
// anello (e si accende il loro nome nella roadmap accanto). Poi la vista si allarga sul globo intero, che gira verso est:
// gli archi, più alti, arrivano alle città del mondo. Dopo l'ultima una pausa, gli archi sfumano, la vista torna
// sull'Italia e si ricomincia. Fuori schermo si ferma; col movimento ridotto è disegnato fermo sul mondo, tutto acceso.
// Le terre hanno tre griglie (mondo, Europa, Italia): più ci si avvicina, più la griglia è fitta.
const ORIGINE = { lat: 45.46, lon: 9.19 };   // Milano
export const CITTA = [
  { nome: 'Parigi', lat: 48.86, lon: 2.35 }, { nome: 'Madrid', lat: 40.42, lon: -3.7 },
  { nome: 'Berlino', lat: 52.52, lon: 13.4 }, { nome: 'Vienna', lat: 48.21, lon: 16.37 },
  { nome: 'Amsterdam', lat: 52.37, lon: 4.9 }, { nome: 'Lisbona', lat: 38.72, lon: -9.14 },
  { nome: 'Varsavia', lat: 52.23, lon: 21.01 }, { nome: 'Atene', lat: 37.98, lon: 23.73 },
];
// da ovest a est, nell'ordine in cui il globo che gira le porta davanti (Milano resta sempre in vista: niente Oceania,
// che sta dall'altra parte del globo)
export const MONDO = [
  { nome: 'Città del Messico', lat: 19.43, lon: -99.13 }, { nome: 'New York', lat: 40.71, lon: -74.01 },
  { nome: 'San Paolo', lat: -23.55, lon: -46.63 }, { nome: 'Città del Capo', lat: -33.92, lon: 18.42 },
  { nome: 'Dubai', lat: 25.2, lon: 55.27 }, { nome: 'Mumbai', lat: 19.08, lon: 72.88 },
  { nome: 'Singapore', lat: 1.35, lon: 103.82 }, { nome: 'Tokyo', lat: 35.68, lon: 139.69 },
];
const RAD = Math.PI / 180;
// i tre zoom: raggio del globo (in larghezze del riquadro), centro verticale, latitudine e longitudine della vista
const ZOOM = [{ r: 4.2, cy: .5, lat: 42.2, lon: 12.4 }, { r: 1.35, cy: .54, lat: 47, lon: 13 }, { r: .39, cy: .5, lat: 22 }];
// il giro, in ms: Italia → Europa → mondo → pausa → sfuma → torna sull'Italia
const I_RIEMPI = 1800, I_FINE = 3200, APRI_E = 2200, E0 = I_FINE + APRI_E;
const E_INT = 600, E_VOLO = 1000, E_FINE = E0 + 6200, APRI_W = 2400, APERTO = E_FINE + APRI_W;
const W_INT = 900, W_VOLO = 1300, W_ULTIMO = APERTO + (MONDO.length - 1) * W_INT + W_VOLO;
const SOSTA = 2800, SFUMA = 600, CHIUDI = 2800, SPENTO = W_ULTIMO + SOSTA + SFUMA, GIRO = SPENTO + CHIUDI;
const ANELLO = 900, VELOCE = 92 / ((MONDO.length - 1) * W_INT);   // gradi al ms mentre gira sul mondo
const LON_E = ZOOM[1].lon, LON_W = -30 - VELOCE * W_VOLO, LON_FERMO = LON_W + VELOCE * (W_ULTIMO - APERTO) + VELOCE * SOSTA / 2;
const vettore = (lat, lon) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const morbido = u => u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
const fra = (a, b, u) => a + (b - a) * u;
const tra = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const angolo = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
// un punto lungo il cerchio massimo fra a e b (t da 0 a 1)
function lungo(a, b, t) {
  const d = angolo(a, b), s = Math.sin(d) || 1;
  const k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}
// zoom continuo da 0 (Italia) a 2 (mondo): il raggio si interpola in scala logaritmica, così l'allargarsi è regolare
function raggio(z) {
  const i = Math.min(1, Math.floor(z)), u = z - i;
  return Math.exp(fra(Math.log(ZOOM[i].r), Math.log(ZOOM[i + 1].r), u));
}
const centroY = z => z <= 1 ? fra(ZOOM[0].cy, ZOOM[1].cy, z) : fra(ZOOM[1].cy, ZOOM[2].cy, z - 1);
// dove sta la vista al tempo t
function vista(t) {
  if (t < I_FINE) return { z: 0, lat: ZOOM[0].lat, lon: ZOOM[0].lon + 1.5 * t / I_FINE };
  if (t < E0) { const u = morbido((t - I_FINE) / APRI_E); return { z: u, lat: fra(ZOOM[0].lat, ZOOM[1].lat, u), lon: fra(ZOOM[0].lon + 1.5, LON_E, u) }; }
  if (t < E_FINE) return { z: 1, lat: ZOOM[1].lat, lon: fra(LON_E, LON_E - 8, (t - E0) / (E_FINE - E0)) };
  if (t < APERTO) { const u = morbido((t - E_FINE) / APRI_W); return { z: 1 + u, lat: fra(ZOOM[1].lat, ZOOM[2].lat, u), lon: fra(LON_E - 8, LON_W, u) }; }
  if (t < W_ULTIMO) return { z: 2, lat: ZOOM[2].lat, lon: LON_W + VELOCE * (t - APERTO) };
  if (t < W_ULTIMO + SOSTA) { const u = (t - W_ULTIMO) / SOSTA; return { z: 2, lat: ZOOM[2].lat, lon: LON_W + VELOCE * (W_ULTIMO - APERTO) + VELOCE * SOSTA * (u - u * u / 2) }; }
  if (t < SPENTO) return { z: 2, lat: ZOOM[2].lat, lon: LON_FERMO };
  const u = morbido((t - SPENTO) / CHIUDI);
  return { z: 2 - 2 * u, lat: fra(ZOOM[2].lat, ZOOM[0].lat, u), lon: fra(LON_FERMO, ZOOM[0].lon, u) };
}
const faseDi = t => t < I_FINE + APRI_E / 2 || t >= SPENTO ? 'italia' : t < E_FINE + APRI_W / 2 ? 'europa' : 'mondo';

// le terre: per ogni strato i punti (vettori) e quali stanno dentro il riquadro dello strato più fitto
function terre(O) {
  const strati = STRATI.map(s => {
    const t = atob(s.terra), it = atob(s.italia), bit = (b, k) => (b.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1;
    const punti = [];
    for (let r = 0; r < s.nlat; r++) for (let c = 0; c < s.nlon; c++) {
      const k = r * s.nlon + c;
      if (!bit(t, k)) continue;
      const lat = s.lat0 + r * s.dlat, lon = s.lon0 + c * s.dlon;
      punti.push({ lat, lon, v: vettore(lat, lon), italia: !!bit(it, k) });
    }
    return { ...s, punti, lat1: s.lat0 + (s.nlat - 1) * s.dlat, lon1: s.lon0 + (s.nlon - 1) * s.dlon };
  });
  const [mondo, europa, italia] = strati;
  const dentro = (p, s) => p.lat >= s.lat0 && p.lat <= s.lat1 && p.lon >= s.lon0 && p.lon <= s.lon1;
  mondo.punti.forEach(p => { p.coperto = dentro(p, europa); });
  europa.punti.forEach(p => { p.coperto = dentro(p, italia); });
  // l'ondata che colora l'Italia parte da Milano: ogni puntino italiano ha il suo momento
  const lontano = Math.max(...italia.punti.filter(p => p.italia).map(p => angolo(O, p.v)));
  strati.forEach(s => s.punti.forEach(p => { if (p.italia) p.quando = angolo(O, p.v) / lontano * I_RIEMPI; }));
  return strati;
}

export function avviaGlobo() {
  const box = document.getElementById('viGlobo');
  if (!box) return;
  const voci = [...document.querySelectorAll('#viCitta li, #viMondo li')];
  const fasi = [...document.querySelectorAll('.vi-fase')];
  const tela = document.createElement('canvas');
  tela.width = 600; tela.height = 600; tela.setAttribute('aria-hidden', 'true');
  box.append(tela);
  const g = tela.getContext('2d');
  const css = getComputedStyle(document.documentElement), tok = (n, f) => css.getPropertyValue(n).trim() || f;
  const COLORI = [tok('--fuchsia', '#ff1f8f'), tok('--blue', '#1d3cff'), tok('--sistema-nucleo', '#38d6e8'), tok('--volt-deep', '#a9bd00')];
  const INK = tok('--ink', '#0b1033');
  const O = vettore(ORIGINE.lat, ORIGINE.lon);
  const [mondo, europa, italia] = terre(O);
  // l'Italia colorata a fasce, da nord a sud: fucsia, blu, ciano, verde
  const tintaItalia = p => COLORI[p.lat > 45 ? 0 : p.lat > 43 ? 1 : p.lat > 40.6 ? 2 : 3];
  // le mete: prima le europee poi quelle del mondo, ognuna col suo arrivo nel giro e un arco più alto se è lontana
  const mete = [...CITTA.map((c, i) => ({ ...c, parte: E0 + i * E_INT, volo: E_VOLO })), ...MONDO.map((c, j) => ({ ...c, parte: APERTO + j * W_INT, volo: W_VOLO }))]
    .map((m, i) => {
      const v = vettore(m.lat, m.lon);
      return { ...m, v, colore: COLORI[i % 4], alto: Math.min(.17, Math.max(.11, .04 + .1 * angolo(O, v))) };
    });
  const reticolo = [];
  for (let lon = -180; lon < 180; lon += 10) for (let lat = -88; lat <= 88; lat += 1.5) reticolo.push(vettore(lat, lon));
  for (let lat = -80; lat <= 80; lat += 10) for (let lon = -180; lon < 180; lon += 1.5) reticolo.push(vettore(lat, lon));

  let lato = 600, dpr = 1, v = vista(0), tempo = 0, accese = -1, fase = '';
  const misura = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    lato = Math.max(1, Math.round(box.getBoundingClientRect().width));
    tela.width = lato * dpr; tela.height = lato * dpr;
  };
  // vista ortografica: ruota attorno all'asse terrestre di -lon, poi inclina di lat; prof > 0 vuol dire davanti
  const proietta = (p, h = 0) => {
    const l = v.lon * RAD, cl = Math.cos(l), sl = Math.sin(l), b = v.lat * RAD;
    const x = p[0] * cl + p[1] * sl, y = -p[0] * sl + p[1] * cl, z = p[2];
    const px = x * Math.cos(b) + z * Math.sin(b), pz = -x * Math.sin(b) + z * Math.cos(b);
    return { sx: y * (1 + h), sy: -pz * (1 + h), prof: px };
  };
  const aggiorna = t => {
    tempo = t % GIRO; v = vista(tempo);
    const n = tempo >= SPENTO ? 0 : mete.filter(m => tempo >= m.parte + m.volo).length;
    if (n !== accese) { accese = n; box.dataset.accese = String(n); voci.forEach((el, i) => el.classList.toggle('accesa', i < n)); }
    const f = faseDi(tempo);
    if (f !== fase) { fase = f; box.dataset.fase = f; fasi.forEach(el => el.classList.toggle('attiva', el.dataset.fase === f)); }
  };
  const disegna = (ora = 0) => {
    const W = lato * dpr, s = raggio(v.z), R = W * s, cx = W / 2, cy = W * centroY(v.z);
    const alfa = tempo > W_ULTIMO + SOSTA ? Math.max(0, 1 - (tempo - W_ULTIMO - SOSTA) / SFUMA) : 1;
    const colorata = tempo < SPENTO;   // dopo la pausa l'Italia torna scura, e al giro dopo si ricolora
    g.clearRect(0, 0, W, W);
    const luce = g.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R);
    luce.addColorStop(0, 'rgba(255,255,255,.96)'); luce.addColorStop(1, 'rgba(56,214,232,.12)');
    g.fillStyle = luce; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(11,16,51,.14)'; g.lineWidth = dpr; g.stroke();
    // i puntini, raccolti per gruppi di colore e trasparenza: pochi riempimenti invece di migliaia
    const gruppi = new Map();
    const metti = (chiave, colore, a, X, Y, d = dpr * 1.6) => {
      let gr = gruppi.get(chiave);
      if (!gr) gruppi.set(chiave, gr = { colore, a, d, pt: [] });
      gr.pt.push(X, Y);
    };
    const visibile = p3 => {
      const p = proietta(p3);
      if (p.prof <= 0) return null;
      const X = cx + p.sx * R, Y = cy + p.sy * R;
      return X < -4 || Y < -4 || X > W + 4 || Y > W + 4 ? null : { X, Y, k: Math.min(2, Math.floor(p.prof * 3)) };
    };
    for (const p3 of reticolo) { const q = visibile(p3); if (q) metti('r' + q.k, INK, .1 + .07 * q.k, q.X, q.Y); }
    // dissolvenza fra le griglie: la più fitta compare avvicinandosi, e dentro il suo riquadro copre quella più rada
    const aE = tra(s, .7, 1.1), aI = tra(s, 2.2, 3.2);
    let italiani = 0;
    const strato = (st, aCoperto, aLibero) => {
      if (aCoperto <= 0 && aLibero <= 0) return;
      const d = Math.min(2.8 * dpr, Math.max(1.6 * dpr, .38 * st.dlat * RAD * R));   // il puntino segue il passo della griglia
      for (const p of st.punti) {
        const a = p.coperto ? aCoperto : aLibero;
        if (a <= 0) continue;
        const q = visibile(p.v);
        if (!q) continue;
        metti(st.nome + (p.coperto ? 'c' : 'l') + q.k, INK, a * (.45 + .18 * q.k), q.X, q.Y, d);
        if (!p.italia) continue;
        if (a >= .5) italiani++;
        if (colorata && tempo >= p.quando) metti('it' + st.nome + tintaItalia(p) + (p.coperto ? 'c' : 'l'), tintaItalia(p), a * alfa, q.X, q.Y, d);
      }
    };
    strato(mondo, 1 - aE, 1);
    strato(europa, aE * (1 - aI), aE);
    strato(italia, aI, aI);
    for (const gr of gruppi.values()) {
      g.fillStyle = gr.colore; g.globalAlpha = Math.min(1, gr.a);
      g.beginPath();
      const d = gr.d;
      for (let i = 0; i < gr.pt.length; i += 2) g.rect(gr.pt[i] - d / 2, gr.pt[i + 1] - d / 2, d, d);
      g.fill();
    }
    g.globalAlpha = 1; g.lineCap = 'round'; g.lineJoin = 'round';
    if (tempo < SPENTO) for (const m of mete) {
      const fino = Math.min(1, Math.max(0, (tempo - m.parte) / m.volo));
      if (fino <= 0) continue;
      const dietro = Math.min(1, Math.max(0, (proietta(m.v).prof + .3) / .3));   // la meta è passata dietro il globo: l'arco sfuma
      if (dietro <= 0) continue;
      g.strokeStyle = m.colore; g.lineWidth = fra(3, 2.4, Math.max(0, v.z - 1)) * dpr; g.globalAlpha = alfa * dietro;
      g.beginPath();
      let testa = null, giu = true;
      for (let k = 0; k <= 64; k++) {
        const t = k / 64 * fino, p = proietta(lungo(O, m.v, t), m.alto * Math.sin(Math.PI * t));
        if (p.prof <= 0) { giu = true; testa = null; continue; }   // dietro il globo: l'arco si interrompe al bordo
        const X = cx + p.sx * R, Y = cy + p.sy * R;
        if (giu) g.moveTo(X, Y); else g.lineTo(X, Y);
        giu = false; testa = [X, Y];
      }
      g.stroke();
      if (fino < 1 && testa) { g.fillStyle = m.colore; g.beginPath(); g.arc(testa[0], testa[1], 4.5 * dpr, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    for (const m of mete) {
      const p = proietta(m.v);
      if (p.prof <= 0) continue;
      const X = cx + p.sx * R, Y = cy + p.sy * R, a = tempo < SPENTO && tempo >= m.parte + m.volo ? Math.min(1, (tempo - m.parte - m.volo) / ANELLO) : null;
      if (a === null && v.z < .5) continue;   // da vicino sull'Italia le città lontane non servono
      g.fillStyle = a !== null ? m.colore : 'rgba(11,16,51,.35)';
      g.beginPath(); g.arc(X, Y, (a !== null ? fra(5, 4, Math.max(0, v.z - 1)) : 3) * dpr, 0, Math.PI * 2); g.fill();
      if (a !== null && a < 1) {
        g.strokeStyle = m.colore; g.globalAlpha = 1 - a; g.lineWidth = 2 * dpr;
        g.beginPath(); g.arc(X, Y, (6 + 20 * a) * dpr, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    }
    const po = proietta(O);
    if (po.prof > 0) {
      const X = cx + po.sx * R, Y = cy + po.sy * R;
      g.fillStyle = INK; g.beginPath(); g.arc(X, Y, 5.5 * dpr, 0, Math.PI * 2); g.fill();
      if (!riduci) {
        const q = (ora % 1600) / 1600;
        g.strokeStyle = INK; g.globalAlpha = 1 - q; g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.arc(X, Y, (7 + 16 * q) * dpr, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    }
    // l'oblò: sempre tondo; da vicino i bordi sfumano larghi nel bianco della carta, aprendosi sul mondo la sfumatura
    // si stringe al bordo, dove il globo intero ci sta dentro
    const bordo = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    bordo.addColorStop(0, '#000'); bordo.addColorStop(fra(.78, .97, Math.max(0, v.z - 1)), '#000'); bordo.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = bordo; g.fillRect(0, 0, W, W);
    g.globalCompositeOperation = 'source-over';
    box.dataset.giro = v.lon.toFixed(3);
    box.dataset.zoom = v.z.toFixed(3);
    box.dataset.italia = String(italiani);
  };

  misura();
  new ResizeObserver(() => { misura(); disegna(); }).observe(box);   // misura vera anche quando il riquadro prende la sua larghezza dopo
  if (riduci) { aggiorna(W_ULTIMO + ANELLO); v = { z: 2, lat: 22, lon: 30 }; disegna(); return; }
  aggiorna(0); disegna();
  let corso = 0, ultimo = 0, raf = 0;
  const frame = t => {
    corso += ultimo ? Math.min(50, t - ultimo) : 16; ultimo = t;
    aggiorna(corso); disegna(corso);
    raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !raf) { ultimo = 0; raf = requestAnimationFrame(frame); }
    else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
  }).observe(box);
}
