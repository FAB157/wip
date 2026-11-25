// Traduce i testi del centro guida nelle 6 lingue dell'app (16/11/2026). Uso:
//   node scripts/guida/traduci.mjs en            (una lingua)      node scripts/guida/traduci.mjs tutte
//   node scripts/guida/traduci.mjs en --prova    (solo conta quante frasi mancano, nessuna chiamata)
// - Solo motori GRATUITI del pool (Gemini lite chiavi _1.._3, poi Groq chiavi 1/2/3/5): mai le chiavi dei
//   revisori né quelle «on the fly» degli utenti, mai motori a pagamento.
// - Ripartibile: ogni lotto tradotto è salvato subito in scripts/guida/traduzioni/<lingua>.json (chiave = frase
//   italiana esatta). Rilanciato, traduce solo ciò che manca o che è cambiato.
// - Glossario: le etichette dell'app tra «…» prendono la traduzione VERA dell'app (src/lib/i18n.ts e
//   src/lib/traduzioni/*.ts), così la guida usa le stesse parole dello schermo.
import fs from 'fs';
import path from 'path';
import * as C from './contenuti.mjs';
import { LINGUE, mappaTesti } from './i18n.mjs';

const arg = process.argv.slice(2);
const prova = arg.includes('--prova');
const scelte = arg.includes('tutte') ? LINGUE.filter(l => l.c !== 'it') : LINGUE.filter(l => arg.includes(l.c) && l.c !== 'it');
if (!scelte.length) { console.error('Uso: node scripts/guida/traduci.mjs <en|fr|es|de|ru|zh|tutte> [--prova]'); process.exit(1); }

