import { riduci, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';
import { euro } from './euro.js';

// «Perché scegliere Axxell?»: il triangolo Affidabile / Semplice / Preciso con Autonomo al centro.
// I lati e i raggi sono flussi: un tratto che scorre e una luce che viaggia da un punto all'altro.
// Le linee si calcolano dalle posizioni vere dei punti, così seguono la pagina a ogni larghezza.
const NS = 'http://www.w3.org/2000/svg';
// lati in senso orario (in cima → destra → sinistra), raggi dal centro verso i tre vertici
const LATI = [['affidabile', 'preciso'], ['preciso', 'semplice'], ['semplice', 'affidabile']];
const RAGGI = [['autonomo', 'affidabile'], ['autonomo', 'semplice'], ['autonomo', 'preciso']];

function avviaTriangolo() {
  const tri = document.getElementById('triangolo');
  if (!tri) return;
  const svg = tri.querySelector('.flussi');

  // sull'anello di Autonomo girano i tre prodotti; la scritta resta dritta
  const orbita = tri.querySelector('.orbita');
  orbita.innerHTML = ['atlas', 'anima', 'sabe'].map((p, k) =>
    `<span class="satellite s-${p}" style="--k:${k}">${copiaMarchio(MARCHI[p], 'orbita' + k)}</span>`).join('');

  const punto = v => tri.querySelector(`.vertice[data-v="${v}"] .punto`);
  // tempi dell'entrata (s): ogni lato parte quando il precedente arriva, i raggi dopo che il centro si è acceso
  const T_LATI = [.15, .6, 1.05], T_RAGGI = 1.45;   // ogni linea si disegna in .45s (css/close.css)
  function disegna() {
    if (getComputedStyle(svg).display === 'none') return;
    svg.setAttribute('viewBox', `0 0 ${tri.offsetWidth} ${tri.offsetHeight}`);
    // posizioni dal layout (offset*), non dal disegno: le entrate spostano i vertici e le linee devono restare ferme
    const centro = v => { const el = punto(v), ve = el.offsetParent, w = el.offsetWidth;
      return { x: ve.offsetLeft + el.offsetLeft + w / 2, y: ve.offsetTop + el.offsetTop + el.offsetHeight / 2, r: w / 2 + 10, pr: w / 2 }; };
    const linee = [], flussi = [], luci = [], onde = [];
    const tratto = ([da, a], k, tipo, t) => {
      const p = centro(da), q = centro(a);
      const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
      const x1 = p.x + ux * p.r, y1 = p.y + uy * p.r, x2 = q.x - ux * q.r, y2 = q.y - uy * q.r;
      const d = `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
      const id = `fl-${tipo}-${k}`, tocca = `${da} ${a}`, parte = `data-da="${da}"`;
      const dur = Math.max(1.4, Math.hypot(x2 - x1, y2 - y1) / 130), b0 = 2 + k * .55;
      linee.push(`<path class="linea ${tipo}" ${parte} data-tocca="${tocca}" d="${d}" pathLength="1" style="--t:${t}"/>`);
      flussi.push(`<path class="flusso ${tipo}" ${parte} data-tocca="${tocca}" id="${id}" d="${d}" style="--k:${k}"/>`);
      if (riduci) return;
      // la cometa: una testa luminosa e una scia che si assottiglia
      luci.push(`<g class="cometa ${tipo}" ${parte} data-tocca="${tocca}">${[4.5, 3.4, 2.5, 1.7, 1.1].map((r, i) =>
        `<circle r="${r}" opacity="${(1 - i * .18).toFixed(2)}"><animateMotion dur="${dur.toFixed(2)}s" begin="${(b0 + i * .05).toFixed(2)}s" repeatCount="indefinite"><mpath href="#${id}"/></animateMotion></circle>`).join('')}</g>`);
      // quando la luce arriva, un'onda si allarga sul vertice
      onde.push(`<circle class="onda ${tipo}" ${parte} data-tocca="${tocca}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${q.pr}" opacity="0">
        <animate attributeName="r" values="${q.pr};${q.pr + 26};${q.pr + 26}" keyTimes="0;.45;1" dur="${dur.toFixed(2)}s" begin="${(b0 + dur).toFixed(2)}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".55;0;0" keyTimes="0;.45;1" dur="${dur.toFixed(2)}s" begin="${(b0 + dur).toFixed(2)}s" repeatCount="indefinite"/></circle>`);
    };
    LATI.forEach((t, k) => tratto(t, k, 'lato', T_LATI[k]));
    RAGGI.forEach((t, k) => tratto(t, k, 'raggio', T_RAGGI));
    svg.innerHTML = `<g class="linee">${linee.join('')}</g><g class="flussi-g">${flussi.join('')}</g><g class="onde">${onde.join('')}</g><g class="luci">${luci.join('')}</g>`;
    // i raggi partono da Autonomo: prendono il colore della scia in quel momento, in fase con lei
    const fase = tri.querySelector('.scia').getAnimations().find(x => x.animationName === 'scia-colore')?.currentTime || 0;
    svg.style.setProperty('--fase', `${-Math.round(fase)}ms`);
  }
  disegna();
  new ResizeObserver(disegna).observe(tri);
  document.fonts?.ready.then(disegna);

  // l'entrata si rifà ogni volta che il triangolo torna su dal basso
  if (!riduci) {
    tri.classList.add('pronto');
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) tri.classList.add('acceso');
      else if (e.boundingClientRect.top > 0) tri.classList.remove('acceso');
    }, { threshold: .25 }).observe(tri);
  }
  // col mouse su un vertice si accendono le sue linee, le altre si attenuano
  tri.querySelectorAll('.vertice').forEach(v => {
    v.addEventListener('pointerenter', () => { tri.dataset.fuoco = v.dataset.v; });
    v.addEventListener('pointerleave', () => { delete tri.dataset.fuoco; });
  });
}

