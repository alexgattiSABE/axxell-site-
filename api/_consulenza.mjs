// Logica del modulo «Richiedi una consulenza»: controlla i dati e manda due mail con Resend,
// una ad Axxell e una di conferma al cliente. Pura: fetch, ora ed env arrivano da fuori (test).
// Il trattino basso iniziale fa sì che Vercel non la pubblichi come funzione.

export const MITTENTE = 'Axxell <noreply@axxell.ai>';
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
export const INTERESSI = ['sabe', 'anima', 'atlas', 'chatbot', 'sito'];
const NOMI_INTERESSI = { sabe: 'SABE', anima: 'ANIMA', atlas: 'ATLAS', chatbot: 'Chatbot sul sito', sito: 'Sito web' };
const SITO = /^(https?:\/\/)?[^\s/]+\.[^\s/]{2,}(\/\S*)?$/i;
// i settori del modulo del sito vecchio
const NOMI_TIPI = {
  ristorazione: 'Ristorante / Pizzeria / Bar', benessere: 'Salute e benessere', sport: 'Sport e fitness',
  ospitalita: 'Hotel / B&B / Agriturismo', balneare: 'Stabilimento balneare / Lido', studio: 'Studio professionale',
  automotive: 'Automotive / Officina', commercio: 'E-commerce / Retail', altro: 'Altro',
};
export const TIPI = Object.keys(NOMI_TIPI);
const MAX = { nome: 60, cognome: 60, attivita: 120, email: 200, telefono: 30, messaggio: 2000 };
const PIVA = /^(IT)?\d{11}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO = /^[0-9+()\s-]+$/;
const TEMPO_MINIMO = 3000;
const FINESTRA = 10 * 60 * 1000;
const MASSIMO_IN_FINESTRA = 5;

const testo = v => (typeof v === 'string' ? v.trim() : '');
const riga = v => testo(v).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ');

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function valida(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const d = {
    nome: riga(c.nome), cognome: riga(c.cognome), attivita: riga(c.attivita), email: riga(c.email), telefono: riga(c.telefono),
    piva: riga(c.piva).replace(/\s+/g, '').toUpperCase(), privacy: c.privacy === true,
    tipo: riga(c.tipo), piano: riga(c.piano), periodo: riga(c.periodo) || 'mese', piano_atlas: riga(c.piano_atlas),
    sito_tipo: riga(c.sito_tipo), sito_url: riga(c.sito_url), messaggio: testo(c.messaggio), pagina: riga(c.pagina).slice(0, 200),
    interessi: Array.isArray(c.interessi) ? [...new Set(c.interessi.map(riga))] : [],
  };
  const campi = [];
  // obbligatori: nome, tipo di attività, email, telefono, privacy; cognome, azienda e partita IVA facoltativi
  if (!d.nome || d.nome.length > MAX.nome) campi.push('nome');
  if (d.cognome.length > MAX.cognome) campi.push('cognome');
  if (d.attivita.length > MAX.attivita) campi.push('attivita');
  if (!TIPI.includes(d.tipo)) campi.push('tipo');
  if (d.piva && !PIVA.test(d.piva)) campi.push('piva');
  if (d.email.length > MAX.email || !EMAIL.test(d.email)) campi.push('email');
  if (!d.telefono || d.telefono.length > MAX.telefono || !TELEFONO.test(d.telefono)) campi.push('telefono');
  if (!d.interessi.every(i => INTERESSI.includes(i))) campi.push('interessi');
  if (d.piano && !Object.hasOwn(PIANI, d.piano)) campi.push('piano');
  if (!['mese', 'anno'].includes(d.periodo)) campi.push('periodo');
  if (d.piano_atlas && !Object.hasOwn(PIANI_ATLAS, d.piano_atlas)) campi.push('piano_atlas');
  if (d.sito_tipo && !Object.hasOwn(TIPI_SITO, d.sito_tipo)) campi.push('sito_tipo');
  if (d.sito_url && (d.sito_url.length > 200 || !SITO.test(d.sito_url))) campi.push('sito_url');
  if (d.messaggio.length > MAX.messaggio) campi.push('messaggio');
  if (!d.privacy) campi.push('privacy');
  return campi.length ? { ok: false, campi } : { ok: true, dati: d };
}

const nomiInteressi = d => d.interessi.map(i => NOMI_INTERESSI[i]).join(', ');

