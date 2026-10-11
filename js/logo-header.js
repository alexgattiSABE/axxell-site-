// In alto il logotipo AXXELL: la A in 3D arriva scomposta, si ricompone e accanto compare la scritta (js/axxell-header-logo.js);
// e in ciclo continuo: la scritta sparisce prima di ogni scomposizione e ricompare dopo. Anche sul telefono.
// three.js pesa: si carica a pagina pronta; finché non parte, o se WebGL manca, resta il logotipo piatto.
export function avviaLogoHeader() {
  const box = document.querySelector('.brand-logo');
  if (!box) return;
  const parti = () => {
    import('./axxell-header-logo.js').then(({ createAxxellHeaderLogo }) => {
      const css = getComputedStyle(document.documentElement);
      createAxxellHeaderLogo(box, { mode: 'loop', color: css.getPropertyValue('--sistema').trim(), accent: css.getPropertyValue('--appoggio-gamba').trim() });   // i colori del logotipo sul chiaro
      box.classList.add('vivo');
    }).catch(() => {});   // resta il piatto
  };
  if (document.readyState === 'complete') parti();
  else addEventListener('load', parti, { once: true });
}
