#!/usr/bin/env node
/**
 * GUIDA MICHELIN — scraper completo, versione Node (02/10/2026).
 * Gemello di «18.py» (cartella «scraping wip» del committente): stesse colonne,
 * stessa logica. Gira su Oracle in /root/michelin (Playwright + Chromium).
 *
 *   node michelin-scraper.mjs                tutto (19.719 ristoranti, ~411 pagine di elenco)
 *   node michelin-scraper.mjs --solo-elenco  solo i link
 *   node michelin-scraper.mjs --prova        2 pagine di elenco, 10 schede
 *
 * Due fasi, riprendibili: basta rilanciare.
 *   1) ELENCO  → michelin_link.csv (+ michelin_pagine_fatte.txt)
 *   2) SCHEDE  → ristoranti_michelin_mondo_completo.csv
 *
 * Quasi tutto viene dal JSON-LD della scheda (i dati che la Guida dichiara ai
 * motori di ricerca): nome, via, CAP, citta', regione, paese, telefono,
 * cucina, fascia di prezzo, coordinate, distinzione e anno. Dal DOM: Stella
 * Verde, sito, orari, servizi.
 * NON si prendono la recensione dell'ispettore ne' le foto: sono della
 * Michelin (diritto d'autore), in WIP non si mostrano.
 * Una scheda letta male NON viene salvata con un ripiego (l'errore del primo
 * file: «Piatto / Segnalato» su tutte le righe): resta da rifare.
 * Passo gentile: due schede per volta, pausa fra una e l'altra.
 */
import fs from 'fs';
import { chromium } from 'playwright';

const BASE = 'https://guide.michelin.com';
const CATALOGO = `${BASE}/it/it/ristoranti`;
const FILE_LINK = 'michelin_link.csv';
const FILE_PAGINE = 'michelin_pagine_fatte.txt';
const FILE_CSV = 'ristoranti_michelin_mondo_completo.csv';
const PER_PAGINA = 48;
const SCHEDE_INSIEME = 2;
const PROVA = process.argv.includes('--prova');
const SOLO_ELENCO = process.argv.includes('--solo-elenco');

const CAMPI = ['Nome', 'Distinzione_Michelin', 'Stella_Verde', 'Anno_Distinzione', 'Cucina_E_Prezzo', 'Cucina', 'Prezzo',
  'Indirizzo', 'CAP', 'Citta', 'Regione', 'Paese', 'Telefono', 'Sito_Web_Ristorante', 'Orari', 'Servizi',
  'Link_Michelin', 'Latitudine', 'Longitudine'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pausa = (a, b) => sleep(a + Math.random() * (b - a));
const senzaQuery = (u) => String(u || '').split('?')[0].split('#')[0].replace(/\/$/, '');
const csvCella = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const ora = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(ora(), ...a);

function leggiRigheCsv(file) {
  if (!fs.existsSync(file)) return [];
  const t = fs.readFileSync(file, 'utf8'); const righe = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n') { r.push(c); righe.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch;
  }
  if (c || r.length) { r.push(c); righe.push(r); }
  return righe;
}

async function apri(page, url, tentativi = 3) {
  for (let n = 0; n < tentativi; n++) {
    try {
      await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
      return true;
    } catch { await sleep(3000 + 3000 * n); }
  }
  return false;
}

