import { $, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';
import { avviaSfondo } from './sfondo.js';
import { avviaNumeri } from './sp-numeri.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { avviaScena } from './an-scena.js';
import { avviaViaggio } from './an-viaggio.js';
import { avviaOcchio } from './an-occhio.js';

// La pagina ANIMA: sfondo vivo, la scena dei reparti in apertura, il viaggio di un ordine, i numeri che contano.
avviaScena();
avviaViaggio();
avviaOcchio();
document.querySelectorAll('.an-icona, .an-icona-grande, .sp-anima-ic, .an-pilastri-centro, .an-reparto-sfondo').forEach((el, k) => { el.innerHTML = copiaMarchio(MARCHI.anima, 'an' + k); });
document.querySelectorAll('.sp-segno-sabe').forEach((el, k) => { el.innerHTML = copiaMarchio(MARCHI.sabe, 'as' + k); });
document.querySelectorAll('.an-segno-atlas').forEach((el, k) => { el.innerHTML = copiaMarchio(MARCHI.atlas, 'aa' + k); });
avviaSfondo($('bg'));
avviaNumeri();
avviaEntrate();
avviaInclina();
avviaLogoHeader();
avviaMenu();

// reparti e domande frequenti: aprendone una si chiude quella aperta prima (l'attributo name lo fa già nei browser recenti)
for (const sel of ['.an-reparti details', '.sp-domande details']) {
  document.querySelectorAll(sel).forEach((d, _, tutte) => d.addEventListener('toggle', () => {
    if (d.open) tutte.forEach(x => { if (x !== d) x.open = false; });
  }));
}
