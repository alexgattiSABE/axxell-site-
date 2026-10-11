// Il menu a tendina del telefono: un tasto nella barra apre le pagine (SABE, ANIMA, ATLAS, Servizi, Visione) con
// «Richiedi una consulenza» sempre in fondo. Si chiude toccando un link, fuori dalla tendina, col tasto Esc o allargando
// la finestra. Sul computer il tasto non si vede e i link restano nella barra (css/base.css).
export function avviaMenu() {
  const nav = document.querySelector('.nav'), voci = document.getElementById('navVoci');
  if (!nav || !voci) return;
  const tasto = document.createElement('button');
  tasto.type = 'button'; tasto.className = 'nav-tasto';
  tasto.setAttribute('aria-controls', 'navVoci');
  tasto.innerHTML = '<svg viewBox="0 0 24 22" aria-hidden="true"><line class="l1" x1="4" y1="6" x2="20" y2="6"/><line class="l2" x1="4" y1="11" x2="20" y2="11"/><line class="l3" x1="4" y1="16" x2="20" y2="16"/></svg>';
  voci.before(tasto);
  const imposta = aperto => {
    nav.classList.toggle('aperto', aperto);
    tasto.setAttribute('aria-expanded', String(aperto));
    tasto.setAttribute('aria-label', aperto ? 'Chiudi il menu' : 'Apri il menu');
  };
  imposta(false);
  tasto.addEventListener('click', () => imposta(!nav.classList.contains('aperto')));
  voci.addEventListener('click', e => { if (e.target.closest('a')) imposta(false); });
  document.addEventListener('click', e => { if (nav.classList.contains('aperto') && !nav.contains(e.target)) imposta(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('aperto')) { imposta(false); tasto.focus(); } });
  matchMedia('(min-width:721px)').addEventListener('change', e => { if (e.matches) imposta(false); });
}
