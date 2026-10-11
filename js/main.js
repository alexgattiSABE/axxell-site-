import { $, riduci } from './utili.js';
import { avviaSfondo } from './sfondo.js';
import { avviaCarosello } from './carosello.js';
import { scenaSabe } from './scena-sabe.js';
import { scenaAnima } from './scena-anima.js';
import { scenaAtlas } from './scena-atlas.js';
import { avviaScenari } from './sabe-scenari.js';
import { avviaPila } from './anima-pila.js';
import { avviaScrivania } from './atlas-scrivania.js';
import { avviaEntrate } from './entrate.js';
import { avviaInclina } from './inclina.js';
import { avviaPerche } from './perche.js';
import { avviaProblema } from './problema.js';
import { avviaLogo3d } from './logo-3d.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';

avviaSfondo($('bg'));
avviaCarosello({ radice: $('carosello'), scene: [scenaSabe, scenaAnima, scenaAtlas] });

// scorrendo, l'apertura si alleggerisce e lascia il primo piano al carosello
if (!riduci) {
  const testa = document.querySelector('.hero-head'), sotto = document.querySelector('.qualita');
  let atteso = false;
  const muovi = () => {
    atteso = false;
    const p = Math.min(1, Math.max(0, scrollY / (innerHeight * .7)));
    // sul telefono le qualità stanno sotto il carosello: lì restano piene, si alleggerisce solo il titolo
    const largo = matchMedia('(min-width:981px)').matches;
    for (const el of [testa, sotto]) {
      const q = el === sotto && !largo ? 0 : p;
      el.style.translate = q ? `0 ${(-q * 36).toFixed(1)}px` : ''; el.style.opacity = q ? (1 - q * .55).toFixed(3) : '';
    }
  };
  addEventListener('scroll', () => { if (!atteso) { atteso = true; requestAnimationFrame(muovi); } }, { passive: true });
}
avviaScenari();
avviaPila();
avviaScrivania();
avviaPerche();
avviaProblema();
avviaEntrate();
avviaInclina();
avviaLogo3d();
avviaLogoHeader();
avviaMenu();
