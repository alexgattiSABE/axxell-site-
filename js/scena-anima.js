import { SVG } from './utili.js';

const IC = {
  tavolo: '<path d="M4 10h16M6 10v9M18 10v9M8 6h8"/>',
  ordine: '<path d="M6 3h12l-1 18H7Z"/><path d="M9 8h6M9 12h6"/>',
  paga: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  stella: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/>',
  scorte: '<path d="m3 8 9-5 9 5v8l-9 5-9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  campana: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/>',
};
// la serata di una prenotazione come la segue davvero ANIMA
const TAPPE = [
  ['tavolo', 'Al tavolo'], ['ordine', 'Ordine'], ['paga', 'Conto'], ['stella', 'Recensione'], ['scorte', 'Scorte'],
];
const TAVOLI = ['T1','T2','T3','T4','T5','T6','T7','T8'];
const occupati = new Set(['T1', 'T2', 'T4', 'T8']);

// prima delle tappe: la prenotazione scritta da SABE arriva in ANIMA e il gestore riceve la notifica
const ARRIVO = `
  <div class="riq-notifica"><span class="ic">${SVG(IC.campana, 2)}</span><span><b>Nuova prenotazione</b><small class="num">Rossi · 4 persone · ven alle 20:30</small></span><em>da SABE</em></div>
  <p class="riq-nota">Salvata da SABE durante la telefonata, il gestore riceve la notifica.</p>`;

const RIQUADRI = [
  `<div class="riq-sala">${TAVOLI.map(t => `<span class="${occupati.has(t) ? 'b' : ''} ${t === 'T7' ? 'qui' : ''}">${t}</span>`).join('')}</div>
   <p class="riq-nota">Dal telefono del cameriere: <b>Apri tavolo</b> · prenotato: Rossi, 4 persone</p>
   <p class="riq-esito">Tavolo 7 da Atteso a Occupato</p>`,
  `<ul class="riq-righe num">
     <li><span>2 × Spaghetti alle vongole</span><small>1 senza aglio</small></li>
     <li><span>1 × Branzino al sale</span></li>
     <li><span>1 × Vermentino, bottiglia</span></li>
   </ul>
   <p class="riq-cucina"><span>Invia in cucina</span><i>Ricevuto</i><i>In preparazione</i><i>Pronto</i></p>`,
  `<ul class="riq-righe num">
     <li><span>4 × Coperto</span><span>10,00 €</span></li>
     <li><span>2 × Spaghetti alle vongole</span><span>32,00 €</span></li>
     <li><span>1 × Branzino al sale</span><span>28,00 €</span></li>
     <li><span>1 × Vermentino</span><span>19,00 €</span></li>
     <li class="tot"><span>Totale tavolo 7</span><span>89,00 €</span></li>
   </ul>
   <p class="riq-esito num">Diviso in 4 · 22,25 € a testa · conto chiuso</p>`,
  `<p class="riq-nota">Dal QR del tavolo, dopo il pagamento</p>
   <div class="riq-msg">Com'è andata la serata?</div>
   <div class="riq-stelle" aria-label="5 stelle su 5">${Array.from({ length: 5 }, (_, i) => `<span style="--k:${i}">${SVG(IC.stella, 1.6)}</span>`).join('')}</div>
   <p class="riq-google">${SVG(IC.stella, 2)}Lascia una recensione su Google</p>
   <p class="riq-esito">Con 4 o 5 stelle compare il link a Google</p>`,
  `<p class="riq-nota">Alla chiusura del conto, scaricate dalle ricette</p>
   <div class="riq-scorte num">
     <div class="sotto"><span>Vongole veraci</span><span class="m"><i style="--da:.34;--a:.24"></i><u></u></span><span>−0,4 kg</span></div>
     <div><span>Spaghetti</span><span class="m"><i style="--da:.74;--a:.71"></i><u></u></span><span>−0,2 kg</span></div>
     <div><span>Branzino</span><span class="m"><i style="--da:.56;--a:.50"></i><u></u></span><span>−1 pz</span></div>
   </div>
   <div class="riq-ordinare"><span><b>Da ordinare</b><small class="num">Vongole veraci 6 kg · Ittica Adriatica</small></span><em>la legge ATLAS</em></div>`,
];
const ATTESA = 1400, TAPPA = 2300;

export const scenaAnima = {
  id: 'anima',
  titolo: 'ANIMA segue la prenotazione dal tavolo alle scorte',
  durata: ATTESA + TAPPE.length * TAPPA,

  monta(el) {
    el.classList.add('sc-anima');
    el.innerHTML = `
      <div class="c-top sc-head"><span><strong class="card-k">ANIMA</strong> · la serata di Rossi</span><span class="porta">da SABE</span></div>
      <ol class="tappe">${TAPPE.map(([ic, nome], i) => `<li data-t="${i}"><span class="pallino">${SVG(IC[ic], 2)}</span><b>${nome}</b>${i < TAPPE.length - 1 ? '<i class="tratto"></i>' : ''}</li>`).join('')}</ol>
      <div class="riquadri"><section class="riq arrivo">${ARRIVO}</section>${RIQUADRI.map((h, i) => `<section class="riq" data-t="${i}">${h}</section>`).join('')}</div>`;
    this.el = el;
    this.tappe = [...el.querySelectorAll('.tappe li')];
    this.riq = [...el.querySelectorAll('.riq[data-t]')];
    this.arrivo = el.querySelector('.riq.arrivo');
  },

  // subito = senza transizioni: la scheda cambia stato di colpo, non si vede riavvolgere
  imposta(t, subito = false) {
    this.el.classList.toggle('subito', subito);
    this.el.classList.toggle('attesa', t < 0);
    this.tappe.forEach((li, i) => { li.classList.toggle('ora', i === t); li.classList.toggle('fatta', i < t); });
    this.arrivo.classList.toggle('ora', t < 0);
    this.riq.forEach((r, i) => r.classList.toggle('ora', i === t));
  },

  azzera() { this.imposta(-1, true); },

  async recita(s, orologio) {
    await orologio.attendi(ATTESA, s);
    for (let t = 0; t < TAPPE.length; t++) {
      this.imposta(t);
      await orologio.attendi(TAPPA, s);
    }
  },

  finale() { this.imposta(TAPPE.length - 1, true); this.tappe.forEach(li => li.classList.add('fatta')); },
};
