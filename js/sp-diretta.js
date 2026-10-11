import { riduci } from './utili.js';

// In apertura, sullo sfondo della pagina: i problemi di una serata al telefono cadono dritti uno sull'altro.
// Poi arriva l'icona di SABE, una card in 3D: cade sulla pila e la schiaccia, sale crescendo e gira,
// e sul retro (il lato opposto al simbolo) compaiono le soluzioni, una alla volta. Restano il tempo di leggerle,
// poi la card torna sul fronte, si rimpicciolisce, se ne va e si ricomincia. Fuori schermo il tempo si ferma.
const IMPILA = 4000, CADUTA = 560, COLPO = 1500, GIRO = 2200, OGNI = 520, PAUSA = 2000, A_PAROLA = 300, VIA = 800;   // ms
const PICCOLA = .3;   // la card quando cade: grande come un'icona

export function avviaDiretta() {
  const box = document.getElementById('spDiretta');
  if (!box) return;
  const pila = box.querySelector('.sp-pila'), carta = box.querySelector('.sp-carta'), giro = box.querySelector('.sp-carta-giro');
  const urto = box.querySelector('.sp-urto'), scena = box.querySelector('.sp-diretta-scena');
  const guai = [...pila.querySelectorAll('.sp-guaio')], righe = [...box.querySelectorAll('.sp-risolto li')];
  const lettura = PAUSA + box.querySelector('.sp-risolto').textContent.trim().split(/\s+/).length * A_PAROLA;

  if (riduci) {
    box.dataset.fase = 'risponde';
    pila.classList.add('schiacciata'); box.classList.add('risolta'); carta.classList.add('colpito');
    righe.forEach(r => r.classList.add('vista'));
    giro.style.transform = 'rotateY(180deg)'; box.dataset.lato = 'retro';
    return;
  }
  let visibile = true;
  new IntersectionObserver(([e]) => { visibile = e.isIntersecting; }).observe(box);

  // un'attesa che conta solo il tempo in cui la scena si vede; ogni passo può aggiornare qualcosa (p da 0 a 1)
  const attendi = (ms, passo = () => {}) => new Promise(fine => {
    let fatto = 0, t0 = performance.now();
    const giro = t => {
      if (visibile) fatto += t - t0;
      t0 = t;
      const p = Math.min(1, fatto / ms);
      passo(p);
      if (p < 1) requestAnimationFrame(giro); else fine();
    };
    requestAnimationFrame(giro);
  });

  // un problema cade dritto sulla pila, sormonta quelli sotto, rimbalza appena e si posa; la pila sotto accusa il colpo
  const cade = g => {
    g.classList.add('posata');
    g.animate([
      { transform: 'translateY(-480px)', opacity: 0 },
      { opacity: 1, offset: .25 },
      { transform: 'translateY(0)', offset: .74 },
      { transform: 'translateY(-8px)', offset: .87 },
      { transform: 'none', opacity: 1 }
    ], { duration: CADUTA, easing: 'cubic-bezier(.45,0,.7,1)' });
    pila.animate([{ transform: 'none' }, { transform: 'scaleY(.97)' }, { transform: 'none' }], { duration: 240, delay: CADUTA * .72 });
  };

  // le misure, prese ogni volta dal layout: dove la card piccola tocca la pila e dove si posa a terra
  const misure = () => {
    const s = scena.getBoundingClientRect(), c = carta.getBoundingClientRect(), cima = guai[guai.length - 1].getBoundingClientRect().top - s.top;
    const centro = c.top - s.top + c.height / 2, mezza = carta.offsetHeight * PICCOLA / 2;
    return { tocca: cima - mezza - centro, terra: s.height - 12 - mezza - centro, sopra: -centro - mezza - 40 };
  };

  // la card gira sull'asse verticale; il lato che si vede lo decide l'angolo (non solo backface-visibility,
  // che dove il 3D non è accelerato non basta): fra 90° e 270° c'è il retro
  const gira = (deg, ombra = '') => {
    giro.style.transform = `rotateY(${deg}deg)${ombra}`;
    const a = ((deg % 360) + 360) % 360;
    box.dataset.lato = a > 90 && a < 270 ? 'retro' : 'fronte';
  };
  const morbido = t => 1 - Math.pow(1 - t, 4), dolce = t => (t < .5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2);
  const ruota = (da, a, ms, curva) => attendi(ms, p => gira(da + (a - da) * curva(p)));

  let movimenti = [];
  const muovi = (el, k, o) => { const a = el.animate(k, { fill: 'forwards', ...o }); movimenti.push(a); return a; };

  // la card cade piccola, inclinata, tocca la pila e la schiaccia, si assesta a terra; poi sale crescendo e gira sul retro
  const colpisce = async () => {
    const m = misure(), p = s => `scale(${PICCOLA * s[0]},${PICCOLA * s[1]})`;
    carta.classList.add('colpito');
    ruota(-70, 0, COLPO * .74, morbido);
    const giu = muovi(carta, [
      { transform: `translateY(${m.sopra}px) ${p([1, 1])}`, offset: 0 },
      { transform: `translateY(${m.tocca}px) ${p([1, 1])}`, offset: .5, easing: 'cubic-bezier(.6,0,1,.6)' },
      { transform: `translateY(${m.terra}px) ${p([1.22, .74])}`, offset: .74 },
      { transform: `translateY(${m.terra - 12}px) ${p([.94, 1.08])}`, offset: .87 },
      { transform: `translateY(${m.terra}px) ${p([1, 1])}`, offset: 1 }
    ], { duration: COLPO, easing: 'cubic-bezier(.5,0,.9,.5)' });
    setTimeout(() => pila.classList.add('schiacciata'), COLPO * .48);
    urto.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(2.4)', opacity: 0 }], { duration: 650, delay: COLPO * .74, easing: 'cubic-bezier(.2,.8,.3,1)' });
    scena.animate([{ transform: 'none' }, { transform: 'translateY(3px)' }, { transform: 'none' }], { duration: 220, delay: COLPO * .74 });
    await giu.finished;
    muovi(carta, [{ transform: `translateY(${m.terra}px) ${p([1, 1])}` }, { transform: 'none' }], { duration: GIRO, easing: 'cubic-bezier(.16,1,.3,1)' });
    // un giro e mezzo: finisce sul retro, dove ci sono le soluzioni
    return ruota(0, 540, GIRO, morbido);
  };

  // tutto torna com'era, senza transizioni, per il giro dopo
  const azzera = () => {
    box.classList.add('azzera');
    box.classList.remove('risolta');
    pila.classList.remove('schiacciata');
    guai.forEach(g => g.classList.remove('posata'));
    righe.forEach(r => r.classList.remove('vista'));
    carta.classList.remove('colpito');
    movimenti.forEach(a => a.cancel()); movimenti = [];
    gira(0);
    box.style.setProperty('--letto', 0);
    void box.offsetWidth;
    box.classList.remove('azzera');
  };

  (async () => {
    for (;;) {
      azzera();
      box.dataset.fase = 'squilla';
      let cadute = 0;
      await attendi(IMPILA, p => {
        // l'ultimo problema si posa poco prima della fine
        while (cadute < guai.length && p * IMPILA >= 350 + cadute * (IMPILA - 350 - CADUTA) / (guai.length - 1)) cade(guai[cadute++]);
      });
      box.dataset.fase = 'risponde';
      const girata = colpisce();
      await attendi(COLPO + GIRO * .55);   // a metà del giro il retro è già davanti
      box.classList.add('risolta');
      let viste = 0;
      await attendi(OGNI * righe.length, p => { while (viste < righe.length && p * righe.length >= viste) righe[viste++].classList.add('vista'); });
      await girata;
      await attendi(lettura, p => box.style.setProperty('--letto', p.toFixed(3)));
      // torna sul fronte, si rimpicciolisce e vola via
      ruota(540, 720, VIA, dolce);
      muovi(carta, [{ transform: 'none', opacity: 1 }, { transform: `translateY(-60px) scale(${PICCOLA})`, opacity: 1, offset: .7 }, { transform: `translateY(-560px) scale(${PICCOLA})`, opacity: 0 }], { duration: VIA * 1.3, easing: 'cubic-bezier(.5,0,.75,0)' });
      await attendi(VIA * 1.3);
    }
  })();
}
