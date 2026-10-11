import { riduci } from './utili.js';

// Una giornata con ATLAS: ogni tappa si accende quando arriva in vista (anche se è più alta dello schermo),
// la linea blu che le collega si riempie fino al punto della pagina che si sta guardando.
export function avviaGiornata() {
  const lista = document.getElementById('atGiornata');
  if (!lista) return;
  const tappe = [...lista.children];
  if (riduci) { tappe.forEach(t => t.classList.add('fatta')); lista.style.setProperty('--riempi', 1); return; }
  const io = new IntersectionObserver(voci => voci.forEach(v => {
    if (!v.isIntersecting) return;
    io.unobserve(v.target);
    v.target.classList.add('fatta');
  }), { threshold: 0, rootMargin: '0px 0px -30% 0px' });
  tappe.forEach(t => io.observe(t));
  let atteso = false;
  const riempi = () => {
    atteso = false;
    const b = lista.getBoundingClientRect();
    lista.style.setProperty('--riempi', Math.min(1, Math.max(0, (innerHeight * .7 - b.top) / b.height)).toFixed(3));
  };
  const chiedi = () => { if (!atteso) { atteso = true; requestAnimationFrame(riempi); } };
  addEventListener('scroll', chiedi, { passive: true });
  addEventListener('resize', chiedi, { passive: true });
  riempi();
}
