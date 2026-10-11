export const riduci = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fine = matchMedia('(pointer: fine)').matches;
export const $ = id => document.getElementById(id);
export const dorme = ms => new Promise(r => setTimeout(r, ms));
export function inVista(el, cb, soglia = .35) {
  const io = new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { threshold: soglia });
  io.observe(el);
  return io;
}
export const SVG = (d, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// una copia in più di un marchio (js/marchi.js) nella stessa pagina: le sue maschere prendono id propri,
// sennò il browser userebbe quelle della prima copia, che può essere nascosta
export const copiaMarchio = (svg, chiave) => svg.replace(/(id="|url\(#)(n\d+)-/g, `$1$2-${chiave}-`);
