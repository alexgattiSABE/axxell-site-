import { $, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';
import { avviaSfondo } from './sfondo.js';
import { avviaDiretta } from './sp-diretta.js';
import { avviaVideo } from './an-video.js';
import { avviaNumeri } from './sp-numeri.js';
import { avviaSerata } from './sp-serata.js';
import { avviaCalcoloSabe } from './sp-calcolo.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { avviaGrafico } from './sp-grafico.js';

// La pagina SABE: sfondo vivo, una chiamata in diretta in apertura, la serata, la ruota a 360°, il calcolo; il marchio di SABE accanto ai titoli e al centro della ruota.
document.querySelectorAll('.sp-icona, .sp-segno-sabe').forEach((el, k) => { el.innerHTML = copiaMarchio(MARCHI.sabe, 'sp' + k); });
avviaSfondo($('bg'));
avviaDiretta();
avviaSerata();
avviaNumeri();
avviaVideo();
avviaCalcoloSabe();
avviaGrafico();
avviaEntrate();
avviaInclina();
avviaLogoHeader();
avviaMenu();

// domande frequenti: aprendone una si chiude quella aperta prima (name="sp-domande" lo fa già nei browser recenti)
document.querySelectorAll('.sp-domande details').forEach((d, _, tutte) => d.addEventListener('toggle', () => {
  if (d.open) tutte.forEach(x => { if (x !== d) x.open = false; });
}));
