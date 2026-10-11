import { riduci, SVG } from './utili.js';

// la telefonata come la fa davvero SABE: chiede ora e persone, controlla i posti, ripete e chiede conferma, poi salva in ANIMA
const RIGHE = [
  { chi: 's', testo: 'Osteria del Porto, buonasera! Come posso aiutarla?' },
  { chi: 'c', testo: 'Vorrei prenotare un tavolo per domani sera.' },
  { chi: 's', testo: 'Certo. A che ora, e per quante persone?' },
  { chi: 'c', testo: 'Alle otto e mezza, siamo in quattro.' },
  { azione: 'Controllo posti liberi', det: 'ven 20:30 · 4 persone · c\'è posto' },
  { chi: 's', testo: 'Perfetto, c\'è posto. A che nome?' },
  { chi: 'c', testo: 'Rossi.' },
  { chi: 's', testo: 'Allora: tavolo per quattro persone, domani alle 20:30. Confermo?' },
  { chi: 'c', testo: 'Sì, grazie.' },
  { azione: 'Prenotazione salvata in ANIMA', det: 'Rossi · 4 persone · ven 20:30', verso: 'ANIMA' },
  { chi: 's', testo: 'Ci vediamo domani! A presto!' },
];
const SPUNTA = '<path d="m5 12 5 5 9-10"/>';
const parla = r => 380 + r.testo.length * 20;   // ms per battuta
const PAUSA = 250, LAVORO = 900, CHIUSURA = 900;
const riga = r => r.azione
  ? `<li class="az${r.verso ? ' verso' : ''}"><span class="ok">${SVG(SPUNTA, 2.6)}</span><span><b>${r.azione}</b><small>${r.det}</small></span>${r.verso ? `<em>${r.verso}</em>` : ''}</li>`
  : `<li class="${r.chi}"><b>${r.chi === 's' ? 'SABE' : 'Cliente'}</b><span>${r.testo}</span></li>`;

export const scenaSabe = {
  id: 'sabe',
  titolo: 'SABE gestisce la chiamata e registra la prenotazione',
  durata: RIGHE.reduce((t, r) => t + (r.azione ? LAVORO : parla(r) + PAUSA), CHIUSURA),
  el: null,

  monta(el) {
    el.classList.add('sc-sabe');
    el.innerHTML = `
      <div class="c-top"><span><strong class="card-k">SABE</strong> · Osteria del Porto</span><span class="live">Chiusa</span></div>
      <div class="c-top num"><span>+39 333 ••• 4821</span><span class="tempo">01:12</span></div>
      <canvas class="wave" aria-hidden="true"></canvas>
      <ol class="transcript"></ol>`;
    this.el = el;
    this.live = el.querySelector('.live');
    this.tempo = el.querySelector('.tempo');
    this.lista = el.querySelector('.transcript');
    this.onda(el.querySelector('.wave'));
  },

  onda(cv) {
    const cx = cv.getContext('2d');
    this.livello = .06; this.obiettivo = .06; this.chi = 's';
    let t = 0;
    const dim = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; };
    dim(); addEventListener('resize', dim);
    const giro = () => {
      if (!cv.width) dim();
      t += .06; this.livello += (this.obiettivo - this.livello) * .12;
      const W = cv.width, H = cv.height, passo = 6 * devicePixelRatio, k = Math.floor(W / passo);
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = this.chi === 's' ? '#0b1033' : 'rgba(11,16,51,.4)';
      for (let i = 0; i < k; i++) {
        const inv = Math.sin(i / k * Math.PI);
        const a = (.25 + .75 * Math.abs(Math.sin(i * .7 + t * 1.7) * Math.cos(i * .23 - t))) * inv;
        const h = Math.max(2 * devicePixelRatio, a * this.livello * H);
        cx.fillRect(i * passo, (H - h) / 2, 3 * devicePixelRatio, h);
      }
      if (!riduci) requestAnimationFrame(giro);
    };
    giro();
  },

  azzera() {
    this.lista.innerHTML = '';
    this.live.textContent = 'In linea';
    this.el.classList.remove('idle');
    this.tempo.textContent = '00:00';
    this.obiettivo = .06;
  },

  async recita(s, orologio) {
    let sec = 0;
    const cron = setInterval(() => {
      if (orologio.inPausa) return;
      sec++; this.tempo.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }, 1000);
    try {
      for (const r of RIGHE) {
        this.lista.insertAdjacentHTML('beforeend', riga(r));
        if (r.azione) { this.obiettivo = .05; await orologio.attendi(LAVORO, s); continue; }
        this.chi = r.chi; this.obiettivo = .85;
        await orologio.attendi(parla(r), s);
        this.obiettivo = .1;
        await orologio.attendi(PAUSA, s);
      }
      this.chiudi();
      await orologio.attendi(CHIUSURA, s);
    } finally {
      clearInterval(cron);
    }
  },

  chiudi() { this.live.textContent = 'Chiusa'; this.el.classList.add('idle'); this.obiettivo = .05; },

  finale() {
    this.lista.innerHTML = RIGHE.map(riga).join('');
    this.tempo.textContent = '01:12';
    this.chiudi();
  },
};
