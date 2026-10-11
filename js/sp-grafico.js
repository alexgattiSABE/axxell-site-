import { riduci } from './utili.js';

// I costi nel tempo: mese per mese quanto si è speso in tutto con una receptionist (costo dell'anno del Ministero del Lavoro
// spalmato sui 12 mesi) e con SABE Light (149 € al mese). Le due linee si disegnano quando il grafico arriva in vista,
// lo spazio fra le due è il risparmio; passando col mouse (o col dito) si leggono i valori del mese.
// sul telefono le scritte dell'asse sono più grandi (css): più margine a sinistra, il grafico fino in fondo e niente «mesi»
const stretto = matchMedia('(max-width:640px)').matches;
const W = 800, H = 320, X0 = stretto ? 150 : 64, X1 = stretto ? 780 : 650, Y0 = 24, Y1 = 280, MAX = 35000;   // unità della viewBox
const x = m => X0 + (X1 - X0) * m / 12, y = v => Y1 - (Y1 - Y0) * v / MAX;
const euro = n => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;

export function avviaGrafico() {
  const box = document.getElementById('spGrafico');
  if (!box) return;
  const persona = +box.dataset.anno / 12, sabe = +box.dataset.mese, punto = box.querySelector('.sp-grafico-punto');
  const mesi = [...Array(13).keys()];
  const linea = v => mesi.map(m => `${m ? 'L' : 'M'}${x(m).toFixed(1)} ${y(v * m).toFixed(1)}`).join(' ');
  const area = `M${x(0)} ${y(0)} L${x(12)} ${y(persona * 12)} L${x(12)} ${y(sabe * 12)} Z`;
  const griglia = [0, 10000, 20000, 30000].map(v => `<line class="sp-g-griglia" x1="${X0}" x2="${X1}" y1="${y(v)}" y2="${y(v)}"/><text class="sp-g-asse" x="${X0 - 10}" y="${y(v) + 4}" text-anchor="end">${v ? `${v / 1000}.000 €` : '0'}</text>`).join('');
  const tacche = mesi.filter(m => m).map(m => `<text class="sp-g-asse" x="${x(m)}" y="${Y1 + 22}" text-anchor="middle">${m}</text>`).join('');
  box.querySelector('.sp-grafico-tela').innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-x0="${X0}" data-x1="${X1}" role="img" aria-label="In 12 mesi una receptionist costa ${euro(persona * 12)}, SABE Light ${euro(sabe * 12)}">
    ${griglia}${tacche}${stretto ? '' : `<text class="sp-g-asse" x="${X1}" y="${Y1 + 40}" text-anchor="end">mesi</text>`}
    <path class="sp-g-area" d="${area}"/>
    <path class="sp-g-linea sp-g-persona" d="${linea(persona)}" pathLength="1"/>
    <path class="sp-g-linea sp-g-sabe" d="${linea(sabe)}" pathLength="1"/>
    <text class="sp-g-fine" x="${X1 + 14}" y="${y(persona * 12) + 5}"><tspan>Receptionist</tspan><tspan x="${X1 + 14}" dy="20" class="sp-g-cifra">${euro(persona * 12)}</tspan></text>
    <text class="sp-g-fine" x="${X1 + 14}" y="${y(sabe * 12) - 18}"><tspan>SABE Light</tspan><tspan x="${X1 + 14}" dy="20" class="sp-g-cifra">${euro(sabe * 12)}</tspan></text>
    <text class="sp-g-risparmio" x="${x(8.6)}" y="${y((persona + sabe) * 4.6)}" text-anchor="middle">${euro((persona - sabe) * 12)} di differenza</text>
    <g class="sp-g-guida"><line y1="${Y0}" y2="${Y1}"/><circle class="sp-g-persona" r="6"/><circle class="sp-g-sabe" r="6"/></g>
    <rect class="sp-g-tocco" x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}"/>
  </svg>`;
  const svg = box.querySelector('svg'), guida = svg.querySelector('.sp-g-guida');
  const [gl, gp, gs] = guida.children;

  const mostra = m => {
    const xm = x(m);
    gl.setAttribute('x1', xm); gl.setAttribute('x2', xm);
    gp.setAttribute('cx', xm); gp.setAttribute('cy', y(persona * m));
    gs.setAttribute('cx', xm); gs.setAttribute('cy', y(sabe * m));
    punto.innerHTML = `<b>${m === 1 ? 'Dopo 1 mese' : `Dopo ${m} mesi`}</b><span><i class="sp-g-persona"></i>Receptionist ${euro(persona * m)}</span><span><i class="sp-g-sabe"></i>SABE Light ${euro(sabe * m)}</span>`;
  };
  // dal punto toccato al mese più vicino
  const daEvento = e => {
    const r = svg.getBoundingClientRect(), ux = (e.clientX - r.left) * W / r.width;
    return Math.max(1, Math.min(12, Math.round((ux - X0) / (X1 - X0) * 12)));
  };
  svg.addEventListener('pointermove', e => mostra(daEvento(e)));
  svg.addEventListener('pointerdown', e => mostra(daEvento(e)));
  svg.addEventListener('pointerleave', () => mostra(12));
  mostra(12);

  if (riduci) { box.classList.add('disegnato'); return; }
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    box.classList.add('disegnato');
  }, { threshold: .4 }).observe(box);
}