// il calcolo del ritorno: i numeri li mette il visitatore, le ipotesi sono scritte sotto
function avviaCalcolo() {
  const f = document.getElementById('calcolo');
  if (!f) return;
  const SETTIMANE = 4.3;
  const testi = { chiamate: v => v, persone: v => v, spesa: v => euro(v), ore: v => `${v} h`, costo: v => euro(v), acquisti: v => euro(v) };
  const totale = f.querySelector('.stima-totale'), anno = f.querySelector('.stima-anno'), parti = f.querySelector('.stima-parti');
  function calcola() {
    const v = Object.fromEntries([...f.querySelectorAll('input')].map(i => [i.name, +i.value]));
    f.querySelectorAll('input').forEach(i => { i.previousElementSibling.textContent = testi[i.name](+i.value); i.style.setProperty('--pieno', `${(i.value - i.min) / (i.max - i.min) * 100}%`); });
    const coperti = v.chiamate * .5 * SETTIMANE * v.persone, daCoperti = coperti * v.spesa;   // SABE: le chiamate non vanno più perse
    const ore = v.ore * .5 * SETTIMANE, daOre = ore * v.costo;                                 // ANIMA e ATLAS: metà del lavoro d'ufficio
    const daMerce = v.acquisti * .02;                                                          // magazzino e bolle: sprechi e aumenti visti in tempo
    const mese = Math.round((daCoperti + daOre + daMerce) / 10) * 10;
    totale.textContent = euro(mese);
    anno.textContent = euro(mese * 12);   // l'anno è dodici volte il mese arrotondato: i due numeri tornano fra loro
    parti.innerHTML = `<span><b>${Math.round(coperti)}</b> coperti recuperati · ${euro(daCoperti)}</span><span><b>${Math.round(ore)} h</b> restituite · ${euro(daOre)}</span><span><b>${euro(daMerce)}</b> risparmiati sulla merce</span>`;
  }
  f.addEventListener('input', calcola);
  f.addEventListener('submit', e => e.preventDefault());
  calcola();
}

export function avviaPerche() {
  avviaTriangolo();
  avviaCalcolo();
}
