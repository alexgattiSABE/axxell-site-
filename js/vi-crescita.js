import { riduci, inVista } from './utili.js';

// Ricerca e sviluppo: il totale delle modifiche al software dall'inizio (sale sempre) e, dietro, le modifiche di ogni mese.
// Dati veri, contati sul ramo principale di ANIMA, SABE e ATLAS fino al 10 ottobre 2026 (vedi la spec). Entra quando
// arriva in vista: le barre crescono, la linea si disegna, i punti compaiono, una volta sola. I tasti dei mesi (e il
// passaggio sulle barre) mostrano il dettaglio di un mese. Col movimento ridotto è già tutto disegnato.
export const MESI = [
  { nome: 'Maggio', corto: 'mag', modifiche: 205 },
  { nome: 'Giugno', corto: 'giu', modifiche: 46 },
  { nome: 'Luglio', corto: 'lug', modifiche: 860 },
  { nome: 'Agosto', corto: 'ago', modifiche: 2100 },
  { nome: 'Settembre', corto: 'set', modifiche: 1551 },
  { nome: 'Ottobre', corto: 'ott', modifiche: 1053, parziale: true },
];
const W = 600, H = 300, X0 = 62, X1 = 590, Y0 = 258, Y1 = 30, MAX = 6000;
const migliaia = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const y = v => Y0 - (v / MAX) * (Y0 - Y1);

export function avviaCrescita() {
  const box = document.getElementById('viCrescita');
  if (!box) return;
  let somma = 0;
  const punti = MESI.map((m, i) => { somma += m.modifiche; return { ...m, totale: somma, x: X0 + (i + .5) * (X1 - X0) / MESI.length }; });
  const griglia = [0, 2000, 4000, 6000].map(v => `<line class="vi-g-griglia" x1="${X0}" x2="${X1}" y1="${y(v)}" y2="${y(v)}"/><text class="vi-g-asse vi-g-asse--y" x="${X0 - 12}" y="${y(v) + 5}" text-anchor="end">${migliaia(v)}</text>`).join('');
  const barre = punti.map((p, i) => `<rect class="vi-g-barra" data-i="${i}" x="${(p.x - 24).toFixed(1)}" y="${y(p.modifiche).toFixed(1)}" width="48" height="${(Y0 - y(p.modifiche)).toFixed(1)}" rx="6" style="--i:${i}"/>`).join('');
  const linea = `<path class="vi-g-linea" pathLength="1" d="${punti.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${y(p.totale).toFixed(1)}`).join(' ')}"/>`;
  const pallini = punti.map((p, i) => `<g class="vi-g-punto${i === punti.length - 1 ? ' vi-g-punto--ultimo' : ''}" data-i="${i}" style="--i:${i}"><circle cx="${p.x.toFixed(1)}" cy="${y(p.totale).toFixed(1)}" r="7"/><text x="${p.x.toFixed(1)}" y="${(y(p.totale) - 16).toFixed(1)}" text-anchor="middle">${migliaia(p.totale)}</text></g>`).join('');
  const mesi = punti.map(p => `<text class="vi-g-asse" x="${p.x.toFixed(1)}" y="${Y0 + 28}" text-anchor="middle">${p.corto}${p.parziale ? '*' : ''}</text>`).join('');
  box.insertAdjacentHTML('afterbegin', `<svg class="vi-g" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="viSfuma" x1="0" x2="1"><stop offset="0"/><stop offset="1"/></linearGradient></defs>${griglia}${barre}${linea}${pallini}${mesi}</svg>
    <div class="vi-mesi" role="group" aria-label="Scegli un mese">${punti.map((p, i) => `<button type="button" data-i="${i}" aria-pressed="false">${p.corto}</button>`).join('')}</div>
    <p class="vi-g-dettaglio" aria-live="polite"></p>`);
  const dett = box.querySelector('.vi-g-dettaglio');
  const scegli = i => {
    const p = punti[i];
    dett.innerHTML = `<b>${p.nome} 2026${p.parziale ? ' (1–10)' : ''}</b>: ${migliaia(p.modifiche)} modifiche · totale ${migliaia(p.totale)}`;
    box.querySelectorAll('.vi-g-barra, .vi-g-punto').forEach(e => e.classList.toggle('attivo', +e.dataset.i === i));
    box.querySelectorAll('.vi-mesi button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
  };
  box.querySelectorAll('.vi-mesi button').forEach(b => { const i = +b.dataset.i; b.addEventListener('click', () => scegli(i)); b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') scegli(i); }); });
  box.querySelectorAll('.vi-g-barra').forEach(r => r.addEventListener('pointerenter', () => scegli(+r.dataset.i)));
  scegli(punti.length - 1);
  if (riduci) { box.classList.add('vista'); return; }
  const io = inVista(box, v => { if (!v) return; box.classList.add('vista'); io.disconnect(); }, .3);
}
