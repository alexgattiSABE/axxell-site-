import { SVG } from './utili.js';

const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
const VOCE = '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>';
const SPUNTA = '<path d="m5 12 5 5 9-10"/>';
const IC = {
  anima: '<path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7Z"/>',
};
// come lavora davvero ATLAS: lo chiami a voce («Hey Atlas»), ti risponde a voce,
// legge i dati di ANIMA, agisce nelle tue app e prima di inviare chiede conferma
const RIGHE = [
  { tu: 'Hey Atlas, cosa devo ordinare?' },
  { az: 'anima', t: 'Letto in ANIMA: 1 ordine da fare', s: 'Vongole veraci 6 kg · Ittica Adriatica' },
  { atlas: 'C\'è da ordinare 6 kg di vongole veraci da Ittica Adriatica. Ti ho preparato il messaggio:' },
  { bozza: 'Buongiorno, per sabato mattina ci servono 6 kg di vongole veraci. Grazie, Osteria del Porto' },
  { atlas: 'Lo invio su WhatsApp?' },
  { tu: 'Sì.' },
  { az: 'wa', t: 'WhatsApp inviato a Ittica Adriatica', s: 'Dal tuo WhatsApp, alle 21:52', conta: true },
  { az: 'anima', t: 'Ordine segnato come inviato in ANIMA', s: 'Lo trovi in «In arrivo»', conta: true },
  { atlas: 'Fatto, l\'ho segnato tra gli ordini in arrivo.' },
  { tu: 'Ci sono nuove prenotazioni per domani?' },
  { az: 'anima', t: 'Letto in ANIMA: prenotazioni di domani', s: '19 prenotazioni · 54 coperti' },
  { atlas: 'Domani avete 19 prenotazioni, 54 coperti. L\'ultima è Rossi: 4 persone alle 20:30.' },
];
// tempi: le parole si leggono con calma, le azioni sono rapide
const tempo = r => r.az ? 1100 : r.bozza ? 2200 : 600 + (r.tu || r.atlas).length * 34;
const PAUSA = 350, FINE = 1600;

const rigaHTML = r => {
  if (r.az) return `<li class="az azione ${r.az}"><span class="ap">${SVG(IC[r.az])}</span><p>${r.t}<small>${r.s}</small></p><span class="tm">${SVG(SPUNTA, 2.5)}</span></li>`;
  if (r.bozza) return `<li class="bozza"><small>${SVG(IC.wa)}WhatsApp a Ittica Adriatica</small><p>${r.bozza}</p></li>`;
  if (r.tu) return `<li class="tu"><span class="chi"><span class="mic">${SVG(MIC, 2.2)}</span>Tu</span><span class="dice">${r.tu}</span></li>`;
  return `<li class="atlas"><span class="chi"><span class="onda">${SVG(VOCE, 2.2)}</span>ATLAS</span><span class="dice">${r.atlas}</span></li>`;
};
const NOTIFICA = `<li class="notifica"><span class="ap">${SVG(IC.anima)}</span><span><b>ANIMA · Da ordinare</b><small>Vongole veraci 6 kg · Ittica Adriatica</small></span></li>`;

export const scenaAtlas = {
  id: 'atlas',
  titolo: 'ATLAS ti risponde a voce e lavora nelle tue app',
  durata: RIGHE.reduce((t, r) => t + tempo(r) + PAUSA, FINE),

  monta(el) {
    el.classList.add('sc-atlas');
    el.innerHTML = `
      <div class="c-top"><span><strong class="card-k">ATLAS</strong> · sul tuo computer</span><span class="num conta">oggi · 6 azioni</span></div>
      <ol class="voci"></ol>
      <p class="atl-foot">Parla con te e agisce nelle tue app. Prima di inviare chiede sempre conferma.</p>`;
    this.voci = el.querySelector('.voci');
    this.conta = el.querySelector('.conta');
    this.el = el;
  },

  // all'arrivo si vede cosa ATLAS trova in ANIMA: l'ordine da fare
  azzera() {
    this.voci.innerHTML = NOTIFICA;
    this.conta.textContent = 'oggi · 6 azioni';
  },

  async recita(s, orologio) {
    let fatte = 6;
    for (const r of RIGHE) {
      this.voci.insertAdjacentHTML('beforeend', rigaHTML(r));
      if (r.conta) this.conta.textContent = `oggi · ${++fatte} azioni`;
      await orologio.attendi(tempo(r) + PAUSA, s);
    }
    await orologio.attendi(FINE, s);
  },

  finale() {
    this.voci.innerHTML = NOTIFICA + RIGHE.map(rigaHTML).join('');
    this.conta.textContent = 'oggi · 8 azioni';
  },
};