export function oggetto(d) {
  const piani = [d.piano && PIANI[d.piano].nome + (d.periodo === 'anno' && PIANI[d.piano].mese ? ' annuale' : ''), d.piano_atlas && `ATLAS ${PIANI_ATLAS[d.piano_atlas].nome}`].filter(Boolean);
  const cosa = piani.length ? piani.join(' + ') : nomiInteressi(d);
  return ['Consulenza', cosa, d.attivita].filter(Boolean).join(' · ');
}

// le scelte fatte nel configuratore: solo valori dell'elenco, quindi possono tornare anche nella conferma
const scelte = d => [
  ['Tipo di attività', NOMI_TIPI[d.tipo] || ''], ['Cosa interessa', nomiInteressi(d)],
  ['Piano', descriviPiano(d.piano, d.periodo)], ['ATLAS', descriviAtlas(d.piano_atlas)], ['Sito web', TIPI_SITO[d.sito_tipo] || ''],
];

function righe(d) {
  return [
    ['Nome', `${d.nome} ${d.cognome}`.trim()], ['Azienda', d.attivita], ['P.IVA', d.piva], ['Email', d.email], ['Telefono', d.telefono],
    ...scelte(d), ['Sito attuale', d.sito_url], ['Messaggio', d.messaggio],
  ].filter(([, v]) => v);
}

const comeTesto = r => r.map(([k, v]) => (k === 'Messaggio' ? `${k}:\n${v}` : `${k}: ${v}`)).join('\n');
// Grafica delle mail, come il sito: sfondo chiaro, inchiostro blu scuro, Archivo, i colori dei tre prodotti.
// Solo tabelle e stili in linea, perché i programmi di posta ignorano il resto.
const F = "Archivo,'Helvetica Neue',Helvetica,Arial,sans-serif";
const INK = '#0b1033', INK2 = '#454d7a', LINEA = '#dde1f2', FONDO = '#f2f4ff';
const comeHtml = r => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${r.map(([k, v], i) => {
  const valore = k === 'Email' ? `<a href="mailto:${escapeHtml(v)}" style="color:#1d3cff;text-decoration:none">${escapeHtml(v)}</a>` : escapeHtml(v).replace(/\n/g, '<br>');
  return `<tr><td style="padding:12px 0;${i ? `border-top:1px solid ${LINEA};` : ''}"><p style="margin:0 0 4px;font:600 11px/1.3 ${F};letter-spacing:.12em;text-transform:uppercase;color:${INK2}">${escapeHtml(k)}</p><p style="margin:0;font:500 15px/1.55 ${F};color:${INK}">${valore}</p></td></tr>`;
}).join('')}</table>`;
function cornice({ etichetta, titolo, prima = '', righe = [], dopo = '' }) {
  const p = t => `<p style="margin:0 0 14px;font:400 15px/1.6 ${F};color:${INK}">${t}</p>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet"><title>${escapeHtml(titolo)}</title></head>
