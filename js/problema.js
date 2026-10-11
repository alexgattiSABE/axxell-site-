import { riduci } from './utili.js';

// Problema e soluzione: i pezzi sparsi (il problema) si ricompongono nella piattaforma (la soluzione) e poi si ricomincia.
// Gira solo quando si vede; col movimento ridotto resta ferma la soluzione.
const PROBLEMA = 2800, SOLUZIONE = 4600;   // ms per fase

// il problema: dove stanno i pezzi (centro, rotazione) e quali collegamenti ci sono fra loro, tutti interrotti a metà.
// Le linee si calcolano da qui, così partono e arrivano sempre sul bordo dei pezzi.
const W = 222, H = 44, SC = .8;   // misure del pezzo e quanto si rimpicciolisce nel problema
const SPARSI = { telefono: [104, 42, -8], agenda: [336, 64, 7], comande: [118, 152, 4], magazzino: [330, 178, -6], email: [100, 276, 7], whatsapp: [334, 294, -4] };
const LEGAMI = [['telefono', 'agenda'], ['telefono', 'comande'], ['agenda', 'magazzino'], ['comande', 'email'], ['magazzino', 'whatsapp'], ['email', 'whatsapp']];

// il punto in cui la linea dal centro esce dal pezzo (ruotato e rimpicciolito)
function bordo([cx, cy, r], ux, uy) {
  const a = -r * Math.PI / 180, lx = ux * Math.cos(a) - uy * Math.sin(a), ly = ux * Math.sin(a) + uy * Math.cos(a);
  const d = Math.min((W / 2 * SC) / Math.abs(lx || 1e-6), (H / 2 * SC) / Math.abs(ly || 1e-6));
  return [cx + ux * d, cy + uy * d];
}

function disegnaLegami(ps) {
  ps.querySelectorAll('.pezzo').forEach(el => {
    const [cx, cy, r] = SPARSI[el.className.match(/p-(\w+)/)[1]];
    el.style.setProperty('--x1', `${cx - W / 2}px`); el.style.setProperty('--y1', `${cy - H / 2}px`); el.style.setProperty('--r1', `${r}deg`);
  });
  const X = '<path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5"/>';
  ps.querySelector('.ps-rotture').innerHTML = LEGAMI.map(([a, b], k) => {
    const A = SPARSI[a], B = SPARSI[b], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
    const [x1, y1] = bordo(A, ux, uy), [x2, y2] = bordo(B, -ux, -uy);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, g = 13;   // l'interruzione a metà, con la ×
    const f = n => n.toFixed(1);
    return `<g class="ps-legame" data-a="${a}" data-b="${b}" data-x1="${f(x1)}" data-y1="${f(y1)}" data-x2="${f(x2)}" data-y2="${f(y2)}" style="--k:${k}">
      <path class="filo" pathLength="1" d="M${f(x1)} ${f(y1)} L${f(mx - ux * g)} ${f(my - uy * g)}"/>
      <path class="filo" pathLength="1" d="M${f(x2)} ${f(y2)} L${f(mx + ux * g)} ${f(my + uy * g)}"/>
      <circle class="aggancio" cx="${f(x1)}" cy="${f(y1)}" r="3.5"/><circle class="aggancio" cx="${f(x2)}" cy="${f(y2)}" r="3.5"/>
      <g class="rotto" transform="translate(${f(mx)} ${f(my)})"><circle r="9"/>${X}</g></g>`;
  }).join('');
}

export function avviaProblema() {
  const ps = document.querySelector('.ps');
  if (!ps) return;
  const palco = ps.querySelector('.ps-palco');
  disegnaLegami(ps);
  // il palco è disegnato a 440px: si rimpicciolisce quando la colonna è più stretta
  new ResizeObserver(() => palco.style.setProperty('--s', Math.min(1, palco.clientWidth / 440).toFixed(3))).observe(palco);
  if (riduci) return;

  let visibile = false, timer = 0;
  const passa = fase => {
    ps.dataset.fase = fase;
    timer = setTimeout(() => { if (visibile) passa(fase === 'problema' ? 'soluzione' : 'problema'); }, fase === 'problema' ? PROBLEMA : SOLUZIONE);
  };
  new IntersectionObserver(([e]) => {
    visibile = e.isIntersecting;
    clearTimeout(timer);
    if (visibile) passa('problema');   // ogni volta che torna in vista si riparte dal problema
  }, { threshold: .35 }).observe(palco);
}
