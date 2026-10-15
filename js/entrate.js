import { riduci } from './utili.js';

// Entrate e uscite di testi e caselle, nello stesso linguaggio dell'apertura (la maschera che svela):
//   nome     → l'icona si posa ruotando, il nome esce da dietro di lei e si mette a fuoco (il momento principale)
//   parole   → titoli e motti salgono parola per parola da una maschera, da sfocati a nitidi
//   testo    → i paragrafi si svelano dall'alto con un bordo morbido
//   elenco   → le voci entrano in fila e la spunta si disegna
//   casella  → la casella si apre dall'alto con un taglio netto, poi entra quello che contiene
//   scena    → mazzo, pila e scrivania si aprono dal centro
// Uscita: quando un elemento passa sotto la barra in alto si sfoca e sale; tornando su, rientra.
// Senza script (o con window.SENZA_ENTRATE, che usano i controlli di misura) tutto resta visibile e fermo.
const GRUPPI = [
  ['nome', '.product .nome'],
  ['parole', '#h-tecnica, .pilastri h2, .product .motto, #h-perche, #h-ripaga, .passi b, .ps h2, .sp-titolo, .sp-h2, .sp-h3, .sp-chiusura'],
  ['testo', '.tecnica-testa > p:last-child, .ps p, .anima-info .intro, .atlas-lato .intro, .product .note, .anima-info .hint, .sp-intro'],
  ['casella', '.tecnica-schema, .atlas .gruppi > div, .app li, .anima > .more, .atlas > .more, .sabe-info > .more, .calcolo, .sp-stat, .sp-gruppi > div, .sp-piano, .an-numero, .pb-voce, .an-app, .an-fc, .an-fc-mese, .an-margini-carta, .an-giorni-carta, .an-prezzi-elenco, .an-prezzi-fornitore, .an-grafico, .at-area, .at-pro-blocco, .at-numero,  .at-esempio, .at-privacy-carte article, .at-anima-gruppi, .an-insieme-carta, .se-carte article, .se-mondo, .se-tecnica, .se-servizio, .vi-credo, .vi-ragione, .vi-fisco-carta, .vi-grafico'],
  ['elenco', '.tecnica-righe > div, .ps li, .funzioni li, .servizi-gruppi > div, .sezioni li, .app-blocco h3, .numeri li, .ripaga-elenco li, .passi li, .close-row, .sp-fatti li, .sp-passi li, .sp-domande details, .sp-altre-elenco li, .sp-nota, .an-reparto, .an-consiglio'],
  ['scena', '#sabePila, #animaPalco, #atlasScrivania, .atlas .compiti'],
];
const PASSO = { elenco: 70, casella: 90, parole: 32 };   // le risposte del «Perché» e i passi finali seguono il passo degli elenchi
const MAX = 520;   // ms: anche gli elenchi lunghi finiscono di entrare presto

function inParole(el) {
  const parti = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', el.textContent.trim());
  el.innerHTML = parti.map((p, i) => `<span class="parola" aria-hidden="true"><span style="--d:${Math.min(i * PASSO.parole, MAX)}">${p}</span></span>`).join(' ');
}

function nome(el) {
  const testo = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
  if (!testo) return;
  const s = document.createElement('span');
  s.className = 'nome-testo';
  s.textContent = testo.textContent.trim();
  testo.replaceWith(s);
}

export function avviaEntrate() {
  if (window.SENZA_ENTRATE || !('IntersectionObserver' in window)) return;
  const radice = document.documentElement;
  radice.classList.add(riduci ? 'entrate-dolci' : 'entrate');

  const tutti = [];
  for (const [tipo, sel] of GRUPPI) {
    const els = [...document.querySelectorAll(sel)].filter(el => !el.dataset.entra);
    // il ritardo conta la posizione fra i fratelli dello stesso gruppo (le voci di un elenco, le caselle di una fila)
    els.forEach(el => {
      const fratelli = els.filter(x => x.parentElement === el.parentElement);
      const k = fratelli.indexOf(el);
      el.dataset.entra = tipo;
      el.style.setProperty('--d', Math.min(k * (PASSO[tipo] || 0), MAX));
      if (tipo === 'parole' && !riduci) inParole(el);
      if (tipo === 'nome' && !riduci) nome(el);
      tutti.push(el);
    });
  }
  // le voci dentro una casella partono dopo che la casella si è aperta
  // e così le spunte dei servizi di SABE, una dopo l'altra
  document.querySelectorAll('[data-entra="casella"] li, [data-entra="elenco"] .servizi li').forEach(li => {
    const i = [...li.parentElement.children].indexOf(li);
    li.style.setProperty('--d2', 260 + Math.min(i * 60, 300));
  });

  const nav = document.querySelector('header.nav')?.getBoundingClientRect().height || 72;
  const io = new IntersectionObserver(voci => {
    for (const v of voci) {
      const el = v.target;
      if (v.isIntersecting) { el.classList.remove('uscito'); el.classList.add('dentro'); continue; }
      const sopra = v.boundingClientRect.bottom <= (v.rootBounds ? v.rootBounds.top : nav) + 1;
      if (sopra) el.classList.add('uscito');                          // è passato sotto la barra: esce verso l'alto
      else el.classList.remove('dentro', 'uscito');                   // è tornato sotto lo schermo: rientrerà
    }
  }, { rootMargin: `-${Math.round(nav + 8)}px 0px -8% 0px`, threshold: 0 });
  tutti.forEach(el => io.observe(el));
}
