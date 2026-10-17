// Modulo «Richiedi una consulenza»: parti senza DOM, usate dalla pagina e dai test.
// Listino (IVA inclusa): SABE e ANIMA condividono i piani, al mese o all'anno; ATLAS solo al mese.
export const PIANI = {
  start: { nome: 'Start', mese: 49, anno: 490 },
  light: { nome: 'Light', mese: 149, anno: 1490 },
  pro: { nome: 'Pro', mese: 249, anno: 2490 },
  enterprise: { nome: 'Enterprise' },
};
export const PIANI_ATLAS = {
  light: { nome: 'Light', mese: 29 },
  pro: { nome: 'Pro', mese: 149 },
};
export const TIPI_SITO = {
  landing: 'Landing page', vetrina: 'Sito vetrina', ecommerce: 'E-commerce', prenotazioni: 'Sito con prenotazioni',
  portfolio: 'Portfolio', rifacimento: 'Rifare il sito che ho', nonso: 'Non so ancora',
};
const migliaia = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function descriviPiano(piano, periodo = 'mese') {
  const p = PIANI[piano];
  if (!p) return '';
  if (!p.mese) return `${p.nome} · su misura`;
  return periodo === 'anno' ? `${p.nome} · ${migliaia(p.anno)} € l'anno, IVA inclusa` : `${p.nome} · ${migliaia(p.mese)} € al mese, IVA inclusa`;
}
export function descriviAtlas(piano) {
  const p = PIANI_ATLAS[piano];
  return p ? `${p.nome} · ${migliaia(p.mese)} € al mese, IVA inclusa` : '';
}

const PRODOTTI = ['sabe', 'anima', 'atlas', 'chatbot', 'sito'];

// ?prodotto=sabe|anima|atlas|servizi spunta la casella; ?piano=… mostra il piano e spunta ciò che contiene:
// Start è solo ANIMA, Light/Pro/Enterprise sono SABE insieme ad ANIMA.
export function leggiIndirizzo(search) {
  const p = new URLSearchParams(search);
  const interessi = new Set();
  const prodotto = p.get('prodotto');
  if (PRODOTTI.includes(prodotto)) interessi.add(prodotto);
  if (prodotto === 'servizi') { interessi.add('chatbot'); interessi.add('sito'); }   // dalla pagina Servizi: chatbot e sito web
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
  sito_url: "Controlla l'indirizzo del sito, per esempio www.tuosito.it.",
};

const t = v => (typeof v === 'string' ? v.trim() : '');

// Gli stessi controlli della funzione sul server (api/_consulenza.mjs), per dire subito cosa correggere.
// Obbligatori solo nome, tipo di attività, email, telefono e privacy: il resto si chiede dopo, in consulenza.
export function controlla(d) {
  const campi = [];
  if (!t(d.nome) || t(d.nome).length > 60) campi.push('nome');
  if (t(d.cognome).length > 60) campi.push('cognome');
  if (t(d.attivita).length > 120) campi.push('attivita');
  if (!t(d.tipo)) campi.push('tipo');
  if (t(d.piva) && !/^(IT)?\d{11}$/.test(t(d.piva).replace(/\s+/g, '').toUpperCase())) campi.push('piva');
  if (t(d.email).length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t(d.email))) campi.push('email');
  if (!t(d.telefono) || t(d.telefono).length > 30 || !/^[0-9+()\s-]+$/.test(t(d.telefono))) campi.push('telefono');
  if (t(d.sito_url) && (t(d.sito_url).length > 200 || !/^(https?:\/\/)?[^\s/]+\.[^\s/]{2,}(\/\S*)?$/i.test(t(d.sito_url)))) campi.push('sito_url');
  if (t(d.messaggio).length > 2000) campi.push('messaggio');
  if (d.privacy !== true) campi.push('privacy');
  return campi;
}
