import { creaOrologio } from './tempo.js';
import { creaSequenza } from './sequenza.js';
import { MARCHI } from './marchi.js';
import { riduci, fine, inVista } from './utili.js';

const DURATA_PASSAGGIO = 1600;
const FORME = { sabe: 'nodo', anima: 'anelli', atlas: 'cubo' };

export function avviaCarosello({ radice, scene }) {
  const anello = radice.querySelector('.anello');
  const annuncio = radice.querySelector('.annuncio');
  const linguette = [...radice.querySelectorAll('.linguetta')];
  const tastoPausa = radice.querySelector('.pausa');
  const legami = [...radice.querySelectorAll('.legame')];   // legami[k]: quello che passa dalla scheda k alla k+1
  const orologio = creaOrologio();
  const n = scene.length;
  let fronte = 0;
  let swipato = false;
  let partito = false;

  const schede = scene.map((sc, k) => {
    const el = document.createElement('article');
    el.className = `scheda slab scheda--${sc.id}`;
    el.id = `scheda-${sc.id}`;
    el.setAttribute('role', 'tabpanel');
    el.setAttribute('aria-labelledby', `ling-${sc.id}`);
    el.innerHTML = '<div class="scheda-corpo"></div><div class="velo" aria-hidden="true"></div>';
    sc.monta(el.querySelector('.scheda-corpo'));
    // il marchio del prodotto: grande, a metà sul lato destro, a bassa opacità
    el.querySelector('.scheda-corpo').insertAdjacentHTML('afterbegin', `<span class="marchio marchio--${sc.id}" data-forma="${FORME[sc.id]}" aria-hidden="true">${MARCHI[sc.id]}</span>`);
    el.addEventListener('click', () => { if (swipato) return; if (fronte !== k) vai(k); });
    anello.appendChild(el);
    return el;
  });

  function setFronte(i, annuncia = false) {
    if (fronte !== i || annuncia) radice.dispatchEvent(new CustomEvent('scena', { detail: { id: scene[i].id } }));
    fronte = i;
    if (sopra) { sopra = false; aggiornaPausa(); }   // la nuova scheda davanti parte anche col mouse fermo
    schede.forEach((el, k) => {
      const d = ((k - i) % n + n) % n;
      el.dataset.slot = d === 0 ? '0' : d === 1 ? '1' : '-1';
      el.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
    });
    linguette.forEach((b, k) => {
      b.setAttribute('aria-selected', k === i ? 'true' : 'false');
      b.tabIndex = k === i ? 0 : -1;
    });
    if (annuncia) annuncio.textContent = scene[i].titolo;   // solo quando sceglie chi guarda
  }

  function avviaBarra(i) {
    linguette.forEach(b => b.classList.remove('corre', 'fatta'));
    legami.forEach((l, k) => { l.classList.remove('scorre'); l.classList.toggle('passato', k < i); });
    const b = linguette[i];
    b.style.setProperty('--durata', scene[i].durata + 'ms');
    void b.offsetWidth;
    b.classList.add('corre');
  }

  function sobbalzo(el) {
    if (riduci || !el.animate) return;
    el.animate([{ translate: '0 0' }, { translate: '0 -14px' }, { translate: '0 0' }],
      { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  const seq = creaSequenza({
    scene, orologio,
    suCambio(i, fase) {
      if (fase === 'scena') {
        setFronte(i); avviaBarra(i);
        scene.forEach((sc, k) => { if (k !== i) sc.finale(); });   // di lato: scena completa e ferma
      }
    },
    async passaggio(da, a, s) {
      linguette[da].classList.remove('corre');
      linguette[da].classList.add('fatta');
      legami[da]?.classList.add('scorre');   // il dato passa da una scheda all'altra
      scene[a].azzera();   // la scheda che arriva si presenta dall'inizio, non già finita
      setFronte(a);
      await orologio.attendi(DURATA_PASSAGGIO, s);
      sobbalzo(schede[a]);
    },
  });

  function vai(i) {
    if (riduci) { setFronte(i, true); scene[i].finale(); return; }
    partito = true;
    seq.vai(i);
    setFronte(i, true);
  }

  // pausa: puntatore che si muove sopra la scheda davanti, tasto pausa, sezione fuori schermo
  let sopra = false, visibile = false, fermato = false;
  function aggiornaPausa() {
    const ferma = sopra || fermato || !visibile || document.hidden;
    radice.classList.toggle('in-pausa', ferma);
    if (ferma) orologio.pausa(); else orologio.riprendi();
  }
  if (fine) {
    schede.forEach((el, k) => {
      el.addEventListener('pointermove', () => { if (k === fronte && !sopra) { sopra = true; aggiornaPausa(); } });
      el.addEventListener('pointerleave', () => { if (sopra) { sopra = false; aggiornaPausa(); } });
    });
  }
  function fermaTutto(si) {
    fermato = si;
    tastoPausa.setAttribute('aria-pressed', si ? 'true' : 'false');
    aggiornaPausa();
  }
  if (riduci) tastoPausa.hidden = true;
  else tastoPausa.addEventListener('click', () => fermaTutto(!fermato));
  document.addEventListener('visibilitychange', aggiornaPausa);
  inVista(radice, v => {
    visibile = v;
    if (v && !partito && !riduci) { partito = true; seq.avvia(0); }
    aggiornaPausa();
  }, .3);

  // linguette: clic e frecce
  linguette.forEach((b, k) => {
    b.addEventListener('click', () => vai(k));
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const j = (k + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      linguette[j].focus(); vai(j);
    });
  });

  // swipe orizzontale
  let x0 = null;
  const palco = radice.querySelector('.palco');
  palco.addEventListener('pointerdown', e => { x0 = e.clientX; });
  palco.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) {
      swipato = true;
      setTimeout(() => { swipato = false; }, 0);
      vai((fronte + (dx < 0 ? 1 : -1) + n) % n);
    }
  });

  // stato iniziale
  setFronte(0);
  scene.forEach(sc => sc.finale());

  return { vai };
}
