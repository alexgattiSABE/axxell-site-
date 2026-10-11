import { $ } from './utili.js';
import { avviaSfondo } from './sfondo.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { MESSAGGI, TIPI_SITO, leggiIndirizzo, controlla, descriviPiano, descriviAtlas } from './consulenza-modulo.js';

// Pagina «Richiedi una consulenza»: sfondo, logo e menu come le altre pagine, poi il modulo.
avviaSfondo($('bg'));
avviaLogoHeader();
avviaMenu();

const modulo = $('consulenza-modulo');
const tasto = modulo.querySelector('.co-invia');
const inizio = performance.now();

const BUY = 'https://atlas-server-production-787d.up.railway.app/buy/';

// dal tasto da cui si arriva: prodotto spuntato e piano scelto
const { interessi, piano } = leggiIndirizzo(location.search);
for (const i of interessi) modulo.querySelector(`input[name="interessi"][value="${i}"]`).checked = true;
if (piano) modulo.querySelector(`input[name="piano"][value="${piano}"]`).checked = true;

// configuratore: a ogni scelta si aprono le opzioni del prodotto e si aggiorna il riepilogo
const ha = v => modulo.querySelector(`input[name="interessi"][value="${v}"]`).checked;
const scelto = n => (modulo.querySelector(`input[name="${n}"]:checked`) || {}).value || '';
function aggiorna() {
  const sabe = ha('sabe'), anima = ha('anima'), atlas = ha('atlas'), chatbot = ha('chatbot'), sito = ha('sito');
  $('co-conf-piano').hidden = !(sabe || anima);
  const start = modulo.querySelector('[data-piano="start"]');
  start.hidden = sabe;                                      // Start è ANIMA senza SABE
  if (sabe && scelto('piano') === 'start') start.querySelector('input').checked = false;
  $('co-conf-atlas').hidden = !atlas;
  $('co-conf-sito').hidden = !sito;
  const periodo = scelto('periodo') || 'mese';
  for (const el of modulo.querySelectorAll('[data-prezzo]'))
    el.textContent = descriviPiano(el.dataset.prezzo, periodo).split(' · ')[1].replace(', IVA inclusa', '');
  $('co-atlas-subito').href = BUY + (scelto('piano_atlas') || 'light');
  const voci = [];
  if (sabe || anima) voci.push(scelto('piano') ? `Piano: ${descriviPiano(scelto('piano'), periodo)}` : 'Piano SABE e ANIMA: ce lo consigliate voi');
  if (atlas) voci.push(scelto('piano_atlas') ? `ATLAS: ${descriviAtlas(scelto('piano_atlas'))}` : 'ATLAS: ce lo consigliate voi');
  if (chatbot) voci.push('Chatbot sul sito · su misura');
  if (sito) voci.push(`Sito web${scelto('sito_tipo') ? ': ' + TIPI_SITO[scelto('sito_tipo')] : ''} · su misura`);
  $('co-riepilogo-voci').replaceChildren(...voci.map(t => Object.assign(document.createElement('li'), { textContent: t })));
  $('co-riepilogo').hidden = !voci.length;
}
modulo.addEventListener('change', aggiorna);
aggiorna();

function dati() {
  const f = new FormData(modulo);
  const v = k => String(f.get(k) || '');
  return {
    nome: v('nome'), cognome: v('cognome'), attivita: v('attivita'), tipo: v('tipo'), piva: v('piva'), email: v('email'), telefono: v('telefono'),
    messaggio: v('messaggio'), privacy: f.get('privacy') === 'si',
    interessi: f.getAll('interessi').map(String), sito_web: v('sito_web'),
    // si manda solo la configurazione dei prodotti spuntati
    piano: ha('sabe') || ha('anima') ? scelto('piano') : '', periodo: scelto('periodo') || 'mese',
    piano_atlas: ha('atlas') ? scelto('piano_atlas') : '',
    sito_tipo: ha('sito') ? scelto('sito_tipo') : '', sito_url: ha('sito') ? v('sito_url') : '',
    ms_sulla_pagina: Math.round(performance.now() - inizio), pagina: document.referrer.slice(0, 200),
  };
}

function mostraErrori(campi) {
  for (const el of modulo.querySelectorAll('[data-campo]')) {
    const campo = el.dataset.campo, err = el.querySelector('.co-errore'), input = el.querySelector('input, select, textarea');
    const sbagliato = campi.includes(campo) && MESSAGGI[campo];
    err.textContent = sbagliato ? MESSAGGI[campo] : '';
    err.hidden = !sbagliato;
    if (sbagliato) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  const primo = campi.map(c => modulo.querySelector(`[data-campo="${c}"] :is(input, select, textarea)`)).find(Boolean);
  if (primo) primo.focus();
}

let inInvio = false;
modulo.addEventListener('submit', async e => {
  e.preventDefault();
  if (inInvio) return;
  const d = dati();
  const campi = controlla(d);
  mostraErrori(campi);
  $('co-invio-errore').hidden = true;
  if (campi.length) return;
  inInvio = true;
  tasto.disabled = true;
  tasto.textContent = 'Invio…';
  // chi compila in un attimo (riempimento automatico) aspetta i secondi minimi, sennò il server lo prende per un robot
  const manca = 3000 - (performance.now() - inizio);
  if (manca > 0) await new Promise(r => setTimeout(r, manca + 50));
  d.ms_sulla_pagina = Math.round(performance.now() - inizio);
  let esito = null;
  try {
    const r = await fetch('/api/consulenza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    esito = { stato: r.status, json: await r.json().catch(() => ({})) };
  } catch {
    esito = null;
  }
  inInvio = false;
  tasto.disabled = false;
  tasto.textContent = 'Invia la richiesta';
  if (esito && esito.stato === 200 && esito.json.ok) {
    $('co-fatto-email').textContent = d.email.trim();
    modulo.hidden = true;
    $('co-fatto').hidden = false;
    $('co-fatto-titolo').focus();
    return;
  }
  const campiServer = esito && esito.stato === 400 && Array.isArray(esito.json.campi) ? esito.json.campi.filter(c => MESSAGGI[c]) : [];
  if (campiServer.length) { mostraErrori(campiServer); return; }
  $('co-invio-errore').hidden = false;
});
