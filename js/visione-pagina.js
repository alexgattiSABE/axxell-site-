import { $, riduci } from './utili.js';
import { avviaSfondo } from './sfondo.js';
import { avviaNumeri } from './sp-numeri.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { avviaFili } from './vi-fili.js';
import { avviaCrescita } from './vi-crescita.js';
import { avviaGlobo } from './vi-globo.js';

// La pagina Visione: sfondo vivo con tutti i colori, i numeri che contano, la roadmap che si riempie scorrendo.
avviaFili();
avviaCrescita();
avviaGlobo();
avviaStrada();
avviaSfondo($('bg'));
avviaNumeri();
avviaEntrate();
avviaInclina();
avviaLogoHeader();
avviaMenu();

// Roadmap: ogni tappa si accende quando arriva in vista e la linea colorata si riempie fino al punto della pagina che
// si sta guardando. Le tappe aspettano nascoste solo se c'è lo script (classe in-scena); col movimento ridotto è tutto acceso.
function avviaStrada() {
  const lista = document.getElementById('viStrada');
  if (!lista) return;
  const tappe = [...lista.children];
  if (riduci) { tappe.forEach(t => t.classList.add('fatta')); lista.style.setProperty('--riempi', 1); return; }
  lista.classList.add('in-scena');
  const io = new IntersectionObserver(voci => voci.forEach(v => {
    if (!v.isIntersecting) return;
    io.unobserve(v.target);
    v.target.classList.add('fatta');
  }), { threshold: 0, rootMargin: '0px 0px -25% 0px' });
  tappe.forEach(t => io.observe(t));
  let atteso = false;
  const riempi = () => {
    atteso = false;
    const b = lista.getBoundingClientRect();
    lista.style.setProperty('--riempi', Math.min(1, Math.max(0, (innerHeight * .65 - b.top) / b.height)).toFixed(3));
  };
  addEventListener('scroll', () => { if (!atteso) { atteso = true; requestAnimationFrame(riempi); } }, { passive: true });
  riempi();
}
