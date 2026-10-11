import { riduci } from './utili.js';

// I numeri delle statistiche contano da zero la prima volta che entrano in vista.
// Nell'HTML c'è già il valore finale: senza script, o col movimento ridotto, si legge quello.
const DURATA = 1200;
// all'italiana: il punto per le migliaia, la virgola per i decimali (12.8 → 12,8; 32850 → 32.850)
const scrivi = v => { const [i, d] = v.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : ''); };

export function avviaNumeri() {
  // le barre di confronto si allungano la prima volta che entrano in vista (col movimento ridotto sono già piene)
  const barre = [...document.querySelectorAll('[data-barre]')];
  if (riduci) barre.forEach(b => b.classList.add('vista'));
  else {
    const ib = new IntersectionObserver(voci => voci.forEach(v => { if (v.isIntersecting) { ib.unobserve(v.target); v.target.classList.add('vista'); } }), { threshold: .4 });
    barre.forEach(b => ib.observe(b));
  }
  const els = [...document.querySelectorAll('[data-conta]')];
  if (riduci || !els.length) return;
  const io = new IntersectionObserver(voci => voci.forEach(v => {
    if (!v.isIntersecting) return;
    io.unobserve(v.target);
    conta(v.target);
  }), { threshold: .6 });
  els.forEach(el => { el.textContent = '0'; io.observe(el); });
}

function conta(el) {
  const a = +el.dataset.a, cifre = (el.dataset.a.split('.')[1] || '').length, t0 = performance.now();   // 12.8 si scrive 12,8
  const passo = t => {
    const p = Math.min(1, (t - t0) / DURATA), e = 1 - Math.pow(1 - p, 3);   // rallenta verso la fine
    el.textContent = scrivi((a * e).toFixed(cifre));
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
