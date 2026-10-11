import { riduci, SVG, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';

// In apertura: al centro il marchio di ATLAS che gira piano, intorno le app che usi. A turno compare una frase detta,
// un impulso va dal centro all'app che lavora, l'app si accende col suo esito. Fuori schermo si ferma; col movimento
// ridotto le app sono tutte accese e ferme.
const NODI = [   // lato: s/d = appesa al bordo sinistro/destro, c = centrata in x; lx = dove arriva la linea
  { k: 'posta', nome: 'Posta', lato: 's', lx: 14, x: 0, y: 11, base: '3 da leggere', frase: '«Rispondi a Ferri che va bene giovedì»', esito: 'Risposta pronta', ic: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>' },
  { k: 'calendario', nome: 'Calendario', lato: 'd', lx: 86, x: 100, y: 11, base: '4 impegni oggi', frase: '«Fissa Ferri giovedì alle 10»', esito: 'Giovedì 10:00 in agenda', ic: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
  { k: 'whatsapp', nome: 'WhatsApp', lato: 'd', lx: 88, x: 100, y: 50, base: '2 chat', frase: '«Manda l\'ordine a Ortofrutta Rossi»', esito: 'Ordine pronto', ic: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.6 19z"/><path d="M9 10c.5 2 2 3.5 4 4"/>' },
  { k: 'excel', nome: 'Excel', lato: 'c', lx: 75, x: 75, y: 89, base: 'Vendite 2026', frase: '«Totale vendite di settembre?»', esito: '12.480 € in 31 righe', ic: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>' },
  { k: 'documenti', nome: 'Documenti', lato: 'c', lx: 25, x: 25, y: 89, base: 'Cartella clienti', frase: '«Prepara il preventivo per Galli»', esito: 'Preventivo in PDF', ic: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>' },
  { k: 'anima', nome: 'ANIMA', lato: 's', lx: 12, x: 0, y: 50, base: 'Il tuo locale', frase: '«Chi viene a cena stasera?»', esito: '12 prenotazioni · 38 coperti', marchio: 'anima' },
];
const posto = n => n.lato === 's' ? `left:0;top:${n.y}%` : n.lato === 'd' ? `right:0;top:${n.y}%` : `left:${n.x}%;top:${n.y}%`;
const TRATTO = 700, SOSTA = 1500;   // ms: l'impulso va dal centro all'app, poi l'esito resta in vista
const dorme = ms => new Promise(r => setTimeout(r, ms));

export function avviaScena() {
  const box = document.getElementById('atScena');
  if (!box) return;
  const sfuma = `<defs><radialGradient id="atSfuma-g" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="30"><stop offset=".45" stop-color="#000"/><stop offset=".78" stop-color="#fff"/></radialGradient>
    <mask id="atSfuma" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="url(#atSfuma-g)"/></mask></defs>`;
  const raggi = NODI.map(n => `<line data-k="${n.k}" x1="50" y1="50" x2="${n.lx}" y2="${n.y}"/>`).join('');
  box.innerHTML = `<svg class="at-linee" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${sfuma}<g mask="url(#atSfuma)">${raggi}</g></svg>
    <p class="at-comando" aria-hidden="true">${NODI[0].frase}</p>
    <div class="at-centro"><span class="at-icona-grande" aria-hidden="true"></span><b>ATLAS</b></div>
    ${NODI.map(n => `<div class="at-nodo lato-${n.lato}" data-k="${n.k}" style="${posto(n)}"><span class="at-nodo-ic" aria-hidden="true">${n.marchio ? copiaMarchio(MARCHI[n.marchio], 'atn') : SVG(n.ic, 2)}</span><b>${n.nome}</b><small>${n.base}</small></div>`).join('')}
    <span class="at-polso" aria-hidden="true"></span>`;
  const nodi = [...box.querySelectorAll('.at-nodo')], linee = [...box.querySelectorAll('.at-linee line')];
  const comando = box.querySelector('.at-comando'), polso = box.querySelector('.at-polso');
  if (riduci) { comando.hidden = true; nodi.forEach((x, i) => { x.classList.add('acceso'); x.querySelector('small').textContent = NODI[i].esito; }); return; }

  let visibile = true;
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; box.classList.toggle('ferma', !visibile); }).observe(box);
  const ciclo = async () => {
    for (let i = 0; ; i = (i + 1) % NODI.length) {
      while (!visibile) await dorme(400);
      const n = NODI[i];
      comando.textContent = n.frase;
      comando.classList.remove('nuovo'); void comando.offsetWidth; comando.classList.add('nuovo');
      linee.forEach(l => l.classList.toggle('viva', l.dataset.k === n.k));
      await polso.animate([{ left: '50%', top: '50%', opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { left: `${n.lx}%`, top: `${n.y}%`, opacity: 0 }],
        { duration: TRATTO, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }).finished;
      nodi.forEach((x, j) => { x.classList.toggle('acceso', j === i); x.querySelector('small').textContent = j === i ? NODI[j].esito : NODI[j].base; });
      await dorme(SOSTA);
    }
  };
  setTimeout(ciclo, 600);
}
