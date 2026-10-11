export const abortito = () => new DOMException('Interrotto', 'AbortError');

export function creaOrologio() {
  let inPausa = false;
  const inAttesa = new Set();

  function attendi(ms, segnale) {
    return new Promise((ok, ko) => {
      if (segnale?.aborted) return ko(abortito());
      const w = { resto: ms, inizio: 0, timer: null };
      const finito = () => { inAttesa.delete(w); segnale?.removeEventListener('abort', annulla); ok(); };
      const annulla = () => { clearTimeout(w.timer); inAttesa.delete(w); ko(abortito()); };
      w.parti = () => { w.inizio = Date.now(); w.timer = setTimeout(finito, Math.max(0, w.resto)); };
      w.ferma = () => { clearTimeout(w.timer); w.resto -= Date.now() - w.inizio; };
      segnale?.addEventListener('abort', annulla, { once: true });
      inAttesa.add(w);
      if (!inPausa) w.parti();
    });
  }

  return {
    attendi,
    pausa() { if (inPausa) return; inPausa = true; inAttesa.forEach(w => w.ferma()); },
    riprendi() { if (!inPausa) return; inPausa = false; inAttesa.forEach(w => w.parti()); },
    get inPausa() { return inPausa; },
  };
}
