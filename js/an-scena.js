import { riduci, SVG } from './utili.js';

// In apertura: i reparti del locale intorno ad ANIMA. Tutto parte dai clienti e finisce ai fornitori, e ogni passaggio passa
// da ANIMA: si accende il triangolo fra i due reparti e il centro, l'impulso va dal reparto ad ANIMA e da ANIMA al reparto dopo,
// che si accende col suo numero aggiornato. Il marchio al centro gira piano (CSS). Fuori schermo si ferma; col movimento
// ridotto i reparti sono tutti accesi e fermi.
const NODI = [   // sette reparti su un ettagono intorno ad ANIMA, nell'ordine del giro di un ordine
  { k: 'clienti', nome: 'Clienti', x: 16, y: 58, valori: ['3 da ricontattare', '4 da ricontattare'], ic: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/>' },
  { k: 'prenotazioni', nome: 'Prenotazioni', x: 18, y: 24, valori: ['12 stasera', '13 stasera'], ic: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>' },
  { k: 'sala', nome: 'Sala', x: 50, y: 9, valori: ['8 / 14 tavoli', '9 / 14 tavoli'], ic: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M6 12v8M18 12v8M9 4h6"/>' },
  { k: 'cucina', nome: 'Cucina', x: 83, y: 24, valori: ['6 in coda', '7 in coda'], ic: '<path d="M6 13h12v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M6 13a4 4 0 0 1 1-7.9A4 4 0 0 1 12 3a4 4 0 0 1 5 2.1A4 4 0 0 1 18 13"/>' },
  { k: 'cassa', nome: 'Cassa', x: 84, y: 58, valori: g => euro(1751.5 + 91 * g), ic: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>' },
  { k: 'magazzino', nome: 'Magazzino', x: 70, y: 89, valori: ['2 sotto soglia', '3 sotto soglia'], ic: '<path d="M3 8l9-5 9 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M8 20v-7h8v7"/>' },
  { k: 'fornitori', nome: 'Fornitori', x: 30, y: 89, valori: ['1 ordine pronto', '2 ordini pronti'], ic: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>' },
];
// l'incasso sale a ogni giro (ogni ordine si somma); gli altri numeri vanno e vengono come in un servizio vero
const euro = v => `${Math.floor(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(v % 1 ? '50' : '00')} €`;
const valore = (n, g) => typeof n.valori === 'function' ? n.valori(g) : n.valori[g % 2];
const ORDINE = ['clienti', 'prenotazioni', 'sala', 'cucina', 'cassa', 'magazzino', 'fornitori'];   // il giro di un ordine
const TRATTO = 650, SOSTA = 900, PAUSA = 1400;   // ms: ogni metà del passaggio, la sosta sul reparto, la pausa a fine giro
const dorme = ms => new Promise(r => setTimeout(r, ms));

export function avviaScena() {
  const box = document.getElementById('anScena');
  if (!box) return;
  const per = Object.fromEntries(NODI.map(n => [n.k, n]));
  const raggi = NODI.map(n => `<line class="an-raggio" data-linea="anima-${n.k}" x1="50" y1="50" x2="${n.x}" y2="${n.y}"/>`).join('');
  const lati = ORDINE.slice(1).map((b, i) => { const a = per[ORDINE[i]], c = per[b]; return `<line class="an-lato" data-linea="${a.k}-${b}" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"/>`; }).join('');
  // i raggi sfumano appena prima del marchio al centro (una maschera radiale: trasparente sotto il marchio, piena fuori)
  const sfuma = `<defs><radialGradient id="anSfuma-g" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="30"><stop offset=".45" stop-color="#000"/><stop offset=".78" stop-color="#fff"/></radialGradient>
    <mask id="anSfuma" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="url(#anSfuma-g)"/></mask></defs>`;
  box.innerHTML = `<svg class="an-linee" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${sfuma}${lati}<g class="an-raggi" mask="url(#anSfuma)">${raggi}</g></svg>
    <div class="an-centro"><span class="an-icona-grande" aria-hidden="true"></span><b>ANIMA</b></div>
    ${NODI.map(n => `<div class="an-nodo" data-k="${n.k}" style="left:${n.x}%;top:${n.y}%"><span class="an-nodo-ic" aria-hidden="true">${SVG(n.ic, 2)}</span><b>${n.nome}</b><small class="num">${valore(n, 0)}</small></div>`).join('')}
    <span class="an-polso" aria-hidden="true"></span>`;
  const nodo = k => box.querySelector(`.an-nodo[data-k="${k}"]`), centro = box.querySelector('.an-centro'), polso = box.querySelector('.an-polso');
  const linee = [...box.querySelectorAll('.an-linee line')];
  if (riduci) { NODI.forEach(n => { nodo(n.k).classList.add('acceso'); nodo(n.k).querySelector('small').textContent = valore(n, 1); }); return; }

  let visibile = true, giro = 0;
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; }).observe(box);
  const accendi = k => {
    NODI.forEach(n => nodo(n.k).classList.toggle('acceso', n.k === k));
    nodo(k).querySelector('small').textContent = valore(per[k], giro + 1);
  };
  const tratto = (da, a, ultimo) => polso.animate([
    { left: `${da.x}%`, top: `${da.y}%`, opacity: ultimo ? 1 : 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 },
    { left: `${a.x}%`, top: `${a.y}%`, opacity: ultimo ? 0 : 1 }], { duration: TRATTO, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }).finished;
  const C = { x: 50, y: 50 };
  const ciclo = async () => {
    for (;;) {
      while (!visibile) await dorme(400);
      accendi('clienti');
      await dorme(SOSTA);
      for (let i = 1; i < ORDINE.length; i++) {
        while (!visibile) await dorme(400);
        const a = ORDINE[i - 1], b = ORDINE[i], tri = new Set([`anima-${a}`, `anima-${b}`, `${a}-${b}`]);
        linee.forEach(l => l.classList.toggle('viva', tri.has(l.dataset.linea)));
        await tratto(per[a], C, false);
        centro.classList.add('riceve');
        await tratto(C, per[b], true);
        centro.classList.remove('riceve');
        accendi(b);
        await dorme(SOSTA);
      }
      linee.forEach(l => l.classList.remove('viva'));
      giro++;
      await dorme(PAUSA);
    }
  };
  setTimeout(ciclo, 600);
}
