import { riduci } from './utili.js';

// L'occhio che osserva: la barra del food cost sale quando il prezzo del salmone cambia, e lo storico delle consegne
// con la proiezione della settimana dopo. La proiezione è quella di ANIMA: la media delle ultime settimane (fino a 8),
// fiducia alta da 8 settimane, media da 5, bassa da 3; sotto le 3 non c'è.
// sul telefono il disegno è più alto e stretto, così le etichette restano leggibili (deciso dalla larghezza dello schermo,
// non dal riquadro: in Safari lo script può partire prima che gli stili abbiano dato le misure)
const stretto = matchMedia('(max-width:560px)').matches;
const [W, H, X0, X1] = stretto ? [400, 300, 34, 330] : [800, 300, 56, 690];
const Y0 = 24, Y1 = 250, MIN = 30, MAX = 65;   // unità della viewBox; l'asse parte da 30 per far vedere come cambiano le settimane
const y = v => Y1 - (Y1 - Y0) * (v - MIN) / (MAX - MIN);

const inVistaUnaVolta = (el, classe, soglia = .4) => {
  if (riduci) { el.classList.add(classe); return; }
  new IntersectionObserver(([e], io) => { if (!e.isIntersecting) return; io.disconnect(); el.classList.add(classe); }, { threshold: soglia }).observe(el);
};

export function avviaOcchio() {
  const fc = document.querySelector('.an-fc');
  if (fc) inVistaUnaVolta(fc, 'vista', .5);
  const due = document.querySelector('.an-occhio-due');
  if (due) inVistaUnaVolta(due, 'vista', .3);
  const prezzi = document.querySelector('.an-prezzi');
  if (prezzi) inVistaUnaVolta(prezzi, 'vista', .25);
  const box = document.getElementById('anGrafico');
  if (!box) return;
  const sett = box.dataset.settimane.split(',').map(Number), n = sett.length;
  const ultime = sett.slice(-8), attese = Math.round(ultime.reduce((a, b) => a + b, 0) / ultime.length);
  const fiducia = n >= 8 ? 'alta' : n >= 5 ? 'media' : 'bassa';
  const x = i => X0 + (X1 - X0) * i / n;                   // i = 0…n-1 le settimane passate, n la prossima
  const griglia = [30, 40, 50, 60].map(v => `<line class="sp-g-griglia" x1="${X0}" x2="${X1}" y1="${y(v)}" y2="${y(v)}"/><text class="sp-g-asse" x="${X0 - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const tacche = sett.map((_, i) => (stretto && i % 2) ? '' : `<text class="sp-g-asse" x="${x(i)}" y="${Y1 + 22}" text-anchor="middle">${i - n}</text>`).join('')
    + `<text class="sp-g-asse an-g-dopo" x="${x(n)}" y="${Y1 + 22}" text-anchor="middle">+1</text>`;
  const linea = sett.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  box.querySelector('.sp-grafico-tela').innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Consegne delle ultime ${n} settimane, da ${Math.min(...sett)} a ${Math.max(...sett)}; la prossima settimana circa ${attese}, fiducia ${fiducia}">
    ${griglia}${tacche}<text class="sp-g-asse" x="${X1}" y="${Y1 + 42}" text-anchor="end">settimane</text>
    <rect class="an-g-futuro" x="${(x(n - 1) + x(n)) / 2}" y="${Y0}" width="${X1 - (x(n - 1) + x(n)) / 2}" height="${Y1 - Y0}"/>
    <path class="sp-g-linea an-g-storico" d="${linea}" pathLength="1"/>
    <path class="an-g-proiezione" d="M${x(n - 1).toFixed(1)} ${y(sett[n - 1]).toFixed(1)} L${x(n).toFixed(1)} ${y(attese).toFixed(1)}"/>
    ${sett.map((v, i) => `<circle class="an-g-punto" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="5"/>`).join('')}
    <circle class="an-g-atteso" cx="${x(n).toFixed(1)}" cy="${y(attese).toFixed(1)}" r="7"/>
    <text class="sp-g-fine an-g-etichetta" x="${x(n) + 16}" y="${y(attese) - 4}"><tspan class="sp-g-cifra">${attese} attese</tspan><tspan x="${x(n) + 16}" dy="18">fiducia ${fiducia}</tspan></text>
    <g class="sp-g-guida"><line y1="${Y0}" y2="${Y1}"/><circle class="an-g-anello" r="8"/></g>
    <rect class="sp-g-tocco" x="${X0 - 20}" y="${Y0}" width="${X1 - X0 + 40}" height="${Y1 - Y0}"/>
  </svg>`;
  const svg = box.querySelector('svg'), [gl, gc] = svg.querySelector('.sp-g-guida').children, punto = box.querySelector('.sp-grafico-punto');
  const mostra = i => {
    const v = i === n ? attese : sett[i], xi = x(i);
    gl.setAttribute('x1', xi); gl.setAttribute('x2', xi); gc.setAttribute('cx', xi); gc.setAttribute('cy', y(v));
    punto.innerHTML = i === n
      ? `<b>Prossima settimana</b><span><i class="an-g-i-atteso"></i>circa ${attese} consegne · media delle ultime ${ultime.length} settimane · fiducia ${fiducia}</span>`
      : `<b>Settimana ${i - n}</b><span><i class="an-g-i-storico"></i>${v} consegne</span>`;
  };
  const daEvento = e => {
    const r = svg.getBoundingClientRect(), ux = (e.clientX - r.left) * W / r.width;
    return Math.max(0, Math.min(n, Math.round((ux - X0) / (X1 - X0) * n)));
  };
  svg.addEventListener('pointermove', e => mostra(daEvento(e)));
  svg.addEventListener('pointerdown', e => mostra(daEvento(e)));
  svg.addEventListener('pointerleave', () => mostra(n));
  mostra(n);
  inVistaUnaVolta(box, 'disegnato');
}