// ── chiavi (solo pool) ──
const leggi = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const env = Object.fromEntries((leggi('.env') + '\n' + leggi('.env.local')).split(/\r?\n/).filter(r => /^\s*[A-Z_0-9]+\s*=/.test(r)).map(r => { const i = r.indexOf('='); return [r.slice(0, i).trim(), r.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const GEMINI = ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3'].map(k => env[k]).filter(Boolean);
const GROQ = ['GROQ_API_KEY', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3', 'GROQ_API_KEY_5'].map(k => env[k]).filter(Boolean);

// ── tutte le frasi italiane della guida ──
function frasiItaliane() {
  const s = new Set();
  const prendi = x => { s.add(x); return x; };
  for (const nome of ['MACRO', 'ETICHETTE_STAT', 'OBIETTIVI', 'TUTORIAL_PRINCIPALI', 'FAMIGLIE_CATEGORIE', 'PAGINE']) mappaTesti(C[nome], prendi);
  try { mappaTesti(JSON.parse(leggi('public/guida/media.json')), prendi); } catch { /* niente didascalie */ }
  try { const e = JSON.parse(leggi('public/guida/esempi.json')); for (const lista of Object.values(e)) if (Array.isArray(lista)) for (const x of lista) { if (x.titolo) s.add(x.titolo); if (x.nota) s.add(x.nota); } } catch { /* niente esempi */ }
  return [...s].filter(x => x.trim());
}

// ── glossario dalle traduzioni dell'app: IT → {EN, FR, …} per etichette brevi ──
function glossarioApp() {
  const g = new Map();
  const file = ['src/lib/i18n.ts', ...fs.readdirSync('src/lib/traduzioni').filter(f => f.endsWith('.ts')).map(f => `src/lib/traduzioni/${f}`)];
  const val = (blocco, L) => { const m = blocco.match(new RegExp(`\\b${L}:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`)); return m ? m[2].replace(/\\(['"`])/g, '$1') : null; };
  for (const f of file) {
    const t = leggi(f);
    for (const m of t.matchAll(/\{\s*IT:\s*(['"`])((?:\\.|(?!\1).)*)\1[^{}]*\}/g)) {
      const it = m[2].replace(/\\(['"`])/g, '$1');
      if (it.length > 40 || it.length < 3 || g.has(it)) continue;
      const r = {}; for (const L of ['EN', 'FR', 'ES', 'DE', 'RU', 'ZH']) { const v = val(m[0], L); if (v) r[L] = v; }
      if (Object.keys(r).length >= 4) g.set(it, r);
    }
  }
  return g;
}

const regole = (lingua) => `You translate the help center of WIP, a travel app (audio guides, map, itineraries). Translate each Italian string into ${lingua}.
Rules:
- Return ONLY JSON: {"t": [ ... ]} with exactly the same number of items, in the same order.
- Keep **bold** markers, emoji, numbers, units, URLs, e-mail addresses exactly. Use the ${lingua} thousands separator for numbers.
- Product and proper names stay as they are: WIP, WipNav, Vision, Nicky, Dante, Day Pass, WIP Community, App Store, Google Play, GBIF, IUCN, Natura 2000, Wikipedia, Wikidata, OpenStreetMap, Michelin.
- Italian «quoted» labels are on-screen names of the app: when the glossary gives one, use EXACTLY that translation; keep the quotes in the ${lingua} style.
- Place names (cities, monuments, museums) keep their usual ${lingua} name if one exists, otherwise stay as they are.
- Plain, clear, friendly style ("you" form). Never add or remove information.`;

async function chiamaGemini(chiave, sistema, utente) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${chiave}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: utente }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 16000 } }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}
async function chiamaGroq(chiave, sistema, utente) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chiave}` }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model: 'openai/gpt-oss-120b', temperature: 0.2, max_tokens: 16000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sistema }, { role: 'user', content: utente }] }),
  });
  if (!r.ok) throw new Error(`groq ${r.status}`);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}
// --gonka (committente 16/11/2026: «usa Gonka ora», spesa piccola): DeepSeek V4 Flash via GonkaRouter con le chiavi
// dei lavori di SFONDO (mai revisore/poi6). Si contano i token e ci si ferma da soli oltre TETTO_TOKEN.
const GONKA = arg.includes('--gonka') ? ['GONKAROUTER_API_KEY_ITINERARI', 'GONKAROUTER_API_KEY_POI_5', 'GONKAROUTER_API_KEY_POI_4', 'GONKAROUTER_API_KEY_CLIMA'].map(k => env[k]).filter(Boolean) : [];
const TETTO_TOKEN = 3_000_000;
let tokenGonka = 0;
async function chiamaGonka(chiave, sistema, utente) {
  if (tokenGonka > TETTO_TOKEN) throw new Error('gonka tetto');
  const r = await fetch('https://api.gonkarouter.io/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chiave}` }, signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model: 'deepseek-ai/DeepSeek-V4-Flash-0731', temperature: 0.2, max_tokens: 12000, messages: [{ role: 'system', content: sistema }, { role: 'user', content: utente }] }),
  });
  if (!r.ok) throw new Error(`gonka ${r.status}`);
  const j = await r.json();
  tokenGonka += Number(j?.usage?.total_tokens || 0);
  return String(j?.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
}
const motori = GONKA.length
  ? GONKA.map(k => ({ n: 'gonka', f: (s, u) => chiamaGonka(k, s, u), fermo: 0 }))
  : [...GEMINI.map(k => ({ n: 'gemini', f: (s, u) => chiamaGemini(k, s, u), fermo: 0 })), ...GROQ.map(k => ({ n: 'groq', f: (s, u) => chiamaGroq(k, s, u), fermo: 0 }))];
let giro = 0;
async function traduciLotto(lingua, LANG, frasi, glossario) {
  const voci = new Map();
  for (const f of frasi) for (const m of f.matchAll(/«([^»]{2,40})»/g)) { const v = glossario.get(m[1])?.[LANG]; if (v) voci.set(m[1], v); }
  const utente = (voci.size ? `Glossary (Italian → ${lingua}):\n${[...voci].map(([a, b]) => `${a} → ${b}`).join('\n')}\n\n` : '') + `Strings:\n${JSON.stringify(frasi)}`;
  // I limiti gratuiti sono per MINUTO (429 dopo pochi lotti): quando tutti i motori sono fermi si aspetta il primo
  // che si libera, invece di arrendersi. Tetto: 12 tentativi veri o 15 minuti per lotto.
  const inizio = Date.now();
  for (let tentativo = 0; tentativo < 12 && Date.now() - inizio < 15 * 60000;) {
    const liberi = motori.filter(x => x.fermo <= Date.now());
    if (!liberi.length) { const attesa = Math.min(...motori.map(x => x.fermo)) - Date.now() + 500; await new Promise(r => setTimeout(r, Math.max(1000, attesa))); continue; }
    const m = liberi[giro++ % liberi.length];
    tentativo++;
    try {
      const testo = await m.f(regole(lingua), utente);
      const t = JSON.parse(testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1)).t;
      if (!Array.isArray(t) || t.length !== frasi.length) throw new Error(`lunghezza ${t?.length} ≠ ${frasi.length}`);
      // Controlli: nessuna vuota, stessi ** (grassetti) e stessi numeri lunghi.
      t.forEach((x, i) => {
        if (typeof x !== 'string' || !x.trim()) throw new Error(`vuota #${i}`);
        if ((x.match(/\*\*/g) || []).length !== (frasi[i].match(/\*\*/g) || []).length) throw new Error(`grassetti #${i}`);
      });
      return t;
    } catch (e) {
      const msg = String(e.message || e);
      if (/tetto/.test(msg)) { console.log(`TETTO di ${TETTO_TOKEN} token raggiunto: mi fermo.`); process.exit(2); }
      if (/ 429/.test(msg)) m.fermo = Date.now() + 65000;
      else if (/ 403| 401| 400| 402/.test(msg)) m.fermo = Date.now() + 24 * 3600000; // chiave senza credito/non valida: fuori per oggi
      console.log(`   ${m.n}: ${msg.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

const tutte = frasiItaliane();
const glossario = glossarioApp();
console.log(`frasi italiane: ${tutte.length} · glossario app: ${glossario.size} voci · motori: ${GEMINI.length} Gemini + ${GROQ.length} Groq`);
fs.mkdirSync('scripts/guida/traduzioni', { recursive: true });
for (const L of scelte) {
  const file = path.join('scripts/guida/traduzioni', `${L.c}.json`);
  let diz = {}; try { diz = JSON.parse(leggi(file) || '{}'); } catch { diz = {}; }
  const manca = tutte.filter(f => !diz[f]);
  console.log(`\n${L.c}: ${tutte.length - manca.length} già tradotte, ${manca.length} da tradurre`);
  if (prova) continue;
  // Lotti di ~40 frasi o ~6.000 caratteri.
  const lotti = []; let cur = [], car = 0;
  for (const f of manca) { if (cur.length && (cur.length >= 40 || car + f.length > 6000)) { lotti.push(cur); cur = []; car = 0; } cur.push(f); car += f.length; }
  if (cur.length) lotti.push(cur);
  let fatti = 0, falliti = 0;
  for (const [n, lotto] of lotti.entries()) {
    let t = await traduciLotto(L.ai, L.c.toUpperCase(), lotto, glossario);
    if (!t && lotto.length > 1) { // un lotto che non passa i controlli si rifà a metà
      const a = await traduciLotto(L.ai, L.c.toUpperCase(), lotto.slice(0, lotto.length >> 1), glossario);
      const b = await traduciLotto(L.ai, L.c.toUpperCase(), lotto.slice(lotto.length >> 1), glossario);
      t = a && b ? [...a, ...b] : null;
    }
    if (!t) { falliti += lotto.length; console.log(`  lotto ${n + 1}/${lotti.length}: NON tradotto (resta italiano)`); continue; }
    lotto.forEach((f, i) => { diz[f] = t[i]; });
    fatti += lotto.length;
    fs.writeFileSync(file, JSON.stringify(diz, null, 1));
    if ((n + 1) % 5 === 0 || n === lotti.length - 1) console.log(`  lotto ${n + 1}/${lotti.length} · tradotte ${fatti}${GONKA.length ? ` · token Gonka ${tokenGonka}` : ''}`);
  }
  // Toglie le frasi che non esistono più nella guida italiana.
  const vive = new Set(tutte);
  for (const k of Object.keys(diz)) if (!vive.has(k)) delete diz[k];
  fs.writeFileSync(file, JSON.stringify(diz, null, 1));
  console.log(`${L.c}: fatte ${fatti}, non tradotte ${falliti}`);
}
