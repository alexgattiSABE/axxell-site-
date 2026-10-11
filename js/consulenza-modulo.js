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
  nome: 'Scrivi il tuo nome.',
  cognome: 'Scrivi il tuo cognome.',
  attivita: "Scrivi il nome dell'azienda.",
  tipo: 'Scegli il tipo di attività.',
  piva: 'Controlla la partita IVA: 11 cifre, con o senza IT davanti.',
  email: "Controlla l'email: deve essere come nome@dominio.it.",
  telefono: 'Scrivi il telefono: solo numeri, spazi e il +.',
  messaggio: 'Le note possono essere lunghe al massimo 2000 caratteri.',
  privacy: 'Per inviare la richiesta conferma di aver letto la privacy.',
};

const t = v => (typeof v === 'string' ? v.trim() : '');

// Gli stessi controlli della funzione sul server (api/_consulenza.mjs), per dire subito cosa correggere.
// Obbligatori come nel modulo del sito vecchio.
export function controlla(d) {
  const campi = [];
  if (!t(d.nome) || t(d.nome).length > 60) campi.push('nome');
  if (!t(d.cognome) || t(d.cognome).length > 60) campi.push('cognome');
  if (!t(d.attivita) || t(d.attivita).length > 120) campi.push('attivita');
  if (!t(d.tipo)) campi.push('tipo');
  if (!/^(IT)?\d{11}$/.test(t(d.piva).replace(/\s+/g, '').toUpperCase())) campi.push('piva');
  if (t(d.email).length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t(d.email))) campi.push('email');
  if (!t(d.telefono) || t(d.telefono).length > 30 || !/^[0-9+()\s-]+$/.test(t(d.telefono))) campi.push('telefono');
  if (t(d.messaggio).length > 2000) campi.push('messaggio');
  if (d.privacy !== true) campi.push('privacy');
  return campi;
}
