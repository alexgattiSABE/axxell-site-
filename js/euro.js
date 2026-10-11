// 1.440 €: Intl in italiano non separa le migliaia sotto 10.000, quindi i punti li mettiamo noi
export const euro = n => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
