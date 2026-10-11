// Funzione Vercel del modulo «Richiedi una consulenza» (POST /api/consulenza).
import { gestisci } from './_consulenza.mjs';

export default async function handler(req, res) {
  let corpo = req.body;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch { corpo = null; }
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const r = await gestisci({ metodo: req.method, corpo, ip, env: process.env, fetch: globalThis.fetch, ora: Date.now() });
  res.setHeader('Cache-Control', 'no-store');
  res.status(r.stato).json(r.json);
}
