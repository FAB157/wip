// AUDIT GLOBALE DELLE SCHEDE SCARSE (01/10/2026, seguito di audit-schede-vecchie.mjs: stessa
// logica ma su TUTTO il database, non una zona — paginazione per id come driver-citta.mjs,
// cosi' non serve un ORDER BY su colonne non indicizzate (timeout noto su shared_pois).
// Per ogni POI non commerciale con testo scarso (<60 caratteri o etichetta "[Wikipedia Import]"
// mai riscritta), chiama /api/poi/enrich force:true e (default ON) /api/poi/audioguide
// force:true per nicky+dante in IT. Ripartibile: la posizione sta in <stato>.json.
//
//   node scripts/audit-schede-globale.mjs [--limite=100000] [--lavoratori=4] [--pausa=2000]
//     [--lingua=it] [--niente-audio] [--base=https://www.wip.guide] [--stato=scratch/audit-globale.stato.json]
import fs from 'node:fs';
// (01/10/2026) pg diretto invece di @supabase/supabase-js: il droplet non ha il pacchetto
// installato in /root/citta e dipendere da node_modules di un'altra cartella e' fragile.
// Stesso pattern pg gia' usato da tutti gli altri script del droplet (password letta da
// /root/fase-b/fase-b-ciclo.cjs, come check-db-stato.cjs e simili).
import pg from '/root/arrivo-v4/node_modules/pg/lib/index.js';
const { Client } = pg;

const env = {};
for (const f of ['.env', '.env.local']) { if (!fs.existsSync(f)) continue; for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const limite = Number(opt('limite', 0)) || Infinity; // 0 = senza limite (il servizio gira finche' la tabella finisce)
const LAV = Number(opt('lavoratori', 4));
const PAUSA = Number(opt('pausa', 2000));
const lingua = opt('lingua', 'it');
const ancheAudio = !args.includes('--niente-audio');
const soloConFonte = args.includes('--solo-con-fonte');
const base = opt('base', 'https://www.wip.guide');
const STATO = opt('stato', 'scratch/audit-globale.stato.json');
const ENVF = process.env.ENVF || '/root/citta/.env';
const SEG_SCRIPT = (fs.existsSync(ENVF) ? fs.readFileSync(ENVF, 'utf8') : '').match(/^SCRIPT_SHARED_SECRET=(.*)$/m)?.[1]?.trim() || env.SCRIPT_SHARED_SECRET;
if (!SEG_SCRIPT) { console.error('manca SCRIPT_SHARED_SECRET (ne' + '/root/citta/.env ne' + ' .env/.env.local)'); process.exit(1); }
env.SCRIPT_SHARED_SECRET = SEG_SCRIPT;

const faseB = fs.readFileSync('/root/fase-b/fase-b-ciclo.cjs', 'utf8');
const pgPassword = faseB.match(/password:\s*'([^']+)'/)?.[1];
const db = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 5432,
  user: 'postgres.qfxxhzkkrkvbuekfknhh', password: pgPassword, database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const SOGLIA_TESTO = 60;
