import { riduci, SVG } from './utili.js';
import { SPUNTA } from './chiamata.js';

// Il viaggio di un ordine: ogni tappa si accende quando arriva in vista (anche se è più alta dello schermo),
// la linea fucsia che le collega si riempie fino al punto della pagina che si sta guardando.
export function avviaViaggio() {
  const lista = document.getElementById('anViaggio');
  if (!lista) return;
  const tappe = [...lista.children];
  lista.querySelectorAll('.sp-anima-nota').forEach(n => n.insertAdjacentHTML('afterbegin', SVG(SPUNTA, 2.6)));
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
    lista.style.setProperty('--riempi', Math.min(1, Math.max(0, (innerHeight * .6 - b.top) / b.height)).toFixed(3));
  };
  addEventListener('scroll', () => { if (!atteso) { atteso = true; requestAnimationFrame(riempi); } }, { passive: true });
  riempi();
}
