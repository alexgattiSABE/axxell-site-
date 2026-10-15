import { $, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';
import { avviaSfondo } from './sfondo.js';
import { avviaNumeri } from './sp-numeri.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { avviaScena } from './at-scena.js';
import { avviaGiornata } from './at-giornata.js';
import { avviaLettura } from './at-lettura.js';
import { avviaVideo } from './an-video.js';

// La pagina ATLAS: sfondo vivo, la scena delle app in apertura, la giornata, i numeri che contano.
document.documentElement.classList.add('js');   // senza JavaScript le card della giornata restano visibili
avviaScena();
avviaGiornata();
avviaLettura();
avviaVideo();
document.querySelectorAll('.at-icona, .at-icona-grande, .at-app-ic, .at-pro-centro, .at-anima-m, .at-anima-gigante').forEach((el, k) => { el.innerHTML = copiaMarchio(MARCHI[el.dataset.marchio || 'atlas'], 'at' + k); });
avviaSfondo($('bg'));
avviaNumeri();
avviaEntrate();
avviaInclina();
avviaLogoHeader();
avviaMenu();

// domande frequenti: aprendone una si chiude quella aperta prima (l'attributo name lo fa già nei browser recenti)
document.querySelectorAll('.sp-domande details').forEach((d, _, tutte) => d.addEventListener('toggle', () => {
  if (d.open) tutte.forEach(x => { if (x !== d) x.open = false; });
}));
