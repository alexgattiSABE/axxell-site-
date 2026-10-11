// Il simbolo «Appoggio» (la A di Axxell) in 3D accanto al titolo: si divide in tre pezzi, restano sospesi girando,
// poi si ricompone e resta frontale (js/axxell-appoggio-3d.js).
// three.js pesa: si carica solo dove il logo si vede e dopo che la pagina è pronta.
// Finché il 3D non parte (o se WebGL manca) resta il disegno fermo dello stesso simbolo.
export function avviaLogo3d() {
  const box = document.querySelector('.logo-3d');
  if (!box) return;
  const css = getComputedStyle(document.documentElement);
  const colore = v => css.getPropertyValue(v).trim();
  const parti = () => getComputedStyle(box).display !== 'none' && import('./axxell-appoggio-3d.js').then(({ createAxxellAppoggio3D }) => {
    createAxxellAppoggio3D(box, { color: colore('--sistema'), accent: colore('--appoggio-gamba'), maxPixelRatio: 1.75 });   // i colori del logo sul chiaro
    box.classList.add('vivo');
  }).catch(() => {});   // resta il disegno fermo
  if (document.readyState === 'complete') parti();
  else addEventListener('load', parti, { once: true });
}
