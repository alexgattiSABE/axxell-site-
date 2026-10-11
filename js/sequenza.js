export function creaSequenza({ scene, passaggio, suCambio = () => {}, orologio }) {
  let indice = 0;
  let ctrl = null;

  async function giro(da) {
    ctrl?.abort();
    const c = new AbortController();
    ctrl = c;
    const s = c.signal;
    let i = da;
    try {
      for (;;) {
        if (s.aborted) return;
        indice = i;
        scene[i].azzera();
        suCambio(i, 'scena');
        await scene[i].recita(s, orologio);
        if (s.aborted) return;
        const j = (i + 1) % scene.length;
        suCambio(j, 'passaggio');
        await passaggio(i, j, s);
        i = j;
      }
    } catch (e) {
      if (e?.name !== 'AbortError') console.error(e);
    }
  }

  return {
    avvia(i = 0) { giro(i); },
    vai(i) { giro(i); },
    ferma() { ctrl?.abort(); ctrl = null; },
    get indice() { return indice; },
    get attiva() { return !!ctrl && !ctrl.signal.aborted; },
  };
}
