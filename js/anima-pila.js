import { riduci, $, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';

// ANIMA: la card scelta esce dalla pila e si mostra dritta; scegliendone un'altra,
// quella aperta torna prima al suo posto e solo dopo si apre la nuova.
const RITORNO = 380;   // ms: il tempo in cui la card aperta rientra nella pila

export function avviaPila() {
  const icona = document.querySelector('#anima .nome .icona');
  if (icona) icona.innerHTML = MARCHI.anima;

  const palco = $('animaPalco');
  if (!palco) return;
  const strati = [...palco.querySelectorAll('.strato')].sort((a, b) => a.dataset.k - b.dataset.k);
  // il simbolo di ANIMA, piccolo, nell'angolo in alto a destra di ogni card
  strati.forEach((s, k) => s.querySelector('.app-testa')?.insertAdjacentHTML('beforeend', `<span class="simbolo-anima" aria-hidden="true">${copiaMarchio(MARCHI.anima, 'c' + k)}</span>`));
  const bottoni = [...document.querySelectorAll('#animaSezioni button')];
  let aperto = -1, attesa = null;

  // la pila inclinata e la card aperta devono stare tutte nel palco, a ogni larghezza:
  // --sc rimpicciolisce la pila se serve, --ap porta la card aperta alla misura giusta (al massimo 1,15 volte)
  const COS = Math.cos(38 * Math.PI / 180), SIN = Math.sin(38 * Math.PI / 180);
  function misura() {
    const cw = strati[0].offsetWidth, ch = strati[0].offsetHeight, w = palco.clientWidth, h = palco.clientHeight;
    const g = parseFloat(getComputedStyle(palco).getPropertyValue('--g')) || 50;
    const largaPila = cw * COS + ch * SIN, altaPila = (cw * SIN + ch * COS) * .56 + (strati.length - 1) * g;
    const sc = Math.min(1, (w - 24) / largaPila, (h - 40) / altaPila);
    const aperta = Math.min(cw * 1.15, w - 16, (h - 16) * cw / ch);
    palco.style.setProperty('--sc', sc.toFixed(3));
    palco.style.setProperty('--ap', (aperta / (cw * sc)).toFixed(3));
  }

  function segna() {
    strati.forEach((s, i) => s.classList.toggle('aperto', i === aperto));
    bottoni.forEach((b, i) => b.setAttribute('aria-expanded', i === aperto ? 'true' : 'false'));
    palco.classList.toggle('ha-aperto', aperto >= 0);
  }

  // se il palco non si vede tutto (succede sul telefono), lo porta in vista
  function inVista() {
    const r = palco.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight) palco.scrollIntoView({ behavior: riduci ? 'auto' : 'smooth', block: 'center' });
  }

  function apri(k) {
    clearTimeout(attesa);
    if (k !== aperto) inVista();
    if (k === aperto) return chiudi();
    if (aperto >= 0 && !riduci) {   // prima rientra quella aperta
      aperto = -1; segna();
      attesa = setTimeout(() => { aperto = k; segna(); }, RITORNO);
      return;
    }
    aperto = k; segna();
  }

  function chiudi() {
    clearTimeout(attesa);
    if (aperto < 0) return;
    aperto = -1; segna();
  }

  bottoni.forEach((b, i) => b.addEventListener('click', () => apri(i)));
  strati.forEach((s, i) => s.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target.closest('.chiudi')) return chiudi();
    if (i !== aperto) apri(i);
  }));
  palco.addEventListener('click', chiudi);
  addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(); });
  new ResizeObserver(misura).observe(palco);
  misura();
  segna();
}
