// Logica del modulo «Richiedi una consulenza»: controlla i dati e manda due mail con Resend,
// una ad Axxell e una di conferma al cliente. Pura: fetch, ora ed env arrivano da fuori (test).
// Il trattino basso iniziale fa sì che Vercel non la pubblichi come funzione.

export const MITTENTE = 'Axxell <noreply@axxell.ai>';
export const PIANI = {
  start: 'Start · 49 € al mese, IVA inclusa',
  light: 'Light · 149 € al mese, IVA inclusa',
  pro: 'Pro · 249 € al mese, IVA inclusa',
  enterprise: 'Enterprise · su misura',
};
const PIANI_BREVI = { start: 'Start', light: 'Light', pro: 'Pro', enterprise: 'Enterprise' };
export const INTERESSI = ['sabe', 'anima', 'atlas', 'servizi'];
const NOMI_INTERESSI = { sabe: 'SABE', anima: 'ANIMA', atlas: 'ATLAS', servizi: 'Servizi' };
export const TIPI = ['ristorante', 'pizzeria', 'bar', 'hotel', 'altro'];
const NOMI_TIPI = { ristorante: 'Ristorante', pizzeria: 'Pizzeria', bar: 'Bar', hotel: 'Hotel', altro: 'Altro' };
const MAX = { nome: 100, attivita: 120, email: 200, telefono: 30, messaggio: 2000 };
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
    nome: riga(c.nome), attivita: riga(c.attivita), email: riga(c.email), telefono: riga(c.telefono),
    tipo: riga(c.tipo), piano: riga(c.piano), messaggio: testo(c.messaggio), pagina: riga(c.pagina).slice(0, 200),
    interessi: Array.isArray(c.interessi) ? [...new Set(c.interessi.map(riga))] : [],
  };
  const campi = [];
  if (!d.nome || d.nome.length > MAX.nome) campi.push('nome');
  if (!d.attivita || d.attivita.length > MAX.attivita) campi.push('attivita');
  if (d.email.length > MAX.email || !EMAIL.test(d.email)) campi.push('email');
  if (d.telefono && (d.telefono.length > MAX.telefono || !TELEFONO.test(d.telefono))) campi.push('telefono');
  if (d.tipo && !TIPI.includes(d.tipo)) campi.push('tipo');
  if (!d.interessi.every(i => INTERESSI.includes(i))) campi.push('interessi');
  if (d.piano && !Object.hasOwn(PIANI, d.piano)) campi.push('piano');
  if (d.messaggio.length > MAX.messaggio) campi.push('messaggio');
  return campi.length ? { ok: false, campi } : { ok: true, dati: d };
}

const nomiInteressi = d => d.interessi.map(i => NOMI_INTERESSI[i]).join(', ');

export function oggetto(d) {
  const cosa = d.piano ? PIANI_BREVI[d.piano] : nomiInteressi(d);
  return ['Consulenza', cosa, d.attivita].filter(Boolean).join(' · ');
}

function righe(d) {
  return [
    ['Nome', d.nome], ['Attività', d.attivita], ['Tipo di attività', NOMI_TIPI[d.tipo] || ''],
    ['Email', d.email], ['Telefono', d.telefono], ['Cosa interessa', nomiInteressi(d)],
    ['Piano scelto', d.piano ? PIANI[d.piano] : ''], ['Messaggio', d.messaggio],
  ].filter(([, v]) => v);
}

const comeTesto = r => r.map(([k, v]) => (k === 'Messaggio' ? `${k}:\n${v}` : `${k}: ${v}`)).join('\n');
const comeHtml = r => `<table cellpadding="6" style="border-collapse:collapse;font:15px/1.5 Arial,sans-serif;color:#0b1033">${
  r.map(([k, v]) => `<tr><td style="vertical-align:top;color:#454d7a;white-space:nowrap">${escapeHtml(k)}</td><td>${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`).join('')
}</table>`;

const quando = ora => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ora);

export function componiMailAxxell(d, { a, ora }) {
  const r = [...righe(d), ['Pagina', d.pagina], ['Ricevuta', quando(ora)]].filter(([, v]) => v);
  return {
    from: MITTENTE, to: [a], reply_to: d.email, subject: oggetto(d),
    text: `Nuova richiesta di consulenza dal sito.\n\n${comeTesto(r)}\n\nRispondi a questa mail per scrivere direttamente al cliente.`,
    html: `<p style="font:15px/1.5 Arial,sans-serif;color:#0b1033">Nuova richiesta di consulenza dal sito.</p>${comeHtml(r)}<p style="font:13px/1.5 Arial,sans-serif;color:#454d7a">Rispondi a questa mail per scrivere direttamente al cliente.</p>`,
  };
}

// La conferma parte verso un indirizzo scritto da chiunque: ripete solo le scelte fatte nel modulo
// (piano, interessi, tipo), mai testo libero, così non si può usare per mandare link da axxell.ai.
const NOME_PULITO = /^[\p{L}' -]{1,60}$/u;

export function componiConferma(d) {
  const r = [['Tipo di attività', NOMI_TIPI[d.tipo] || ''], ['Cosa interessa', nomiInteressi(d)], ['Piano scelto', d.piano ? PIANI[d.piano] : '']].filter(([, v]) => v);
  const saluto = NOME_PULITO.test(d.nome) ? `Ciao ${d.nome},` : 'Ciao,';
  const p = t => `<p style="font:15px/1.5 Arial,sans-serif;color:#0b1033">${t}</p>`;
  return {
    from: MITTENTE, to: [d.email], reply_to: 'info@axxell.ai', subject: 'Abbiamo ricevuto la tua richiesta',
    text: `${saluto}\ngrazie per averci scritto: abbiamo ricevuto la tua richiesta di consulenza e ti rispondiamo entro 24 ore.${r.length ? `\n\nLe tue scelte:\n${comeTesto(r)}` : ''}\n\nSe vuoi aggiungere qualcosa, rispondi a questa mail.\n\nAxxell\nhttps://axxell.ai`,
    html: `${p(escapeHtml(saluto))}${p('grazie per averci scritto: abbiamo ricevuto la tua richiesta di consulenza e ti rispondiamo <b>entro 24 ore</b>.')}${r.length ? p('Le tue scelte:') + comeHtml(r) : ''}${p('Se vuoi aggiungere qualcosa, rispondi a questa mail.')}${p('Axxell<br><a href="https://axxell.ai" style="color:#0b1033">axxell.ai</a>')}`,
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
