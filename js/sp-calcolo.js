import { euro } from './euro.js';

// Il valore delle chiamate che SABE recupera, coi numeri del visitatore:
// chiamate perse a settimana × quota che era una prenotazione o un ordine × settimane in un mese × persone × spesa media.
// Il mese si arrotonda alle decine e l'anno è dodici volte il mese, così i due numeri tornano fra loro.
export const LIGHT = 149;      // € al mese
const SETTIMANE = 4.3;

export function stimaSabe({ chiamate, quota, persone, spesa }) {
  const coperti = Math.round(chiamate * (quota / 100) * SETTIMANE * persone);   // il mese parte dai coperti mostrati, così il conto torna
  const mese = Math.round(coperti * spesa / 10) * 10;
  return { coperti, mese, anno: mese * 12, ripaga: Math.ceil(LIGHT / spesa) };
}

export function avviaCalcoloSabe() {
  const f = document.getElementById('calcoloSabe');
  if (!f) return;
  const testi = { chiamate: v => v, quota: v => `${v}%`, persone: v => v, spesa: v => euro(v) };
  const mese = f.querySelector('.stima-totale'), anno = f.querySelector('.stima-anno'), parti = f.querySelector('.stima-parti');
  const calcola = () => {
    const ingressi = [...f.querySelectorAll('input')];
    const v = Object.fromEntries(ingressi.map(i => [i.name, +i.value]));
    ingressi.forEach(i => {
      i.previousElementSibling.textContent = testi[i.name](+i.value);
      i.style.setProperty('--pieno', `${(i.value - i.min) / (i.max - i.min) * 100}%`);
    });
    const s = stimaSabe(v);
    mese.textContent = euro(s.mese);
    anno.textContent = euro(s.anno);
    parti.innerHTML = `<span><b>${s.coperti}</b> coperti recuperati al mese</span><span>Light si ripaga con <b>${s.ripaga}</b> coperti al mese</span>`;
  };
  f.addEventListener('input', calcola);
  f.addEventListener('submit', e => e.preventDefault());
  calcola();
}
