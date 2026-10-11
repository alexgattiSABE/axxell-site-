import { $ } from './utili.js';
import { avviaSfondo } from './sfondo.js';
import { avviaLogoHeader } from './logo-header.js';
import { avviaMenu } from './menu.js';
import { PIANI, MESSAGGI, leggiIndirizzo, controlla } from './consulenza-modulo.js';

// Pagina «Richiedi una consulenza»: sfondo, logo e menu come le altre pagine, poi il modulo.
avviaSfondo($('bg'));
avviaLogoHeader();
avviaMenu();

const modulo = $('consulenza-modulo');
const tasto = modulo.querySelector('.co-invia');
const inizio = performance.now();

// dal tasto da cui si arriva: prodotto spuntato e piano scelto
const { interessi, piano } = leggiIndirizzo(location.search);
for (const i of interessi) modulo.querySelector(`input[name="interessi"][value="${i}"]`).checked = true;
let pianoScelto = piano;
if (piano) { $('co-piano-nome').textContent = PIANI[piano]; $('co-piano').hidden = false; }
$('co-piano-togli').addEventListener('click', () => {
  pianoScelto = '';
  $('co-piano').hidden = true;
  modulo.querySelector('input[name="interessi"]').focus();
});

function dati() {
  const f = new FormData(modulo);
  const v = k => String(f.get(k) || '');
  return {
    nome: v('nome'), attivita: v('attivita'), email: v('email'), telefono: v('telefono'), tipo: v('tipo'), messaggio: v('messaggio'),
    interessi: f.getAll('interessi').map(String), piano: pianoScelto, sito_web: v('sito_web'),
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
