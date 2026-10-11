import { riduci } from './utili.js';

// ATLAS legge il locale: quando il pannello arriva in vista le barre dei coperti crescono; poi, a turno, lungo il filo
// fra ANIMA e ATLAS scorre il dato letto, il consiglio che ne nasce si accende e si illuminano i dati da cui viene.
// Fuori schermo si ferma; col movimento ridotto il primo consiglio è acceso e fermo.
const TRATTO = 1100, SOSTA = 2600;   // ms: il dato scorre lungo il filo, poi il consiglio resta acceso
const dorme = ms => new Promise(r => setTimeout(r, ms));

export function avviaLettura() {
  const box = document.getElementById('atLettura');
  if (!box) return;
  const consigli = [...box.querySelectorAll('.at-consiglio')];
  const dato = box.querySelector('.at-dato'), atlas = box.querySelector('.at-flusso [data-marchio=atlas]');
  const accendi = c => {
    consigli.forEach(x => x.classList.toggle('attivo', x === c));
    const chiavi = c.dataset.dati.split(',');
    box.querySelectorAll('[data-k]').forEach(e => e.classList.toggle('letto', chiavi.includes(e.dataset.k)));
  };
  if (riduci) { box.classList.add('vista'); accendi(consigli[0]); return; }

  let visibile = false;
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; if (visibile) box.classList.add('vista'); }, { threshold: .2 }).observe(box);
  (async () => {
    for (let i = 0; ; i = (i + 1) % consigli.length) {
      while (!visibile) await dorme(300);
      const c = consigli[i];
      dato.textContent = c.dataset.dato;
      await dato.animate([{ left: '0%', opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .85 }, { left: '100%', opacity: 0 }],
        { duration: TRATTO, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }).finished;
      atlas.classList.remove('riceve'); void atlas.offsetWidth; atlas.classList.add('riceve');
      accendi(c);
      await dorme(SOSTA);
    }
  })();
}
