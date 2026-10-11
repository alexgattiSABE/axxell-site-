// Modulo «Richiedi una consulenza»: parti senza DOM, usate dalla pagina e dai test.
export const PIANI = {
  start: 'Start · 49 € al mese, IVA inclusa',
  light: 'Light · 149 € al mese, IVA inclusa',
  pro: 'Pro · 249 € al mese, IVA inclusa',
  enterprise: 'Enterprise · su misura',
};

const PRODOTTI = ['sabe', 'anima', 'atlas', 'servizi'];

// ?prodotto=sabe|anima|atlas|servizi spunta la casella; ?piano=… mostra il piano e spunta ciò che contiene:
// Start è solo ANIMA, Light/Pro/Enterprise sono SABE insieme ad ANIMA.
export function leggiIndirizzo(search) {
  const p = new URLSearchParams(search);
  const interessi = new Set();
  const prodotto = p.get('prodotto');
  if (PRODOTTI.includes(prodotto)) interessi.add(prodotto);
  const scelto = p.get('piano') || '';
  const piano = Object.hasOwn(PIANI, scelto) ? scelto : '';
  if (piano === 'start') interessi.add('anima');
  else if (piano) { interessi.add('sabe'); interessi.add('anima'); }
  return { interessi: [...interessi], piano };
}

export const MESSAGGI = {
  nome: 'Scrivi il tuo nome e cognome.',
  attivita: "Scrivi il nome dell'attività.",
  email: "Controlla l'email: deve essere come nome@dominio.it.",
  telefono: 'Il telefono può avere solo numeri, spazi e il +.',
  messaggio: 'Il messaggio può essere lungo al massimo 2000 caratteri.',
};

const t = v => (typeof v === 'string' ? v.trim() : '');

// Gli stessi controlli della funzione sul server (api/_consulenza.mjs), per dire subito cosa correggere.
export function controlla(d) {
  const campi = [];
  if (!t(d.nome) || t(d.nome).length > 100) campi.push('nome');
  if (!t(d.attivita) || t(d.attivita).length > 120) campi.push('attivita');
  if (t(d.email).length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t(d.email))) campi.push('email');
  if (t(d.telefono) && (t(d.telefono).length > 30 || !/^[0-9+()\s-]+$/.test(t(d.telefono)))) campi.push('telefono');
  if (t(d.messaggio).length > 2000) campi.push('messaggio');
  return campi;
}
