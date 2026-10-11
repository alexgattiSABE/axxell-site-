import { riduci, dorme, copiaMarchio, SVG } from './utili.js';
import { MARCHI } from './marchi.js';

// In apertura: quattro fili colorati, uno per prodotto, partono dai loro nomi a sinistra, si incurvano e si uniscono nella
// A di Axxell a destra: un sistema solo. Si disegnano all'arrivo; poi a turno un impulso corre lungo un filo, la A si
// illumina e il nome di quel filo si accende. Fuori schermo si ferma; col movimento ridotto i fili sono disegnati e fermi.
const FILI = [
  { k: 'sabe', nome: 'SABE', dice: 'al telefono', y: 15, marchio: 'sabe' },
  { k: 'anima', nome: 'ANIMA', dice: 'il gestionale', y: 38, marchio: 'anima' },
  { k: 'atlas', nome: 'ATLAS', dice: 'sul computer', y: 62, marchio: 'atlas' },
  { k: 'servizi', nome: 'Servizi', dice: 'il sito', y: 85, marchio: null },
];
const CHAT = '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>';
const A = { x: 80, y: 50 };   // dove arriva tutto, in percentuale della scena (il centro della A)
const VIAGGIO = 1300, ACCESA = 700, PAUSA = 500;   // ms
const A_SVG = '<svg width="84" height="77" viewBox="8 9 84 77" aria-hidden="true"><path d="M56.99 17.66 L56.83 16.47 L56.53 15.48 L56.09 14.55 L55.52 13.69 L54.83 12.93 L53.89 12.18 L52.84 11.6 L51.87 11.25 L50.86 11.05 L49.83 11.0 L48.63 11.13 L47.64 11.41 L46.7 11.83 L45.83 12.38 L45.05 13.05 L44.28 13.97 L43.7 14.95 L10.22 84.0 L25.78 84.0 L33.54 68.0 L62.91 68.0 L57.09 56.0 L39.36 56.0 L56.33 20.99 L56.65 20.2 L56.87 19.37 L56.98 18.51Z" fill="var(--sistema)"/><path d="M74.22 84.0 L89.78 84.0 L59.54 21.62 L51.78 37.71Z" fill="var(--appoggio-gamba)"/></svg>';

export function avviaFili() {
  const box = document.getElementById('viFili');
  if (!box) return;
  const tracce = FILI.map(f => `<path class="vi-filo" data-k="${f.k}" pathLength="1" d="M12 ${f.y} C 50 ${f.y}, 56 ${A.y}, ${A.x - 8} ${A.y}"/>`).join('');
  box.innerHTML = `<svg class="vi-fili-linee" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${tracce}</svg>
    ${FILI.map((f, i) => `<div class="vi-nodo" data-k="${f.k}" style="top:${f.y}%"><span class="vi-nodo-ic">${f.marchio ? copiaMarchio(MARCHI[f.marchio], 'vi' + i) : SVG(CHAT, 2)}</span><b>${f.nome}</b><small>${f.dice}</small></div>`).join('')}
    <div class="vi-a">${A_SVG}</div>
    <span class="vi-impulso" aria-hidden="true"></span>`;
  box.dataset.arrivi = '0';
  const fili = [...box.querySelectorAll('.vi-filo')], a = box.querySelector('.vi-a'), imp = box.querySelector('.vi-impulso');
  if (riduci) { box.classList.add('disegnati'); return; }
  let visibile = true;
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; box.classList.toggle('ferma', !visibile); }).observe(box);
  const passo = async ms => { await dorme(ms); while (!visibile) await dorme(300); };
  // l'impulso segue il filo: le coordinate del tracciato (0–100) sono già percentuali della scena
  const corri = (p, k) => new Promise(fine => {
    const tot = p.getTotalLength(), t0 = performance.now();
    imp.dataset.k = k; imp.classList.add('in-viaggio');
    const frame = t => {
      const q = Math.min(1, (t - t0) / VIAGGIO), e = q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
      const pt = p.getPointAtLength(e * tot);
      imp.style.left = `${pt.x}%`; imp.style.top = `${pt.y}%`;
      if (q < 1) requestAnimationFrame(frame); else { imp.classList.remove('in-viaggio'); fine(); }
    };
    requestAnimationFrame(frame);
  });
  const ciclo = async () => {
    await passo(200); box.classList.add('disegnati');
    await passo(1600);
    for (let i = 0; ; i = (i + 1) % FILI.length) {
      const f = FILI[i];
      box.dataset.filo = f.k;
      box.querySelectorAll('.vi-nodo').forEach(n => n.classList.toggle('attivo', n.dataset.k === f.k));
      fili.forEach(p => p.classList.toggle('vivo', p.dataset.k === f.k));
      await corri(fili[i], f.k);
      a.classList.add('accesa'); box.dataset.arrivi = String(+box.dataset.arrivi + 1);
      await passo(ACCESA); a.classList.remove('accesa');
      await passo(PAUSA);
    }
  };
  ciclo();
}