const SOGLIA_DETTAGLIO = 300;
const ETICHETTA_IMPORT = /^\s*\[Wikipedia Import\]/i;
const salta = /^(iti-|ai_|vision-|viator-|tq-|gyg-|tm-|tiqets-|ocm-)/;
const commerciale = /^(beach|restaurant|bar|cafe|pub|fast_food|ice_cream|food|hotel|hostel|guest_house|lodging|accommodation|lusso|locali|enogastronomia|shop|shopping|supermarket|ev_charging|fuel|parking|utilita|servizi|pharmacy|bank|atm|spa|wellness|nightclub|casino|gym|camp_site|campsite|marina)$/i;
// (01/10/2026, caso Terme Redi) Fonti della vecchia pipeline «a memoria», prima del fix del
// 22-24/08: il testo supera la soglia di lunghezza ma e' inventato (un belvedere panoramico al
// posto di uno stabilimento termale). Raro nel campione misurato (0 su 2000), ma quando c'e'
// va rifatto a prescindere da quanto e' lungo.
const FONTE_SOSPETTA = /^agnes_free/i;
const FONTE_IMPORT = /^(pending|import|wikivoyage|csv|osm|overture)?$/i;
const lungo = (t) => String(t || '').replace(/\s+/g, ' ').trim();
// Lavora su lunghezze (in byte: per le soglie basta) e sulle prime lettere, non sui testi interi.
const scarsa = (r) => {
  if (FONTE_SOSPETTA.test(String(r.enrichment_source || ''))) return 'fonte_sospetta';
  if (ETICHETTA_IMPORT.test(String(r.i_breve || '')) || ETICHETTA_IMPORT.test(String(r.i_lunga || '')) || ETICHETTA_IMPORT.test(String(r.i_ai || ''))) return 'etichetta_import';
  const lBreve = Number(r.l_breve) || 0, lLunga = Number(r.l_lunga) || 0, lAi = Number(r.l_ai) || 0;
  if (Math.max(lBreve, lLunga, lAi) < SOGLIA_TESTO) return 'testo_scarso';
  // (03/10/2026, «Padiglioncino Tamerici») Testo copiato all'import e mai passato dalla pipeline: niente breve,
  // fonte 'pending'/import, o entità HTML rimaste («&quot;»). Si rifà dalla fonte; il testo d'import si sostituisce
  // solo con un testo vero nuovo.
  if (FONTE_IMPORT.test(String(r.enrichment_source || '')) || (lBreve < 30 && Math.max(lLunga, lAi) >= SOGLIA_TESTO) || r.con_entita === true) return 'testo_import';
  // (02/10/2026) Frase breve presente ma descrizione dettagliata assente: fino a oggi la rotta non la
  // scriveva mai se la breve c'era gia' (Terme Redi). Si riempie, senza toccare la breve.
  if (Math.max(lLunga, lAi) < SOGLIA_DETTAGLIO) return 'senza_dettaglio';
  return null;
};
// Cosa chiedere al server per ciascun motivo: riempire (niente), sostituire un testo che non e' un testo,
// scartare un testo inventato anche se non si trova di meglio.
const ORDINI = {
  fonte_sospetta: { sostituisci: true, scartaVecchio: true },
  etichetta_import: { sostituisci: true, scartaVecchio: true },
  testo_scarso: { sostituisci: true },
  testo_import: { sostituisci: true },
  senza_dettaglio: {},
};

let stato = { dopoId: null, esaminati: 0, rifatti: 0, errori: 0, saltati: 0 };
try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch {}
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function saluteOk() {
  try {
    const t0 = Date.now();
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
    return r.ok && (Date.now() - t0) < 1500;
  } catch { return false; }
}

async function rifaiUno(r) {
  let e, j = {};
  // Fino a 2 giri: se il server dice `ricerca_guasta` (Wikimedia o modello in errore) l'esito vuoto non vale.
  for (let giro = 0; giro < 2; giro++) {
    e = await fetch(`${base}/api/poi/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
      body: JSON.stringify({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, category: r.category, subCategory: r.poi_type, lang: lingua, mode: 'full', force: true, motivo: r.motivo, ...(ORDINI[r.motivo] || {}) }),
      signal: AbortSignal.timeout(240000),
    }).catch((err) => ({ ok: false, status: 0, _err: err.message }));
    j = e.ok ? await e.json().catch(() => ({})) : {};
    if (e.ok && !j.ricerca_guasta && !j.salvataggio_fallito) break;
    await pausa(20000);
  }
  const ok = e.ok === true;
  const lungoNuovo = String(j.description_long || '').replace(/\s+/g, ' ').trim().length;
  if (ok) { stato.conDettaglio = (stato.conDettaglio || 0) + (lungoNuovo >= SOGLIA_DETTAGLIO ? 1 : 0); stato.motivi = stato.motivi || {}; stato.motivi[r.motivo] = (stato.motivi[r.motivo] || 0) + 1; }
  // Le due voci si rifanno solo se c'e' un testo vero su cui costruirle.
  if (ancheAudio && ok && Math.max(lungoNuovo, String(j.description_short || '').length) >= 60 && !j.solo_dati) {
    await Promise.all(['nicky', 'dante'].map((personaggio) =>
      fetch(`${base}/api/poi/audioguide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
        body: JSON.stringify({ poiId: r.id, lang: lingua, character: personaggio, force: true }),
        signal: AbortSignal.timeout(150000),
      }).then((a) => { if (a?.ok) stato.audio = (stato.audio || 0) + 1; }).catch(() => null),
    ));
  }
  return ok;
}

