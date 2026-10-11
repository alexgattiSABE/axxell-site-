import { riduci } from './utili.js';

// Le caselle col mouse sopra: si inclinano verso il puntatore e si staccano un poco dalla pagina,
// una luce nel colore del prodotto segue il puntatore e il bordo si accende solo vicino al cursore.
// Solo con un mouse vero e senza movimento ridotto; uscendo tornano piane con calma.
const CASELLE = '.app li, .atlas .gruppi > div, .servizi-gruppi > div, .sp-stat, .sp-piano, .an-numero, .at-area, .se-mondo, .se-carte article, .se-servizio, .vi-credo, .vi-ragione, .vi-fisco-carta';
const MAX = 5;   // gradi

export function avviaInclina() {
  if (riduci || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll(CASELLE).forEach(c => {
    c.classList.add('inclina');
    let r = null, raf = 0, ultimo = null;
    const applica = () => {
      raf = 0;
      const { clientX: x, clientY: y } = ultimo;
      const px = Math.min(1, Math.max(0, (x - r.left) / r.width)), py = Math.min(1, Math.max(0, (y - r.top) / r.height));
      const dx = px - .5, dy = py - .5;
      const ang = Math.hypot(dx, dy) * 2 * MAX;
      c.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      c.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      c.style.setProperty('--px', dx.toFixed(3));
      c.style.setProperty('--py', dy.toFixed(3));
      // asse perpendicolare allo spostamento: il lato verso il puntatore si abbassa sotto il dito
      c.style.rotate = ang ? `${dy.toFixed(3)} ${(-dx).toFixed(3)} 0 ${ang.toFixed(2)}deg` : '';
    };
    c.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; r = c.getBoundingClientRect(); c.classList.add('sopra'); });
    c.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      if (!r) r = c.getBoundingClientRect();
      ultimo = e;
      if (!raf) raf = requestAnimationFrame(applica);
    });
    c.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf); raf = 0; r = null;
      c.classList.remove('sopra');
      c.style.rotate = '';
      c.style.setProperty('--px', 0); c.style.setProperty('--py', 0);
    });
  });
}
