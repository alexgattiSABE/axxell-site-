import { riduci, dorme, SVG, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';

// In apertura: un sito che si compone a pezzi (come nel metodo di Atelier) e, quando è pronto, il chatbot che si apre
// nell'angolo e risponde a un cliente. Tre attività a turno: con ANIMA la risposta arriva dal gestionale, senza ANIMA
// (lo studio) dalle informazioni che l'attività ci ha dato. Fuori schermo si ferma; col movimento ridotto si vede la
// prima attività finita, ferma. Nei siti d'esempio niente «Prenota»: l'app clienti di ANIMA ha solo gli ordini.
const ATTIVITA = [
  { k: 'ristorante', indirizzo: 'trattoriadamario.it', nome: 'Trattoria da Mario', motto: 'Cucina di casa, dal 1987', tasti: ['Ordina', 'Menù'], tinta: '#c2410c',
    domanda: 'Siete aperti domenica sera?', risposta: 'Sì, domenica dalle 19 alle 23.', fonte: 'anima' },
  { k: 'parrucchiere', indirizzo: 'saloneaurora.it', nome: 'Salone Aurora', motto: 'Taglio, colore e piega', tasti: ['Servizi', 'Chiama'], tinta: '#9d174d',
    domanda: 'Fate il balayage?', risposta: 'Sì, balayage e schiariture, su appuntamento.', fonte: 'anima' },
  { k: 'studio', indirizzo: 'studiorossi.it', nome: 'Studio Rossi', motto: 'Commercialisti a Bologna', tasti: ['Servizi', 'Contatti'], tinta: '#1e3a8a',
    domanda: 'Siete aperti ad agosto?', risposta: 'Chiusi dal 10 al 24 agosto, poi di nuovo in studio.', fonte: 'testo' },
];
const FONTI = { anima: 'dal gestionale ANIMA', testo: "dalle informazioni dell'attività" };
const BOT = '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>';
const DOC = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>';
const PEZZO = 280, SOSTA = 3400;   // ms: fra un pezzo del sito e il successivo; la risposta resta a schermo

function disegna(a) {
  const segno = a.fonte === 'anima' ? `<span class="se-marchio">${copiaMarchio(MARCHI.anima, 'sescena')}</span>` : SVG(DOC, 2);
  return `<div class="se-browser">
      <div class="se-barra" aria-hidden="true"><i></i><i></i><i></i><span class="se-indirizzo">${a.indirizzo}</span></div>
      <div class="se-sito" style="--tinta:${a.tinta}">
        <div class="se-sito-nav se-pezzo"><b class="se-sito-logo">${a.nome.split(' ')[0]}</b><span class="se-sito-menu"><i></i><i></i><i></i></span></div>
        <div class="se-sito-testo"><span class="se-sito-titolo se-pezzo">${a.nome}</span><span class="se-sito-motto se-pezzo">${a.motto}</span></div>
        <span class="se-sito-foto se-pezzo"></span>
        <div class="se-sito-tasti se-pezzo">${a.tasti.map(t => `<span>${t}</span>`).join('')}</div>
      </div>
    </div>
    <div class="se-bot" style="--tinta:${a.tinta}">
      <div class="se-bot-testa"><span class="se-bot-avatar">${SVG(BOT, 2)}</span><span><b>${a.nome}</b><small>Online</small></span></div>
      <div class="se-bot-corpo">
        <p class="se-msg se-msg-cliente">${a.domanda}</p>
        <div class="se-risposta"><span class="se-scrive"><i></i><i></i><i></i></span><p class="se-msg se-msg-bot">${a.risposta}</p></div>
        <span class="se-fonte">${segno}${FONTI[a.fonte]}</span>
      </div>
    </div>`;
}

function metti(box, i) {
  const a = ATTIVITA[i];
  box.innerHTML = disegna(a);
  box.dataset.attivita = a.k;
}

export function mostraAttivita(box, i) {
  metti(box, i);
  box.querySelectorAll('.se-pezzo, .se-msg, .se-fonte').forEach(e => e.classList.add('su'));
  box.querySelector('.se-bot').classList.add('aperto');
  box.dataset.fase = 'risposta';
}

export function avviaScena() {
  const box = document.getElementById('seScena');
  if (!box) return;
  if (riduci) { mostraAttivita(box, 0); return; }
  let visibile = true;
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; box.classList.toggle('ferma', !visibile); }).observe(box);
  const passo = async ms => { await dorme(ms); while (!visibile) await dorme(300); };
  const q = sel => box.querySelector(sel);
  const ciclo = async () => {
    for (let i = 0; ; i = (i + 1) % ATTIVITA.length) {
      metti(box, i); box.dataset.fase = 'sito';
      for (const p of box.querySelectorAll('.se-pezzo')) { await passo(PEZZO); p.classList.add('su'); }
      await passo(600);
      box.dataset.fase = 'chat'; q('.se-bot').classList.add('aperto');
      await passo(500); q('.se-msg-cliente').classList.add('su');
      await passo(500); q('.se-scrive').classList.add('su');
      await passo(1000); q('.se-scrive').classList.remove('su');
      q('.se-msg-bot').classList.add('su'); box.dataset.fase = 'risposta';
      await passo(400); q('.se-fonte').classList.add('su');
      await passo(SOSTA);
      box.classList.add('via'); await passo(450); box.classList.remove('via');
    }
  };
  ciclo();
}
