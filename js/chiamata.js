import { riduci, SVG, copiaMarchio } from './utili.js';
import { MARCHI } from './marchi.js';

// La scheda di una chiamata di SABE, uguale in homepage e nella pagina SABE: il marchio a metà sul lato destro,
// la cornetta con «In chiamata», la linea della voce, le battute di cliente e SABE e, se c'è, l'esito in fondo.
export const SPUNTA = '<path d="m5 12 5 5 9-10"/>';
export const CORNETTA = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>';

// chiave: ogni copia del marchio nella stessa pagina vuole id di maschera propri (vedi copiaMarchio)
export const carta = (c, i, etichetta, chiave = 'ch' + i) => `<article class="chiamata" data-i="${i}" aria-label="${etichetta}">
  <span class="marchio marchio--sabe" aria-hidden="true">${copiaMarchio(MARCHI.sabe, chiave)}</span>
  <header><span class="stato">${SVG(CORNETTA, 2.2)}In chiamata</span><span class="ora num">${c.ora}</span></header>
  <h3>${c.titolo}</h3>
  <canvas class="onda-voce" aria-hidden="true"></canvas>
  <ol class="battute">${c.battute.map(([chi, t], k) =>
    `<li class="${chi}" style="--k:${k}"><b>${chi === 's' ? 'SABE' : 'Cliente'}</b><span>${t}</span></li>`).join('')}</ol>
  ${c.esito ? `<p class="esito" style="--k:${c.battute.length}"><span class="ok">${SVG(SPUNTA, 2.6)}</span><span><b>${c.esito[0]}</b> ${c.esito[1]}</span></p>` : ''}
</article>`;

// la linea della voce: barre che si alzano quando qualcuno parla. tele = i canvas delle schede,
// attiva() = indice di quella che parla adesso (-1 nessuna), osserva = fuori schermo l'animazione si ferma
export function avviaVoce(tele, attiva, osserva) {
  const disegna = (cv, t, livello) => {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const d = devicePixelRatio, W = Math.round(r.width * d), H = Math.round(r.height * d);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const cx = cv.getContext('2d'), passo = 6 * d, k = Math.floor(W / passo);
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = '#0b1033';
    for (let i = 0; i < k; i++) {
      const inv = Math.sin(i / k * Math.PI);
      const a = (.25 + .75 * Math.abs(Math.sin(i * .7 + t * 1.7) * Math.cos(i * .23 - t))) * inv;
      const h = Math.max(2 * d, a * livello * H);
      cx.fillRect(i * passo, (H - h) / 2, 3 * d, h);
    }
  };
  // ferma ma ridisegnata ogni volta che la tela cambia misura: in Safari lo script parte prima degli stili
  const ro = new ResizeObserver(voci => voci.forEach(v => disegna(v.target, 1.3, .55)));
  tele.forEach(cv => ro.observe(cv));
  if (riduci) return;
  let t = 0, livello = .5, visibile = false;
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; }).observe(osserva);
  const giro = () => {
    const k = attiva();
    if (visibile && k >= 0 && tele[k]) {
      t += .06;
      livello += ((Math.sin(t * .9) > -.2 ? .85 : .12) - livello) * .08;   // parla, poi una pausa
      disegna(tele[k], t, livello);
    }
    requestAnimationFrame(giro);
  };
  giro();
}
