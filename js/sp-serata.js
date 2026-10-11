import { riduci, SVG, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';
import { carta, avviaVoce, SPUNTA, CORNETTA } from './chiamata.js';

// «Una serata al telefono»: sei chiamate di un venerdì, scritte come le fa davvero SABE (prompt v5.20):
// controlla i posti prima di confermare, propone al massimo due orari se è pieno, controlla zona e orario di consegna
// prima dei piatti, rilegge il totale, chiede sempre «Confermo?», l'ordine va in cucina a fine chiamata.
// Tre per fila, su due file: in ogni colonna l'ora, la chiamata e sotto la card di quello che compare in ANIMA (o allo staff).
const SERATA = [
  { ora: '18:10', titolo: 'Nuova prenotazione', battute: [
    ['c', 'Buonasera, vorrei prenotare per stasera alle nove, siamo in due.'],
    ['s', 'Controllo i posti… C\'è posto alle 21:00. A che nome?'],
    ['c', 'Bianchi.'],
    ['s', 'Allora: tavolo per due, stasera alle 21:00, a nome Bianchi. Confermo?'],
    ['c', 'Sì, grazie.']],
    anima: { tipo: 'Prenotazione', titolo: 'Bianchi · 2 persone', righe: [['Quando', 'Stasera, 21:00'], ['Da dove arriva', 'Agente vocale']], nota: 'Notifica allo staff' } },
  { ora: '19:05', titolo: 'È tutto pieno', battute: [
    ['c', 'Siamo in sei, stasera alle otto e mezza.'],
    ['s', 'Alle 20:30 siamo al completo. Posso proporle le 21:30 o le 21:45.'],
    ['c', 'Le 21:45 vanno bene. A nome Ferri.'],
    ['s', 'Allora: tavolo per sei, stasera alle 21:45, a nome Ferri. Confermo?']],
    anima: { tipo: 'Prenotazione', titolo: 'Ferri · 6 persone', righe: [['Quando', 'Stasera, 21:45'], ['Da dove arriva', 'Agente vocale']], nota: 'Cliente non perso' } },
  { ora: '19:40', titolo: 'Asporto', battute: [
    ['c', 'Vorrei due pizze da ritirare alle otto e mezza.'],
    ['s', 'Certo, quali?'],
    ['c', 'Una margherita con bufala, e una metà diavola e metà capricciosa.'],
    ['s', 'Margherita con bufala e una metà diavola metà capricciosa, ritiro alle 20:30: sono 19,50 euro. Confermo?']],
    anima: { tipo: 'Comanda · asporto', titolo: 'Ritiro alle 20:30', righe: [['1×', 'Margherita · con bufala'], ['1×', 'Metà diavola · metà capricciosa']], nota: 'In cucina a fine chiamata' } },
  { ora: '20:15', titolo: 'Consegna, cliente che richiama', battute: [
    ['c', 'Vorrei ordinare a domicilio.'],
    ['s', 'Certo, signor Verdi. Porto in via Marconi 14 come l\'ultima volta?'],
    ['c', 'Sì, per le nove.'],
    ['s', 'Prima delle 21:10 non riusciamo. A che ora la preferisce?'],
    ['c', 'Alle 21:15. Due margherite.'],
    ['s', 'Due margherite alle 21:15 in via Marconi 14, sono 13 euro. Confermo?']],
    anima: { tipo: 'Ordine · domicilio', titolo: 'Verdi · alle 21:15', righe: [['Indirizzo', 'Via Marconi 14 · in zona'], ['2×', 'Margherita']], nota: 'In cucina a fine chiamata' } },
  { ora: '21:00', titolo: 'Cena aziendale', battute: [
    ['c', 'Vorremmo organizzare una cena aziendale da voi, siamo una trentina di persone.'],
    ['s', 'Per gli eventi la metto in contatto con il nostro staff, così vi seguono loro su menu e sala. Un momento.'],
    ['c', 'Perfetto, grazie.']],
    anima: { staff: true, tipo: 'Trasferita', titolo: 'Richiesta per un evento', righe: [['Cosa', 'Cena aziendale · 30 persone'], ['Se nessuno risponde', 'Il locale richiama entro 30 minuti']], nota: 'Nessuna richiesta lasciata senza risposta' } },
  { ora: '22:30', titolo: 'Disdetta', battute: [
    ['c', 'Devo disdire la prenotazione di domani.'],
    ['s', 'Ho trovato la prenotazione: domani alle 20:30, quattro persone, a nome Rossi. La disdico?'],
    ['c', 'Sì, purtroppo non riusciamo.'],
    ['s', 'Fatto. La aspettiamo un\'altra volta.']],
    anima: { tipo: 'Disdetta', titolo: 'Rossi · 4 persone', righe: [['Era', 'Domani, 20:30'], ['Tavolo', 'Di nuovo libero']], nota: 'Trovata dal numero di chi chiama' } },
];
const PASSO = 220, ATTESA = 150, CODA = 500;   // ms: come in css/sabe.css, ogni battuta sale .22 s dopo la precedente

const cardAnima = (a, k) => `<div class="sp-anima${a.staff ? ' sp-anima--staff' : ''}">
  <header><span class="sp-anima-ic" aria-hidden="true">${a.staff ? SVG(CORNETTA, 2.2) : copiaMarchio(MARCHI.anima, 'sa' + k)}</span><span>${a.staff ? 'Staff' : 'ANIMA'}</span><span class="sp-anima-tipo">${a.tipo}</span></header>
  <b>${a.titolo}</b>
  <dl>${a.righe.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>
  <p class="sp-anima-nota">${SVG(SPUNTA, 2.6)}${a.nota}</p>
</div>`;

export function avviaSerata() {
  const lista = document.getElementById('spSerata');
  if (!lista) return;
  lista.innerHTML = SERATA.map((c, k) => `<li class="sp-ora">
    <div class="sp-ora-testa"><span class="sp-orario num">${c.ora}</span><i class="sp-ora-linea" aria-hidden="true"></i></div>
    <div class="sp-riga">${carta({ ...c, ora: `Ven · ${c.ora}`, esito: null }, k, `Chiamata delle ${c.ora}: ${c.titolo}`, 'se' + k)}${cardAnima(c.anima, k)}</div>
  </li>`).join('');
  const righe = [...lista.children];
  const tele = righe.map(r => r.querySelector('.onda-voce'));
  let parla = -1;
  avviaVoce(tele, () => parla, lista);

  if (riduci) { righe.forEach(r => r.classList.add('fatto')); return; }

  // ogni chiamata si scrive quando arriva in vista; finita l'ultima battuta compare la sua card
  const io = new IntersectionObserver(voci => voci.forEach(v => {
    if (!v.isIntersecting) return;
    io.unobserve(v.target);
    const r = v.target, k = righe.indexOf(r), n = SERATA[k].battute.length;
    r.querySelector('.chiamata').classList.add('viva');
    parla = k;
    setTimeout(() => { r.classList.add('fatto'); if (parla === k) parla = -1; }, ATTESA + n * PASSO + CODA);
  }), { threshold: 0, rootMargin: '0px 0px -30% 0px' });   // anche se la riga è più alta dello schermo
  righe.forEach(r => io.observe(r));
}
