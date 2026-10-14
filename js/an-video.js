import { riduci } from './utili.js';

// I due video della pagina (l'occhio che osserva, le quattro app): sul telefono il taglio verticale, altrove quello largo.
// Partono quando entrano in vista e si fermano quando escono; con il movimento ridotto restano fermi sul fotogramma, con i comandi.
const stretto = matchMedia('(max-width:720px)').matches;

export function avviaVideo() {
  document.querySelectorAll('video[data-video]').forEach(v => {
    const base = v.dataset.video + (stretto ? '-9x16' : '-16x9');
    v.poster = base + '.jpg';
    for (const [ext, tipo] of [['mp4', 'video/mp4'], ['webm', 'video/webm']]) {
      const sorgente = document.createElement('source');
      sorgente.src = base + '.' + ext; sorgente.type = tipo;
      v.append(sorgente);
    }
    v.load();
    v.closest('.an-video')?.classList.toggle('an-video--alto', stretto);
    if (riduci) { v.controls = true; return; }
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => { v.controls = true; });
      else v.pause();
    }, { threshold: .35 }).observe(v);
  });
}
