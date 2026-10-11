import { riduci } from './utili.js';

// SABE a 360°: quattro spicchi intorno al marchio. La luce passa da uno spicchio al successivo, sempre in avanti,
// e a lato compaiono le sue funzioni. Ogni spicchio resta acceso il tempo di leggerlo (una pausa più 300 ms a parola);
// scegliendo uno spicchio (mouse, dito o frecce) resta lì per un po'.
// Lo spicchio acceso si riempie di giallo col tempo di lettura (così si vede che la ruota va avanti); finito, resta pieno
// fino alla fine del giro.
const PAUSA = 2000, A_PAROLA = 300, SOSTA = 12000;   // ms

export function avviaRuota() {
  const r = document.getElementById('spRuota');
  if (!r) return;
  const tab = [...r.querySelectorAll('.sp-spicchio')], pan = [...r.querySelectorAll('.sp-pannello')], archi = [...r.querySelectorAll('.sp-arco')];
  let k = 0, giro = 0, fermo = 0, visibile = false, letto = 0;
  // il riempimento: un arco spesso quanto lo spicchio (raggio 80, da 64 a 96), da -42° a +42° intorno al suo centro
  const svg = r.querySelector('.sp-archi'), NS = 'http://www.w3.org/2000/svg';
  const punto = g => `${(100 + 80 * Math.sin(g * Math.PI / 180)).toFixed(2)} ${(100 - 80 * Math.cos(g * Math.PI / 180)).toFixed(2)}`;
  const pieni = archi.map((a, i) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', 'sp-pieno');
    p.dataset.k = i;
    p.setAttribute('pathLength', '100');
    p.setAttribute('d', `M${punto(i * 90 - 42)}A80 80 0 0 1 ${punto(i * 90 + 42)}`);
    svg.append(p);
    return p;
  });
  const riempi = q => pieni.forEach((p, i) => { p.style.strokeDashoffset = 100 * (1 - (i < k ? 1 : i === k ? q : 0)); });
  pan.forEach(p => { p.dataset.durata = PAUSA + p.textContent.trim().split(/\s+/).length * A_PAROLA; });
  const vai = (n, aMano) => {
    giro += ((n - k) % 4 + 4) % 4;   // la luce non torna mai indietro
    k = n;
    r.style.setProperty('--giro', giro);
    tab.forEach((t, i) => { t.setAttribute('aria-selected', String(i === k)); t.tabIndex = i === k ? 0 : -1; });
    pan.forEach((p, i) => { p.hidden = i !== k; });
    archi.forEach((a, i) => a.classList.toggle('acceso', i === k));
    letto = 0;
    riempi(riduci ? 1 : 0);
    if (aMano) fermo = performance.now() + SOSTA;
  };
  tab.forEach((t, i) => {
    t.addEventListener('click', () => vai(i, true));
    t.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const n = (k + d + 4) % 4;
      vai(n, true);
      tab[n].focus();
    });
  });
  riempi(0);
  if (riduci) { riempi(1); return; }
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; }, { threshold: .4 }).observe(r);
  // il tempo di lettura conta solo mentre la ruota si vede e non c'è una scelta a mano recente
  let t0 = performance.now();
  const conta = t => {
    if (visibile && t > fermo) letto += t - t0;
    t0 = t;
    if (letto >= +pan[k].dataset.durata) vai((k + 1) % 4);
    else riempi(letto / pan[k].dataset.durata);
    requestAnimationFrame(conta);
  };
  requestAnimationFrame(conta);
}
