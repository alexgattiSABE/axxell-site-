import { riduci, inVista, dorme, SVG, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';

// ATLAS al lavoro sul computer: una richiesta a voce, le finestre delle app in cui agisce,
// la conferma prima di inviare e la risposta a voce. Funzioni vere di ATLAS (posta,
// promemoria, fatture, Excel, calendario); nomi e importi di fantasia.
const IC = {
  posta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  promemoria: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M5 4 3 6M19 4l2 2"/>',
  fatture: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
  excel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
const riga = (a, b, cl = '') => `<div class="r ${cl}"><span>${a}</span><span>${b}</span></div>`;

const COMPITI = [
  { tab: 'Posta e promemoria',
    chiede: 'Hey Atlas, rispondi a Bianchi che il preventivo arriva domani e mettimi un promemoria.',
    finestre: [
      { app: 'posta', titolo: 'Posta · Risposta', corpo:
        riga('A', 'Marco Bianchi') + riga('Oggetto', 'Re: Preventivo cena aziendale') +
        '<p class="testo">Buongiorno Marco, il preventivo le arriva domani in mattinata. Un saluto, Osteria del Porto</p>' },
      { app: 'promemoria', titolo: 'Promemoria', corpo:
        riga('Domani · 9:00', 'Mandare il preventivo a Bianchi', 'forte') },
    ],
    passi: [['apri', 0], ['esito', 0, 'In attesa di conferma'], ['atlas', 'Ho preparato la risposta a Bianchi. La invio?'],
      ['tu', 'Sì.'], ['esito', 0, 'Inviata', true], ['apri', 1], ['esito', 1, 'Aggiunto', true],
      ['atlas', 'Fatto. Ho risposto a Bianchi e domani alle 9 ti ricordo il preventivo.']] },
  { tab: 'Fatture in Excel',
    chiede: 'Fammi un foglio con le spese dei fornitori di settembre.',
    finestre: [
      { app: 'fatture', titolo: 'Fatture fornitori · settembre', corpo:
        riga('Ittica Adriatica', '1.240,00 €') + riga('Caseificio Valle', '486,50 €') + riga('Cantina Ferri', '912,00 €') + riga('Altri fornitori', '318,40 €') },
      { app: 'excel', titolo: 'Excel · Spese fornitori settembre.xlsx', corpo:
        '<div class="foglio num">' + [['Fornitore', 'Fatture', 'Totale'], ['Ittica Adriatica', '5', '1.240,00'], ['Caseificio Valle', '4', '486,50'],
          ['Cantina Ferri', '3', '912,00'], ['Altri', '2', '318,40'], ['Totale', '14', '2.956,90']]
          .map((r, i) => `<div class="${i === 0 ? 'th' : i === 5 ? 'tot' : ''}" style="--k:${i}">${r.map(c => `<span>${c}</span>`).join('')}</div>`).join('') + '</div>' },
    ],
    passi: [['apri', 0], ['esito', 0, 'Lette 14 fatture', true], ['apri', 1], ['esito', 1, 'Foglio salvato sul Desktop', true],
      ['atlas', 'Fatto: a settembre 2.956,90 euro su 14 fatture. Il foglio è sul Desktop.']] },
  { tab: 'Appuntamento spostato',
    chiede: 'Sposta il commercialista a giovedì alle tre e avvisalo.',
    finestre: [
      { app: 'calendario', titolo: 'Calendario', corpo:
        '<div class="sposta"><div class="ev da"><b>Commercialista</b><small>Mer · 10:00</small></div><span class="freccia">→</span><div class="ev a"><b>Commercialista</b><small>Gio · 15:00</small></div></div>' },
      { app: 'posta', titolo: 'Posta · Nuovo messaggio', corpo:
        riga('A', 'Studio Ferretti') + riga('Oggetto', 'Appuntamento di mercoledì') +
        '<p class="testo">Buongiorno, possiamo spostare l\'appuntamento a giovedì alle 15? Grazie, Osteria del Porto</p>' },
    ],
    passi: [['apri', 0], ['esito', 0, 'Spostato', true], ['apri', 1], ['esito', 1, 'In attesa di conferma'],
      ['atlas', 'Ho spostato l\'appuntamento. Scrivo allo studio Ferretti per avvisarli, va bene?'], ['tu', 'Sì.'],
      ['esito', 1, 'Inviata', true], ['atlas', 'Fatto. Giovedì alle tre è in calendario e lo studio è avvisato.']] },
];

const finestra = (f, i) => `<article class="finestra" data-app="${f.app}" data-i="${i}" style="--k:${i}">
  <header><span class="ic">${SVG(IC[f.app], 1.9)}</span><b>${f.titolo}</b></header>
  <div class="corpo">${f.corpo}</div>
  <p class="esito"></p>
</article>`;

export function avviaScrivania() {
  const icona = document.querySelector('#atlas .nome .icona');
  if (icona) icona.innerHTML = MARCHI.atlas;
  // l'integrazione con ANIMA si riconosce dal suo simbolo
  const integrata = document.querySelector('#atlas .gruppi .integrata h4');
  if (integrata) integrata.insertAdjacentHTML('afterbegin', `<span class="simbolo" aria-hidden="true">${MARCHI.anima.replace(/n1-/g, 'n1-atlas-')}</span>`);   // id delle maschere propri: sennò userebbe quelle del simbolo in testa ad ANIMA
  const sc = document.getElementById('atlasScrivania');
  if (!sc) return;
  // il cubo di ATLAS, grande e leggero, al centro del pannello blu (sotto finestre e voce)
  sc.insertAdjacentHTML('afterbegin', `<span class="filigrana" aria-hidden="true">${copiaMarchio(MARCHI.atlas, 'scrivania')}</span>`);
  const compiti = document.querySelector('#atlas .compiti');
  const area = sc.querySelector('.finestre'), voce = sc.querySelector('.voce'), chi = voce.querySelector('.chi'), dice = voce.querySelector('.dice');
  const stato = sc.querySelector('.stato-atlas span');

  compiti.innerHTML = COMPITI.map((c, i) =>
    `<button type="button" role="tab" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="n num">0${i + 1}</span>${c.tab}</button>`).join('');
  const tabs = [...compiti.querySelectorAll('[role=tab]')];

  let cur = 0, giro = 0, visibile = false;

  function parla(chiParla, testo) {
    chi.textContent = chiParla; dice.textContent = testo;
    voce.dataset.chi = chiParla === 'Tu' ? 'tu' : 'atlas';
    stato.textContent = chiParla === 'Tu' ? 'ATLAS in ascolto' : chiParla === 'ATLAS' ? 'ATLAS risponde' : 'ATLAS al lavoro';
  }
  const esito = (i, testo, fatto) => {
    const e = area.querySelector(`.finestra[data-i="${i}"] .esito`);
    e.innerHTML = fatto ? `<span class="ok">${SVG('<path d="m5 12 5 5 9-10"/>', 2.6)}</span>${testo}` : `<span class="att"></span>${testo}`;
    e.classList.toggle('fatto', !!fatto); e.classList.add('su');
  };

  function prepara(k) {
    cur = k;
    tabs.forEach((t, i) => { t.setAttribute('aria-selected', i === k); t.tabIndex = i === k ? 0 : -1; });
    area.innerHTML = COMPITI[k].finestre.map(finestra).join('');
    parla('Tu', COMPITI[k].chiede);
  }

  // col movimento ridotto si vede subito il risultato finale
  function finale(k) {
    prepara(k);
    for (const [tipo, a, b, c] of COMPITI[k].passi) {
      if (tipo === 'apri') area.querySelector(`.finestra[data-i="${a}"]`).classList.add('aperta', 'subito');
      if (tipo === 'esito') esito(a, b, c);
      if (tipo === 'atlas' || tipo === 'tu') parla(tipo === 'atlas' ? 'ATLAS' : 'Tu', a);
    }
  }

  const TEMPO = { apri: 1500, esito: 900, atlas: t => 900 + t.length * 34, tu: t => 700 + t.length * 30 };
  async function recita(k) {
    const mio = ++giro;
    const vivo = () => mio === giro;
    const attendi = async ms => { await dorme(ms); while (vivo() && !visibile) await dorme(250); return vivo(); };
    prepara(k);
    if (!await attendi(800 + COMPITI[k].chiede.length * 30)) return;
    for (const [tipo, a, b, c] of COMPITI[k].passi) {
      if (tipo === 'apri') { stato.textContent = 'ATLAS al lavoro'; area.querySelector(`.finestra[data-i="${a}"]`).classList.add('aperta'); }
      if (tipo === 'esito') esito(a, b, c);
      if (tipo === 'atlas') parla('ATLAS', a);
      if (tipo === 'tu') parla('Tu', a);
      const t = TEMPO[tipo];
      if (!await attendi(typeof t === 'function' ? t(a) : t)) return;
    }
    if (!await attendi(2600)) return;
    recita((k + 1) % COMPITI.length);
  }

  const scegli = k => riduci ? finale(k) : recita(k);
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => scegli(i));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[n].focus(); scegli(n);
    });
  });

  if (riduci) return finale(0);
  prepara(0);
  let partito = false;
  inVista(sc, v => { visibile = v; if (v && !partito) { partito = true; recita(0); } }, .3);
}
