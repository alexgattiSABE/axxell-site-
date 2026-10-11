import { riduci } from './utili.js';
import { carta, avviaVoce } from './chiamata.js';
import { MARCHI } from './marchi.js';

// esempi di chiamata di SABE, presi da come lavora davvero (prompt e tool di SABE):
// chiede orario e persone, controlla i posti, legge il riepilogo e chiede «Confermo?»
export const CHIAMATE = [
  { titolo: 'Nuova prenotazione', ora: 'Ven · 19:02', battute: [
    ['c', 'Vorrei prenotare per stasera.'],
    ['s', 'Certo. A che ora, e per quante persone?'],
    ['c', 'Alle nove, siamo in due. A nome Bianchi.'],
    ['s', 'C\'è posto. Allora: tavolo per due, stasera alle 21:00. Confermo?']],
    esito: ['Prenotazione salvata', 'in ANIMA, il gestore riceve la notifica'] },
  { titolo: 'Consegna a domicilio', ora: 'Ven · 19:48', battute: [
    ['c', 'Vorrei ordinare a domicilio per le 20:30.'],
    ['s', 'Certo, signor Verdi. Porto in via Marconi 14 come l\'ultima volta?'],
    ['c', 'Sì. Due margherite.'],
    ['s', 'Allora: due margherite alle 20:30 in via Marconi 14, sono 13 euro. Confermo?']],
    esito: ['Ordine in cucina', 'a fine chiamata, indirizzo dentro la zona di consegna'] },
  { titolo: 'Tutto pieno', ora: 'Ven · 20:15', battute: [
    ['c', 'Siamo in sei, stasera alle otto e mezza.'],
    ['s', 'Alle 20:30 la sala è al completo. Posso proporle le 21:45, le va bene?'],
    ['c', 'Sì, va bene. Sono Ferri.'],
    ['s', 'Allora: tavolo per sei, stasera alle 21:45. Confermo?']],
    esito: ['Cliente non perso', 'proposto un orario libero, prenotazione salvata'] },
  { titolo: 'Spostare una prenotazione', ora: 'Ven · 21:10', battute: [
    ['c', 'Ho prenotato per domani a nome Rossi. Possiamo venire alle nove?'],
    ['s', 'Ho trovato la prenotazione: domani alle 20:30, quattro persone.'],
    ['s', 'Alle 21:00 c\'è posto. Sposto la prenotazione alle 21:00, confermo?'],
    ['c', 'Perfetto, grazie.']],
    esito: ['Prenotazione modificata', 'in ANIMA, il tavolo si libera per le 20:30'] },
  { titolo: 'Orari e servizi', ora: 'Ven · 23:40', battute: [
    ['c', 'Domani siete aperti a pranzo?'],
    ['s', 'Sì, domani siamo aperti a pranzo dalle 12:00 alle 14:30.'],
    ['c', 'E fate anche asporto?'],
    ['s', 'Sì, può ordinare adesso al telefono con me.']],
    esito: ['Risposta immediata', 'senza disturbare il personale in sala'] },
  { titolo: 'Richiesta particolare', ora: 'Sab · 11:20', battute: [
    ['c', 'Vorrei organizzare una cena aziendale per trenta persone.'],
    ['s', 'Per gli eventi la metto in contatto con il nostro staff. Un momento.'],
    ['c', 'Va bene, grazie.']],
    esito: ['Passata allo staff', 'se nessuno è libero, il cliente viene richiamato'] },
];

const n = CHIAMATE.length;
const due = k => String(k).padStart(2, '0');

export function avviaScenari() {
  const icona = document.querySelector('#sabe .nome .icona');
  if (icona) icona.innerHTML = MARCHI.sabe;

  const pila = document.getElementById('sabePila');
  if (!pila) return;
  const mazzo = pila.closest('.mazzo'), conta = mazzo.querySelector('.conta');
  pila.innerHTML = CHIAMATE.map((c, i) => carta(c, i, `Esempio ${i + 1} di ${n}: ${c.titolo}`)).join('');
  const carte = [...pila.querySelectorAll('.chiamata')];
  let cur = 0, occupato = false;

  function disponi() {
    carte.forEach((el, i) => {
      const pos = (i - cur + n) % n;
      el.dataset.pos = pos;
      el.style.setProperty('--p', pos);
      el.style.setProperty('--pv', Math.min(pos, 3));   // dal quarto posto in poi stanno tutte nell'ultimo posto visibile
      el.inert = pos !== 0;
      el.classList.toggle('viva', pos === 0);
    });
    conta.textContent = `${due(cur + 1)} / ${due(n)}`;
  }

  // avanti: la card davanti sale, poi scivola dietro e si rimette in fondo alla fila
  function avanti() {
    if (occupato) return;
    const su = carte[cur];
    cur = (cur + 1) % n;
    if (riduci) return disponi();
    occupato = true;
    su.classList.add('sale');
    setTimeout(() => { su.classList.remove('sale'); disponi(); setTimeout(() => { occupato = false; }, 260); }, 190);
  }

  // indietro: l'ultima card sale da dietro la fila e scende davanti
  function indietro() {
    if (occupato) return;
    cur = (cur - 1 + n) % n;
    if (riduci) return disponi();
    occupato = true;
    const torna = carte[cur];
    torna.classList.add('sale');
    setTimeout(() => { torna.classList.remove('sale'); disponi(); setTimeout(() => { occupato = false; }, 260); }, 190);
  }

  mazzo.querySelector('.avanti').addEventListener('click', () => avanti());
  mazzo.querySelector('.indietro').addEventListener('click', indietro);
  pila.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); avanti(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); indietro(); }
  });

  // trascinare la card davanti: verso sinistra la successiva, verso destra la precedente
  let presa = null;
  pila.addEventListener('pointerdown', e => {
    const el = e.target.closest('.chiamata');
    if (!el || el !== carte[cur] || occupato || e.button !== 0) return;
    presa = { el, x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, oriz: null };
  });
  pila.addEventListener('pointermove', e => {
    if (!presa || e.pointerId !== presa.id) return;
    const dx = e.clientX - presa.x, dy = e.clientY - presa.y;
    if (presa.oriz === null && Math.hypot(dx, dy) > 8) {
      presa.oriz = Math.abs(dx) > Math.abs(dy);
      if (!presa.oriz) { presa = null; return; }
      pila.setPointerCapture(e.pointerId);
      presa.el.classList.add('trascina');
    }
    if (!presa.oriz) return;
    presa.dx = dx;
    presa.el.style.setProperty('--dx', `${dx}px`);
    presa.el.style.setProperty('--rot', `${(dx / 40).toFixed(2)}deg`);
  });
  const lascia = () => {
    if (!presa) return;
    const { el, dx, oriz } = presa;
    presa = null;
    if (!oriz) return;
    el.classList.remove('trascina');
    el.style.removeProperty('--dx'); el.style.removeProperty('--rot');
    if (dx < -90) avanti();
    else if (dx > 90) indietro();
  };
  pila.addEventListener('pointerup', lascia);
  pila.addEventListener('pointercancel', lascia);

  disponi();
  avviaVoce(carte.map(c => c.querySelector('.onda-voce')), () => cur, pila);
}
