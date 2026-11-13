#!/usr/bin/env node
/**
 * SCARICA TUTTO museu.ms (12/09/2026 sera, committente: «verifica ed
 * estrapola più dati che puoi… scarica tutto, di tutti i musei»). Scorre le
 * schede /museum/details/<id>/x (id crescenti; la scheda esiste se ha un
 * nome) e salva in musei_directory: nome, indirizzo, città, paese, telefono,
 * email, sito, orari per giorno, ingresso, descrizione, musei vicini con
 * distanza. Ritmo: una richiesta ogni 350 ms (~10.000 schede/ora), ripartenza
 * dall'ultimo id salvato. Uso: node scripts/musei-directory-scarica.mjs
 * [--da 1] [--a 30000] [--pausa 350]
 */
import fs from 'fs';
import path from 'path';
const env = {};
for (const f of ['.env', '.env.local']) {
  try { for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}
const SB = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 WorldInPocket/1.0 (support@wip.guide)', 'Accept-Language': 'en' };
const dormi = ms => new Promise(x => setTimeout(x, ms));
const PAUSA = parseInt(arg('--pausa', '350'), 10);
let DA = parseInt(arg('--da', '0'), 10); const A = parseInt(arg('--a', '30000'), 10);
if (!DA) {
  const u = await (await fetch(`${SB}/rest/v1/musei_directory?fonte=eq.museu.ms&select=fonte_id&order=fonte_id.desc&limit=1`, { headers: H })).json();
  DA = (Array.isArray(u) && u[0]?.fonte_id ? u[0].fonte_id + 1 : 1);
}
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// Ogni tag = a capo (come nella prova del 12/09 sera): «Monday» e «10:00 -
// 17:30» stanno in due celle, e con gli spazi al posto dei tag finivano
// sulla stessa riga e nessun campo combaciava.
const testoDi = h => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').split('\n').map(x => decode(x)).filter(Boolean).join('\n');

function leggiScheda(html, id) {
  const og = k => decode((html.match(new RegExp(`<meta[^>]+property="og:${k}"[^>]+content="([^"]*)"`, 'i')) || [])[1] || '');
  const nome = og('title') || decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  if (!nome || /^museu\.ms$/i.test(nome) || /Museums and galleries/i.test(nome)) return null;
  const t = testoDi(html);
  // «Nome\nIndirizzo, Città, Paese\nContact information»
  const riga = (t.split('\n').map(x => x.trim()).filter(Boolean));
  // Il nome compare due volte (briciole + titolo): l'indirizzo è la riga
  // dopo l'ULTIMA occorrenza nella testata, e non deve essere il nome stesso.
  let iNome = -1;
  for (let k = 3; k < Math.min(riga.length, 80); k++) if (riga[k] === nome && riga[k + 1] !== nome) iNome = k;
  const candidato = iNome >= 0 ? riga[iNome + 1] || '' : '';
  const indirizzo = /^(Contact information|Opening hours|Phone|Website)$/i.test(candidato) ? '' : candidato;
  const parti = indirizzo.split(',').map(x => x.trim());
  const paese = parti.length >= 2 ? parti[parti.length - 1] : '';
  const citta = parti.length >= 3 ? parti[parti.length - 2] : (parti.length === 2 ? parti[0] : '');
  const dopo = (etich, n = 1) => { const i = riga.findIndex(x => x.toLowerCase() === etich); return i >= 0 ? riga[i + n] || '' : ''; };
  const telefono = dopo('phone');
  const email = (html.match(/mailto:([^"'?]+)/i) || [])[1] || '';
  const sito = decode((html.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*Visit our homepage/i) || [])[1] || '');
  const orari = {};
  for (const g of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Holidays']) { const v = dopo(g.toLowerCase()); if (v && /\d|closed|open/i.test(v)) orari[g] = v; }
  const iAdm = riga.findIndex(x => x.toLowerCase() === 'admission');
  let ingresso = '';
  if (iAdm >= 0) { const pezzi = []; for (let k = iAdm + 1; k < Math.min(riga.length, iAdm + 7); k++) { if (/^(rating|reviews|number of reviews|museums nearby)/i.test(riga[k])) break; if (/don't have anything/i.test(riga[k])) { pezzi.length = 0; break; } pezzi.push(riga[k]); } ingresso = pezzi.join(' · ').slice(0, 200); }
  const iVic = riga.findIndex(x => /^museums nearby$/i.test(x));
  const vicini = [];
  if (iVic >= 0) for (let k = iVic + 1; k < Math.min(riga.length, iVic + 16); k += 2) { const n = riga[k], d = riga[k + 1] || ''; if (!n || /Translate|Suggest|Tweet/i.test(n)) break; const m = /([\d.,]+)\s*(km|m)\b/.exec(d); if (!m) break; vicini.push({ nome: n, distanza: m[1] + ' ' + m[2] }); }
  // Descrizione: dopo «Suggest update / Edit», fino a «Museums nearby» o ai commenti.
  let descrizione = og('description');
  const iEdit = riga.findIndex(x => /^edit$/i.test(x));
  if (iEdit >= 0) { const blocco = []; for (let k = iEdit + 1; k < riga.length; k++) { if (/^(Museums nearby|Rate and review|Newsletter|Reviews)$/i.test(riga[k])) break; blocco.push(riga[k]); } if (blocco.join(' ').length > descrizione.length) descrizione = blocco.join('\n'); }
  const tipo = decode((html.match(/museum\/index\?[^"]*type=([^"&]+)/i) || [])[1] || '');
  return { fonte: 'museu.ms', fonte_id: id, url: `https://museu.ms/museum/details/${id}/x`, nome: nome.slice(0, 300), indirizzo: indirizzo.slice(0, 300), citta: citta.slice(0, 120), paese: paese.slice(0, 120), telefono: telefono.slice(0, 60), email: email.slice(0, 200), sito: sito.slice(0, 500), tipo: decodeURIComponent(tipo).slice(0, 80), orari: Object.keys(orari).length ? orari : null, ingresso, descrizione: descrizione.slice(0, 6000), vicini: vicini.length ? vicini : null };
}

console.log(`[museu.ms] ${new Date().toISOString()} da ${DA} a ${A}, pausa ${PAUSA} ms`);
const stat = { lette: 0, salvate: 0, vuote: 0, errori: 0 };
let vuoteDiFila = 0, lotto = [];
const scrivi = async () => {
  if (!lotto.length) return;
  const r = await fetch(`${SB}/rest/v1/musei_directory?on_conflict=fonte,fonte_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(lotto) });
  if (r.ok) stat.salvate += lotto.length; else { stat.errori++; console.log('  DB', r.status, (await r.text()).slice(0, 160)); }
  lotto = [];
};
// A LOTTI PARALLELI (12/09/2026 sera): una scheda per volta faceva 7 al
// minuto (giorni per 25.000 id). Ora CONCORRENZA richieste insieme, poi la
// pausa: ~5 al secondo, educato ma finisce in poche ore.
const CONCORRENZA = parseInt(arg('--parallelo', '6'), 10);
let fine = false;
for (let id = DA; id <= A && !fine; id += CONCORRENZA) {
  const ids = []; for (let k = id; k < Math.min(A + 1, id + CONCORRENZA); k++) ids.push(k);
  const esiti = await Promise.all(ids.map(async (x) => {
    try {
      const r = await fetch(`https://museu.ms/museum/details/${x}/x`, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      if (r.status === 429 || r.status >= 500) return { x, ritenta: true, status: r.status };
      const html = r.ok ? await r.text() : '';
      return { x, scheda: html ? leggiScheda(html, x) : null };
    } catch (e) { return { x, errore: String(e?.message || e) }; }
  }));
  if (esiti.some(e => e.ritenta)) { console.log(`  ${id}: ${esiti.find(e => e.ritenta).status}, aspetto 60 s`); await dormi(60000); id -= CONCORRENZA; continue; }
  for (const e of esiti) {
    stat.lette++;
    if (e.errore) { stat.errori++; if (stat.errori % 20 === 0) console.log(`  ${e.x}: ${e.errore.slice(0, 80)}`); continue; }
    if (!e.scheda) { stat.vuote++; vuoteDiFila++; if (vuoteDiFila >= 400) { console.log(`  400 schede vuote di fila fino a ${e.x}: fine dell'indice`); fine = true; break; } }
    else { vuoteDiFila = 0; lotto.push(e.scheda); }
  }
  if (lotto.length >= 25) await scrivi();
  if (stat.lette % 600 < CONCORRENZA) { await scrivi(); console.log(`  ${new Date().toLocaleTimeString('it-IT')} id ${id}: lette ${stat.lette}, salvate ${stat.salvate}, vuote ${stat.vuote}, errori ${stat.errori}`); }
  await dormi(PAUSA);
}
await scrivi();
console.log('\nRIEPILOGO', JSON.stringify(stat));
