import { $ } from './utili.js';
import { avviaSfondo } from './sfondo.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { avviaViaggio } from './an-viaggio.js';

// La pagina Argo: sfondo vivo, il viaggio di una bolla.
avviaViaggio();
avviaSfondo($('bg'));
avviaEntrate();
avviaInclina();
avviaLogoHeader();
avviaMenu();

// domande frequenti e voci: aprendone una si chiude quella aperta prima
for (const sel of ['.an-reparti details', '.sp-domande details']) {
  document.querySelectorAll(sel).forEach((d, _, tutte) => d.addEventListener('toggle', () => {
    if (d.open) tutte.forEach(x => { if (x !== d) x.open = false; });
  }));
}
