#!/usr/bin/env node
/**
 * PDF DI ESEMPIO DI UNA GUIDA MUSEO (12/09/2026 sera, committente: «invia un
 * esempio del PDF dei musei»). Stessa struttura e stessi stili di
 * src/components/MuseumPrintView.tsx (testata come gli itinerari, fasce
 * sala, tappe con spiegazione e curiosità), resi in HTML statico dalla guida
 * in libreria e stampati con Chrome headless (come il manuale).
 * Uso: node scripts/pdf-guida-museo-esempio.mjs poi_wd-Q51252 IT out.pdf
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const env = {};
for (const f of ['.env', '.env.local']) {
  try { for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}
const [key = 'poi_wd-Q51252', lingua = 'IT', out = 'guida-museo-esempio.pdf'] = process.argv.slice(2);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const [riga] = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/museum_guides?venue_key=eq.${key}&language=eq.${lingua}&select=venue_name,guide,venue_photo,source`, { headers: H })).json();
if (!riga) { console.error('guida non trovata'); process.exit(1); }
const g = riga.guide; const tappe = (g.tappe || []);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = { IT: { titolo: 'Visita al museo', opere: 'opere', conSale: 'con le sale', cartellino: 'Sul cartellino', collezione: 'Anche in collezione', soloColl: 'In collezione, non esposta in sala', noSale: 'Il museo non pubblica le sale: le opere sono nell\'ordine consigliato.', curiosita: 'Curiosità' }, EN: { titolo: 'Museum visit', opere: 'works', conSale: 'with rooms', cartellino: 'On the label', collezione: 'Also in the collection', soloColl: 'In the collection, not on display', noSale: 'The museum does not publish room numbers: works are in the suggested order.', curiosita: 'Curiosity' } }[lingua] || {};
const conSala = tappe.filter(x => String(x.dove || '').trim()).length;
const logo = 'file:///' + 'C:/progetti/itainta/public/logo.jpg';
const css = `
@page { margin: 6mm 12mm 14mm 12mm; size: A4 portrait; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e1b14; background: #fff; margin: 0; }
.mp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1e3a8a; padding: 0 0 8px 0; margin: 0 0 12px 0; }
.mp-title { font-size: 18pt; font-weight: 800; color: #1e3a8a; margin: 0 0 3px 0; line-height: 1.12; letter-spacing: -0.01em; }
.mp-subtitle { font-size: 7.5pt; color: #b45309; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; margin: 0; }
.mp-intro-desc { font-size: 8pt; color: #57534e; line-height: 1.4; margin: 5px 0 0 0; font-style: italic; max-width: 92%; font-family: Georgia, "Times New Roman", serif; }
.mp-logo { width: 58px; height: 58px; object-fit: contain; border-radius: 10px; }
.mp-advice { background: #eff6ff; border-left: 4px solid #d4af37; border-radius: 0 6px 6px 0; padding: 6px 10px; margin: 0 0 12px 0; font-size: 8.5pt; color: #1e3a8a; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.mp-room { break-after: avoid; background: #eff6ff; border-left: 4px solid #d4af37; border-radius: 0 6px 6px 0; padding: 5px 10px; margin: 14px 0 8px 0; font-size: 10.5pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.05em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.mp-stop { break-inside: avoid; border-left: 2px solid #dbe3f5; margin: 0 0 10px 4px; padding-left: 10px; position: relative; }
.mp-stop::before { content: ""; position: absolute; left: -5px; top: 3px; width: 8px; height: 8px; border-radius: 50%; background: #1e3a8a; border: 1.5px solid #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.mp-stop-name { font-size: 11pt; font-weight: 800; color: #1c1917; margin: 0; line-height: 1.2; }
.mp-stop-label { font-size: 8pt; color: #78716c; font-style: italic; margin: 1px 0 0 0; }
.mp-stop-meta { font-size: 8pt; color: #57534e; font-weight: 700; margin: 2px 0 0 0; }
.mp-stop-where { font-size: 8pt; color: #1e3a8a; font-weight: 800; margin: 2px 0 0 0; }
.mp-stop-why { font-family: Georgia, "Times New Roman", serif; font-size: 8.5pt; line-height: 1.4; color: #44403c; margin: 3px 0 0 0; }
.mp-look { margin: 4px 0 0 0; padding: 4px 8px; border: 1px solid #e7e5e4; border-radius: 4px; font-size: 8pt; color: #44403c; }
.mp-look-title { font-size: 7pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 2px 0; }
.mp-map { break-inside: avoid; margin: 0 0 12px 0; }
.mp-map-title { font-size: 7.5pt; color: #b45309; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; margin: 0 0 4px 0; }
.mp-map-box { position: relative; width: 100%; border: 1px solid #e7e5e4; border-radius: 6px; overflow: hidden; background: #fff; }
.mp-map-img { display: block; width: 100%; height: auto; }
.mp-pin { position: absolute; transform: translate(-50%, -50%); min-width: 16px; height: 16px; padding: 0 4px; border-radius: 9px; background: #1e3a8a; color: #fff; font-size: 7pt; font-weight: 800; line-height: 16px; text-align: center; border: 1.5px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.mp-map-legend { font-size: 7.5pt; color: #57534e; margin: 4px 0 0 0; line-height: 1.4; }
.mp-note { font-size: 7.5pt; color: #78716c; font-style: italic; margin: 10px 0 0 0; }
.mp-footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e7e5e4; font-size: 7.5pt; color: #78716c; display: flex; justify-content: space-between; }
`;
// La pianta con i pin (dalla rotta pubblica, stessa della vista Mappa).
const normSala = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(sala|room|salle|saal|galleria|gallery|galerie|hall|zaal)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const numeroDi = i => tappe.slice(0, i + 1).filter(x => !x.soloCollezione).length;
const etich = n => n.length <= 2 ? n.join(',') : (n.every((v, k) => k === 0 || v === n[k - 1] + 1) ? `${n[0]}-${n[n.length - 1]}` : `${n[0]}…`);
let mappeHtml = '';
try {
  const mj = await (await fetch(`https://www.wip.guide/api/museums/map?key=${encodeURIComponent(key)}&name=${encodeURIComponent(riga.venue_name)}`)).json();
  for (const m of (mj.maps || [])) {
    const pins = (m.pins || []).map(p => { const ns = normSala(p.sala); const numeri = tappe.map((tp, i) => ({ tp, i })).filter(({ tp }) => !tp.soloCollezione && ns && (normSala(tp.salaCodice || tp.dove) === ns || normSala(tp.dove) === ns)).map(({ i }) => numeroDi(i)); return { pin: p, numeri }; }).filter(x => x.numeri.length);
    if (!pins.length) continue;
    mappeHtml += `<div class="mp-map"><p class="mp-map-title">Mappa${m.titolo ? ' · ' + esc(m.titolo) : ''}</p><div class="mp-map-box"><img class="mp-map-img" src="${esc(m.url)}">${pins.map(({ pin, numeri }) => `<span class="mp-pin" style="left:${(pin.x * 100).toFixed(2)}%;top:${(pin.y * 100).toFixed(2)}%">${esc(etich(numeri))}</span>`).join('')}</div><p class="mp-map-legend">${pins.map(({ pin, numeri }) => `${esc(etich(numeri))} → ${esc(pin.sala)}`).join(' · ')}</p></div>`;
  }
} catch (e) { console.warn('mappa non letta:', e?.message); }
let corpo = '';
tappe.forEach((tappa, i) => {
  const salaQui = tappa.soloCollezione ? '' : String(tappa.dove || '').trim();
  const salaPrima = i === 0 ? null : (tappe[i - 1].soloCollezione ? '' : String(tappe[i - 1].dove || '').trim());
  if (salaQui && salaQui !== salaPrima) corpo += `<div class="mp-room">${esc(salaQui)}</div>`;
  if (tappa.soloCollezione && (i === 0 || !tappe[i - 1].soloCollezione)) corpo += `<div class="mp-room">${esc(T.collezione)}</div>`;
  const numero = tappe.slice(0, i + 1).filter(x => !x.soloCollezione).length;
  corpo += `<div class="mp-stop"><p class="mp-stop-name">${tappa.soloCollezione ? '' : numero + '. '}${esc(tappa.nome)}${tappa.preferita ? ' ♥' : ''}</p>`;
  if (tappa.nomeFonte) corpo += `<p class="mp-stop-label">${esc(tappa.nomeFonte)}</p>`;
  if (tappa.nomeOriginale) corpo += `<p class="mp-stop-label">${esc(T.cartellino)}: ${esc(tappa.nomeOriginale)}</p>`;
  if (tappa.autore || tappa.anno) corpo += `<p class="mp-stop-meta">${esc([tappa.autore, tappa.anno].filter(Boolean).join(' · '))}</p>`;
  if (tappa.puntoPreciso || tappa.dove) corpo += `<p class="mp-stop-where">${esc([tappa.dove, tappa.puntoPreciso].filter(Boolean).join(' · '))}</p>`;
  if (tappa.soloCollezione) corpo += `<p class="mp-stop-meta">${esc(T.soloColl)}</p>`;
  if (tappa.perche) corpo += `<p class="mp-stop-why">${esc(tappa.perche)}</p>`;
  if (tappa.curiosita) corpo += `<div class="mp-look"><p class="mp-look-title">${esc(T.curiosita)}</p><div>${esc(tappa.curiosita)}</div></div>`;
  corpo += `</div>`;
});
const html = `<!doctype html><html><head><meta charset="utf-8"><title>WIP - ${esc(riga.venue_name)}</title><style>${css}</style></head><body>
<div class="mp-header"><div style="flex:1"><h1 class="mp-title">${esc(riga.venue_name)}</h1><p class="mp-subtitle">wip.guide · ${esc(T.titolo)} · ${tappe.length} ${esc(T.opere)}${conSala ? ' · ' + esc(T.conSale) : ''}</p>${g.intro ? `<p class="mp-intro-desc">${esc(g.intro)}</p>` : ''}</div><div style="flex-shrink:0"><img src="${logo}" alt="World in Pocket" class="mp-logo"></div></div>
${g.consiglio ? `<div class="mp-advice">${esc(g.consiglio)}</div>` : ''}
${mappeHtml}
${g.saleDichiarate === false ? `<p class="mp-note">${esc(T.noSale)}</p>` : ''}
${corpo}
<div class="mp-footer"><span>wip.guide</span><span>${esc(riga.source?.title || '')}</span></div>
</body></html>`;
const dir = path.resolve(path.dirname(out));
const htmlPath = path.join(dir, path.basename(out).replace(/\.pdf$/i, '') + '.html');
fs.writeFileSync(htmlPath, html);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilo = path.join(dir, 'chrome-pdf-profile');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profilo}`, '--virtual-time-budget=8000', '--no-pdf-header-footer', `--print-to-pdf=${path.resolve(out)}`, 'file:///' + htmlPath.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 120000 });
console.log('PDF:', path.resolve(out), fs.statSync(out).size, 'byte;', tappe.length, 'tappe,', conSala, 'con sala');