console.log(`${new Date().toISOString()} audit globale: riparto da id>${stato.dopoId || '(inizio)'}, esaminati finora ${stato.esaminati}, limite questo giro ${limite}`);
let maleDiFila = 0, saluteMaleDiFila = 0;
while (stato.esaminati < limite) {
  let data;
  try {
    // --solo-con-fonte: prima i luoghi che hanno GIA' la fonte esatta sulla riga (QID Wikidata o voce Wikipedia) —
    // li' il materiale c'e' di sicuro e la scheda completa e' garantita; il giro generale viene dopo.
    // Il filtro NON sta nella query: `(wikidata is not null or wikipedia_url is not null) order by id` va in
    // timeout (provato 02/10/2026, > 25 s). Si scorre per chiave primaria, come sempre, e si sceglie qui sotto.
    // LETTURA LEGGERA (02/10/2026): prima si scaricavano mille schede INTERE a lotto, un lotto dietro l'altro
    // (col filtro quasi tutte scartate, quindi senza pause): /api/health KO un minuto dopo l'avvio. Ora dei
    // testi si chiedono solo la lunghezza e le prime lettere — bastano a decidere — e fra i lotti c'e' una pausa.
    const colonne = `id, name, category, poi_type, lat, lon, enrichment_source,
      coalesce(char_length(description_short), 0) as l_breve, coalesce(char_length(description_long), 0) as l_lunga, coalesce(char_length(description_ai), 0) as l_ai,
      left(description_short, 24) as i_breve, left(description_long, 24) as i_lunga, left(description_ai, 24) as i_ai,
      (wikidata is not null or wikipedia_url is not null) as con_fonte,
      (strpos(left(description_long, 600), '&quot;') > 0 or strpos(left(description_long, 600), '&#') > 0 or strpos(left(description_short, 400), '&quot;') > 0) as con_entita`;
    const r = stato.dopoId
      ? await db.query(`select ${colonne} from shared_pois where (is_hidden is not true) and id > $1 order by id asc limit 500`, [stato.dopoId])
      : await db.query(`select ${colonne} from shared_pois where (is_hidden is not true) order by id asc limit 500`);
    data = r.rows;
  } catch (e) { console.error('lettura fallita:', e.message); await pausa(10000); continue; }
  if (!data || data.length === 0) { console.log('fine tabella, nessun altro POI.'); break; }
  // La posizione avanza a lotto FINITO (in fondo al ciclo): un riavvio a meta' rifa' il lotto, non lo salta.
  const prossimoId = data[data.length - 1].id;

  const conFonte = (r) => r.con_fonte === true;
  const daFare = data.filter((r) => r.name && !salta.test(String(r.id)) && !commerciale.test(String(r.category || '')) && !commerciale.test(String(r.poi_type || '')))
    .map((r) => ({ ...r, motivo: scarsa(r) })).filter((r) => r.motivo)
    // Con --solo-con-fonte passano i luoghi con la fonte sulla riga e, sempre, i testi da scartare (inventati o etichette).
    .filter((r) => !soloConFonte || conFonte(r) || r.motivo === 'fonte_sospetta' || r.motivo === 'etichetta_import');
  stato.saltati += data.length - daFare.length;

  const coda = [...daFare];
  await Promise.all(Array.from({ length: LAV }, async () => {
    while (coda.length) {
      const r = coda.shift();
      // Sito non sano: si ASPETTA (1, 2, 4… fino a 10 minuti), senza perdere il POI in mano e senza uscire —
      // uscendo systemd rilanciava dopo 60 s e il ripasso tornava a premere proprio durante il guasto.
      let attesaMin = 1;
      while (!(await saluteOk())) {
        saluteMaleDiFila++;
        console.log(`${new Date().toISOString()} sito non sano: pausa ${attesaMin} min`);
        await pausa(attesaMin * 60000);
        attesaMin = Math.min(attesaMin * 2, 10);
      }
      saluteMaleDiFila = 0;
      try {
        const ok = await rifaiUno(r);
        if (ok) { stato.rifatti++; maleDiFila = 0; } else { stato.errori++; maleDiFila++; }
      } catch { stato.errori++; maleDiFila++; }
      stato.esaminati++;
      if (maleDiFila >= 8) { console.log(`${new Date().toISOString()} troppi errori di fila: pausa 45s`); await pausa(45000); maleDiFila = 0; }
      await pausa(PAUSA);
    }
  }));
  stato.dopoId = prossimoId;
  stato.letti = (stato.letti || 0) + data.length;
  salva();
  await pausa(4000); // respiro fra un lotto e l'altro, anche quando non c'era niente da rifare
  console.log(`${new Date().toISOString()} letti ${stato.letti} | da rifare ${stato.esaminati} | riusciti ${stato.rifatti} | con descrizione dettagliata ${stato.conDettaglio || 0} | audioguide ${stato.audio || 0} | errori ${stato.errori} | motivi ${JSON.stringify(stato.motivi || {})} | ultimo id ${stato.dopoId}`);
}
// Tabella finita: si resta fermi sei ore prima di uscire (systemd rilancia, e il giro successivo trova solo il nuovo).
if (stato.esaminati < limite) await pausa(6 * 3600 * 1000);
console.log(`${new Date().toISOString()} FINITO (limite raggiunto o tabella esaurita): ${JSON.stringify(stato)}`);
