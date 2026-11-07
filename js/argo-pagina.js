import { $, riduci } from './utili.js';
import { avviaSfondo } from './sfondo.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { avviaViaggio } from './an-viaggio.js';

// La pagina Argo: sfondo vivo, cento occhi in apertura (uno alla volta si accende), il viaggio di una bolla.
avviaViaggio();
avviaSfondo($('bg'));
avviaEntrate();
avviaInclina();
avviaLogoHeader();
avviaMenu();

const OCCHIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle class="pupilla" cx="12" cy="12" r="3"/></svg>';
const griglia = $('arOcchi');
if (griglia) {
  griglia.innerHTML = Array.from({ length: 100 }, () => `<span class="ar-occhio">${OCCHIO}</span>`).join('');
  const occhi = [...griglia.children];
  const sveglia = i => occhi[i].classList.add('sveglio');
  sveglia(43);   // quello dell'aumento
  if (!riduci) {
    let visibile = true;
    new IntersectionObserver(([e]) => { visibile = e.isIntersecting; }).observe(griglia);
    // gli altri si accendono a caso e si riposano: nessuno chiude mai gli occhi, cambia solo chi è in primo piano
    setInterval(() => {
      if (!visibile) return;
      const acceso = occhi.filter(o => o.classList.contains('sveglio'));
      if (acceso.length > 5) acceso[Math.floor(Math.random() * acceso.length)].classList.remove('sveglio');
      sveglia(Math.floor(Math.random() * occhi.length));
    }, 700);
  }
}

// domande frequenti e voci: aprendone una si chiude quella aperta prima
for (const sel of ['.an-reparti details', '.sp-domande details']) {
  document.querySelectorAll(sel).forEach((d, _, tutte) => d.addEventListener('toggle', () => {
    if (d.open) tutte.forEach(x => { if (x !== d) x.open = false; });
  }));
}