/** Gira DENTRO la pagina della scheda. */
function estraiScheda() {
  const pulisci = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const r = {};
  let ld = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const d = JSON.parse(s.textContent);
      for (const o of Array.isArray(d) ? d : [d]) if (o && String(o['@type'] || '').includes('Restaurant')) { ld = o; break; }
    } catch { /* blocco non valido */ }
    if (ld) break;
  }
  const testi = [];
  if (ld) {
    r.Nome = pulisci(ld.name);
    const ind = ld.address && typeof ld.address === 'object' ? ld.address : {};
    r.Indirizzo = pulisci(ind.streetAddress); r.CAP = pulisci(ind.postalCode); r.Citta = pulisci(ind.addressLocality);
    r.Regione = pulisci(ind.addressRegion); r.Paese = pulisci(ind.addressCountry);
    r.Telefono = pulisci(ld.telephone);
    r.Cucina = pulisci(Array.isArray(ld.servesCuisine) ? ld.servesCuisine.join(', ') : ld.servesCuisine);
    r.Prezzo = pulisci(ld.priceRange);
    const lat = ld.latitude ?? ld.geo?.latitude, lon = ld.longitude ?? ld.geo?.longitude;
    if (lat != null && lon != null && lat !== '' && lon !== '') { r.Latitudine = String(lat); r.Longitudine = String(lon); }
    testi.push(ld.starRating);
    if (ld.award && typeof ld.award === 'object') { testi.push(ld.award.awardFor); r.Anno_Distinzione = pulisci(ld.award.dateAwarded); }
    else if (typeof ld.award === 'string') testi.push(ld.award);
  }
  r.Stella_Verde = 'NO';
  for (const el of document.querySelectorAll('[data-is-detail="true"][data-distinction]')) {
    if (el.dataset.distinction) testi.push(el.dataset.distinction);
    if (!['', 'false', '0', 'no'].includes(pulisci(el.dataset.greenStar).toLowerCase())) r.Stella_Verde = 'SI';
  }
  for (const el of document.querySelectorAll('[data-restaurant-distinction]')) testi.push(el.dataset.restaurantDistinction);
  const t = testi.filter(Boolean).map((x) => pulisci(x).toLowerCase()).join(' | ').replace(/_/g, ' ');
  if (/three stars?|\b3 stars?\b|tre stelle|\b3 stelle/.test(t)) r.Distinzione_Michelin = '3 Stelle';
  else if (/two stars?|\b2 stars?\b|due stelle|\b2 stelle/.test(t)) r.Distinzione_Michelin = '2 Stelle';
  else if (/one star|\b1 star\b|una stella|\b1 stella/.test(t)) r.Distinzione_Michelin = '1 Stella';
  else if (t.includes('bib')) r.Distinzione_Michelin = 'Bib Gourmand';
  else if (ld) r.Distinzione_Michelin = 'Selezionato';   // scheda letta per intero, nessuna stella ne' Bib

  if (!r.Nome) r.Nome = pulisci(document.querySelector('h1')?.textContent);
  for (const b of document.querySelectorAll('.data-sheet__block')) {
    const tx = pulisci(b.textContent);
    let m = tx.match(/Cucina\s*:\s*(.+?)(?:\s+Prezzo\s*:|\s+Ideale per\s*:|$)/);
    if (m) r.Cucina = pulisci(m[1]);
    m = tx.match(/Prezzo\s*:\s*([€$£¥₩฿]+)/);
    if (m && !r.Prezzo) r.Prezzo = m[1];
  }
  if (r.Prezzo || r.Cucina) r.Cucina_E_Prezzo = [r.Prezzo, r.Cucina].filter(Boolean).join(' · ');
  const sito = document.querySelector('a[data-event="CTA_website"][href]');
  if (sito) r.Sito_Web_Ristorante = sito.href;
  if (!r.Telefono) { const tel = document.querySelector('a[href^="tel:"]'); if (tel) r.Telefono = tel.getAttribute('href').slice(4).trim(); }

  const orari = [], visti = new Set();
  for (const card of document.querySelectorAll('.card-borderline__content')) {
    const g = pulisci(card.querySelector('.card--title')?.textContent);
    if (!g || visti.has(g)) continue;
    visti.add(g);
    const fasce = [...new Set([...card.querySelectorAll('.card--content')].map((x) => pulisci(x.textContent)).filter(Boolean))];
    orari.push(`${g} ${fasce.length ? fasce.join(', ') : 'chiuso'}`);
  }
  if (orari.length) r.Orari = orari.join('; ');

  const hServizi = [...document.querySelectorAll('.data-sheet__section-title')].find((h) => /servizi/i.test(h.textContent));
  if (hServizi) {
    let c = hServizi; for (let i = 0; i < 3 && c.parentElement; i++) c = c.parentElement;
    const voci = [...new Set([...c.querySelectorAll('li')].map((li) => pulisci(li.textContent)).filter((v) => v && v.length < 80))];
    if (voci.length) r.Servizi = voci.join('; ');
  }
  return r;
}

// ───────────────────────────────────────────────────────────── fase 1
async function faseElenco(page) {
  const link = new Map(leggiRigheCsv(FILE_LINK).filter((r) => r[0]?.startsWith('http')).map((r) => [r[0], [r[1] || '', r[2] || '']]));
  const fatte = new Set(fs.existsSync(FILE_PAGINE) ? fs.readFileSync(FILE_PAGINE, 'utf8').split(/\s+/).filter(Boolean).map(Number) : []);
  let totalePagine = null, vuoteDiFila = 0;
  for (let pagina = 1; ; pagina++) {
    if (totalePagine && pagina > totalePagine) break;
    if (PROVA && pagina > 2) break;
    if (fatte.has(pagina)) continue;
    if (!(await apri(page, pagina === 1 ? CATALOGO : `${CATALOGO}/page/${pagina}`))) { log(`elenco ${pagina}: non caricata, la riprendo al prossimo avvio`); continue; }
    await page.waitForSelector('.card__menu', { timeout: 15000 }).catch(() => {});
    const dati = await page.evaluate(() => ({
      testo: document.body.innerText.match(/di\s+([\d.]+)\s+Ristoranti/)?.[1] || null,
      schede: [...document.querySelectorAll('.card__menu')].map((c) => ({ href: c.querySelector('a[href*="/ristorante/"]')?.href || null, lat: c.dataset.lat || '', lng: c.dataset.lng || '' })).filter((x) => x.href),
    }));
    if (!totalePagine && dati.testo) {
      const totale = Number(dati.testo.replace(/\./g, ''));
      totalePagine = Math.ceil(totale / PER_PAGINA);
      log(`la Guida ha ${totale} ristoranti: ${totalePagine} pagine`);
    }
    if (!dati.schede.length) {
      if (++vuoteDiFila >= 3 && !totalePagine) { log('tre pagine vuote di fila: fine elenco'); break; }
      continue;
    }
    const nuovi = [];
    for (const s of dati.schede) { const u = senzaQuery(s.href); if (!link.has(u)) { link.set(u, [s.lat, s.lng]); nuovi.push([u, s.lat, s.lng]); } }
    // Oltre l'ultima pagina la Guida mostra comunque 4 schede «consigliate»,
    // senza il conteggio totale: non sono pagine vuote ma non portano niente.
    // Tre pagine di fila senza un link nuovo = fine dell'elenco (02/10/2026:
    // al riavvio il giro andava avanti all'infinito dalla 412 in poi).
    if (!nuovi.length && dati.schede.length < 20) {
      if (++vuoteDiFila >= 3) { log('tre pagine di fila senza ristoranti nuovi: fine elenco'); break; }
      continue;
    }
    vuoteDiFila = 0;
    if (nuovi.length) fs.appendFileSync(FILE_LINK, nuovi.map((r) => r.map(csvCella).join(',')).join('\n') + '\n');
    fs.appendFileSync(FILE_PAGINE, `${pagina}\n`);
    log(`elenco ${pagina}/${totalePagine ?? '?'}: ${dati.schede.length} ristoranti (${nuovi.length} nuovi) · link ${link.size}`);
    await pausa(800, 1800);
  }
  return link;
}

