import { $, copiaMarchio, inVista } from './utili.js';
import { MARCHI } from './marchi.js';
import { avviaSfondo } from './sfondo.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { avviaScena } from './se-scena.js';
import { avviaChat } from './se-chat.js';

// La pagina Servizi: sfondo vivo nel ciano di Axxell, i marchi di ANIMA e SABE, i disegni delle tecniche che si fermano fuori schermo.
avviaScena();
avviaChat();
document.querySelectorAll('.se-marchio[data-marchio]').forEach((el, k) => { el.innerHTML = copiaMarchio(MARCHI[el.dataset.marchio], 'se' + k); });
const tecniche = document.querySelector('.se-tecniche');
if (tecniche) inVista(tecniche, v => tecniche.classList.toggle('ferma', !v), 0);
avviaSfondo($('bg'));
avviaEntrate();
avviaInclina();
avviaLogoHeader();
avviaMenu();

// domande frequenti: aprendone una si chiude quella aperta prima (l'attributo name lo fa già nei browser recenti)
document.querySelectorAll('.sp-domande details').forEach((d, _, tutte) => d.addEventListener('toggle', () => {
  if (d.open) tutte.forEach(x => { if (x !== d) x.open = false; });
}));
