// Controllo leggero del centro guida generato (nessun browser, nessuna rete): link interni, un solo H1, JSON-LD valido, immagini.
//   node scripts/guida/controlla.mjs
import fs from 'fs';
import path from 'path';
const root = path.join('public', 'guida');
const pagine = [];
(function giro(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) giro(p); else if (f === 'index.html') pagine.push(p); } })(root);
const rotti = new Set(); let h1 = 0, ld = 0, img = 0, senzaMeta = 0;
for (const p of pagine) {
  const h = fs.readFileSync(p, 'utf8');
  for (const m of h.matchAll(/href="(\/guida[^"#]*)"/g)) {
    const u = m[1].replace(/\/$/, '');
    if (!fs.existsSync(path.join('public', u, 'index.html')) && !fs.existsSync(path.join('public', u))) rotti.add(`${u} ← ${p}`);
  }
  for (const m of h.matchAll(/src="(\/guida\/[^"]+)"/g)) if (!fs.existsSync(path.join('public', m[1]))) rotti.add(`${m[1]} (immagine/video) ← ${p}`);
  if ((h.match(/<h1/g) || []).length !== 1) h1++;
  // Lunghezza minima 50 «caratteri latini»: un ideogramma cinese ne vale due (40 ideogrammi dicono più di 80 lettere).
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  if (desc.length + (desc.match(/[㐀-鿿]/g) || []).length < 50) senzaMeta++;
  for (const s of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(s[1]); } catch { ld++; } }
  img += (h.match(/<img /g) || []).length;
}
console.log(`pagine ${pagine.length} · link rotti ${rotti.size} · pagine senza un solo H1 ${h1} · JSON-LD non validi ${ld} · senza meta description ${senzaMeta} · immagini ${img}`);
[...rotti].slice(0, 15).forEach(x => console.log('  ', x));
process.exitCode = rotti.size || h1 || ld ? 1 : 0;