// ───────────────────────────────────────────────────────────── fase 2
async function faseSchede(ctx, link) {
  const righe = leggiRigheCsv(FILE_CSV);
  const iLink = righe[0] ? righe[0].indexOf('Link_Michelin') : -1;
  const fatte = new Set(iLink >= 0 ? righe.slice(1).map((r) => r[iLink]) : []);
  if (!fs.existsSync(FILE_CSV) || fs.statSync(FILE_CSV).size === 0) fs.writeFileSync(FILE_CSV, CAMPI.join(',') + '\n');
  let coda = [...link.keys()].filter((u) => !fatte.has(u));
  if (PROVA) coda = coda.slice(0, 10);
  log(`schede: ${fatte.size} gia' salvate, ${coda.length} da fare`);
  const conta = {}; let fatteOra = 0, fallitiDiFila = 0, fermo = false;

  async function lavoratore() {
    let page = await ctx.newPage();
    let aperte = 0;
    while (coda.length && !fermo) {
      // Scheda nuova ogni 150 pagine: la stessa scheda tenuta aperta per ore
      // arrivava a 2,5 GB di RAM l'una (02/10/2026, Oracle a 10 GB su 12).
      if (++aperte % 150 === 0) { await page.close().catch(() => {}); page = await ctx.newPage(); }
      const url = coda.shift();
      let riga = null;
      if (await apri(page, url)) {
        await page.waitForSelector('script[type="application/ld+json"]', { state: 'attached', timeout: 12000 }).catch(() => {});
        riga = await page.evaluate(estraiScheda).catch(() => null);
      }
      if (!riga || !riga.Nome || !riga.Distinzione_Michelin) {
        log(`letta male, non salvata (si riprende al prossimo avvio): ${url}`);
        if (++fallitiDiFila >= 12) { fermo = true; log('dodici schede di fila lette male: mi fermo. Rilanciare piu\' tardi.'); }
        await sleep(8000);
        continue;
      }
      fallitiDiFila = 0;
      riga.Link_Michelin = url;
      if (!riga.Latitudine && link.get(url)?.[0]) [riga.Latitudine, riga.Longitudine] = link.get(url);
      fs.appendFileSync(FILE_CSV, CAMPI.map((k) => csvCella(riga[k] || 'N/D')).join(',') + '\n');
      conta[riga.Distinzione_Michelin] = (conta[riga.Distinzione_Michelin] || 0) + 1;
      if (++fatteOra % 25 === 0 || PROVA) log(`${fatteOra} fatte, ${coda.length} restano · ${riga.Nome} [${riga.Distinzione_Michelin}${riga.Stella_Verde === 'SI' ? ' +Verde' : ''}] ${riga.Indirizzo || '—'}, ${riga.Citta || '—'} · ${JSON.stringify(conta)}`);
      await pausa(700, 1500);
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: SCHEDE_INSIEME }, lavoratore));
  log(`fine fase schede: ${fatteOra} in questa esecuzione · ${JSON.stringify(conta)} · restano ${coda.length}`);
  return coda.length;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'it-IT', viewport: { width: 1600, height: 900 } });
// Le foto non servono e sono il grosso del peso di ogni pagina.
await ctx.route('**/*', (route) => (['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue()));
let restano = 0;
try {
  const page = await ctx.newPage();
  const link = await faseElenco(page);
  await page.close();
  log(`link raccolti: ${link.size}`);
  if (!SOLO_ELENCO) restano = await faseSchede(ctx, link);
} finally {
  await browser.close();
}
log(`FINE. File: ${FILE_CSV}`);
process.exit(restano > 0 ? 2 : 0);