<body style="margin:0;padding:0;background:${FONDO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINEA};border-radius:16px;overflow:hidden">
<tr><td style="padding:0;font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="4" style="background:#e5ff1f"></td><td height="4" style="background:#ff1f8f"></td><td height="4" style="background:#1d3cff"></td></tr></table></td></tr>
<tr><td style="padding:28px 32px 22px;border-bottom:1px solid ${LINEA}">
<img src="https://axxell.ai/img/mail/axxell.png" width="124" height="27" alt="Axxell" style="display:block;border:0;margin:0 0 22px">
<p style="margin:0 0 8px;font:600 11px/1.3 ${F};letter-spacing:.14em;text-transform:uppercase;color:#d1006c">${escapeHtml(etichetta)}</p>
<h1 style="margin:0;font:700 22px/1.25 ${F};letter-spacing:-.01em;color:${INK}">${escapeHtml(titolo)}</h1>
</td></tr>
<tr><td style="padding:24px 32px 28px">${prima ? prima.map(p).join('') : ''}${righe.length ? comeHtml(righe) : ''}${dopo}</td></tr>
<tr><td style="padding:18px 32px;background:${FONDO};border-top:1px solid ${LINEA}"><p style="margin:0;font:500 12px/1.5 ${F};color:${INK2}">axxell.ai · info@axxell.ai</p></td></tr>
</table></td></tr></table></body></html>`;
}

const quando = ora => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ora);

export function componiMailAxxell(d, { a, ora }) {
  const r = [...righe(d), ['Pagina', d.pagina], ['Ricevuta', quando(ora)]].filter(([, v]) => v);
  return {
    from: MITTENTE, to: [a], reply_to: d.email, subject: oggetto(d),
    text: `Nuova richiesta di consulenza dal sito.\n\n${comeTesto(r)}\n\nRispondi a questa mail per scrivere direttamente al cliente.`,
    html: cornice({ etichetta: 'Dal sito · consulenza', titolo: 'Nuova richiesta di consulenza', righe: r,
      dopo: `<p style="margin:18px 0 0;font:400 13px/1.5 ${F};color:${INK2}">Rispondi a questa mail per scrivere direttamente al cliente.</p>` }),
  };
}

// La conferma parte verso un indirizzo scritto da chiunque: ripete solo le scelte fatte nel modulo
// (piano, interessi, tipo), mai testo libero, così non si può usare per mandare link da axxell.ai.
const NOME_PULITO = /^[\p{L}' -]{1,60}$/u;

export function componiConferma(d) {
  const r = scelte(d).filter(([, v]) => v);
  const saluto = NOME_PULITO.test(d.nome) ? `Ciao ${d.nome},` : 'Ciao,';
  return {
    from: MITTENTE, to: [d.email], reply_to: 'info@axxell.ai', subject: 'Abbiamo ricevuto la tua richiesta',
    text: `${saluto}\ngrazie per averci scritto: abbiamo ricevuto la tua richiesta di consulenza e ti rispondiamo entro 24 ore.${r.length ? `\n\nLe tue scelte:\n${comeTesto(r)}` : ''}\n\nSe vuoi aggiungere qualcosa, rispondi a questa mail.\n\nAxxell\nhttps://axxell.ai`,
    html: cornice({ etichetta: 'Richiesta ricevuta', titolo: 'Abbiamo ricevuto la tua richiesta',
      prima: [escapeHtml(saluto), 'grazie per averci scritto: ti rispondiamo <b>entro 24 ore</b>.', ...(r.length ? ['Le tue scelte:'] : [])],
      righe: r,
      dopo: `<p style="margin:18px 0 22px;font:400 15px/1.6 ${F};color:${INK}">Se vuoi aggiungere qualcosa, rispondi a questa mail.</p><a href="https://axxell.ai" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${INK};color:#ffffff;font:600 14px/1 ${F};text-decoration:none">Scopri Axxell</a>` }),
  };
}

// Limite di cortesia: vive nella memoria della singola istanza, basta a fermare chi insiste.
const RICHIESTE = new Map();
export function azzeraLimite() { RICHIESTE.clear(); }
export function ipInMemoria() { return RICHIESTE.size; }
function troppe(ip, ora) {
  // gli IP più vecchi di 10 minuti si dimenticano (lo dice la privacy)
  for (const [chi, tempi] of RICHIESTE) if (!tempi.some(t => ora - t < FINESTRA)) RICHIESTE.delete(chi);
  const recenti = (RICHIESTE.get(ip) || []).filter(t => ora - t < FINESTRA);
  if (recenti.length >= MASSIMO_IN_FINESTRA) { RICHIESTE.set(ip, recenti); return true; }
  recenti.push(ora);
  RICHIESTE.set(ip, recenti);
  return false;
}

async function invia(fetchFn, chiave, mail) {
  try {
    const r = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function gestisci({ metodo, corpo, ip = '', env = {}, fetch: fetchFn, ora = Date.now() }) {
  if (metodo !== 'POST') return { stato: 405, json: { errore: 'metodo' } };
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const tempo = Number(c.ms_sulla_pagina);
  // Ai robot non si dice che sono stati scoperti: risposta normale, nessuna mail.
  if (testo(c.sito_web) || !Number.isFinite(tempo) || tempo < TEMPO_MINIMO) return { stato: 200, json: { ok: true } };
  if (troppe(ip || 'sconosciuto', ora)) return { stato: 429, json: { errore: 'troppe' } };
  const v = valida(c);
  if (!v.ok) return { stato: 400, json: { errore: 'campi', campi: v.campi } };
  if (!env.RESEND_API_KEY) return { stato: 500, json: { errore: 'configurazione' } };
  const a = env.CONSULENZA_A || 'info@axxell.ai';
  if (!(await invia(fetchFn, env.RESEND_API_KEY, componiMailAxxell(v.dati, { a, ora })))) return { stato: 502, json: { errore: 'invio' } };
  await invia(fetchFn, env.RESEND_API_KEY, componiConferma(v.dati));
  return { stato: 200, json: { ok: true } };
}
