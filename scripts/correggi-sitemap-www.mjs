// Riscrive gli indirizzi nelle sitemap gia' in cache passando a www.
//
// Le prime sitemap sono state costruite quando il canonico era ancora
// `https://wip.guide`, che pero' risponde 308 e rimanda a `www.wip.guide`.
// Il risultato: ogni indirizzo nella sitemap costava a Google un salto in
// piu', e non combaciava con il canonico dichiarato dalla pagina.
//
// Non serve rileggere shared_pois per correggerlo: il contenuto e' gia' in
// api_cache, basta sostituire la stringa. Dodici letture e dodici scritture
// su una tabella piccola, invece di milioni di righe su quella grande —
// cosa che conta, visto che il database e' condiviso con l'app.
//
// Uso: node scripts/correggi-sitemap-www.mjs
import "dotenv/config";
import axios from "axios";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Mancano VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const leggi = async (chiave) => {
  const { data } = await axios.get(
    `${SUPABASE_URL}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(chiave)}&select=text_content&limit=1`,
    { headers: H, timeout: 30000 },
  );
  return Array.isArray(data) && data[0] ? data[0].text_content : null;
};

const scrivi = (chiave, contenuto) => axios.post(
  `${SUPABASE_URL}/rest/v1/api_cache`,
  { cache_key: chiave, content_type: 'seo', text_content: contenuto, created_at: new Date().toISOString() },
  { headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 30000 },
);

async function main() {
  const totale = Number(await leggi('seo_sitemap_shard_totale')) || 0;
  if (!totale) { console.log('Nessuna sitemap in cache.'); return; }
  console.log(`${totale} sitemap da controllare.`);

  let corrette = 0, gia = 0;
  for (let n = 0; n < totale; n++) {
    const xml = await leggi(`seo_sitemap_shard_${n}`);
    if (!xml) { console.warn(`  shard ${n}: assente`); continue; }
    if (!xml.includes('https://wip.guide/')) { gia++; continue; }
    const nuovo = xml.split('https://wip.guide/').join('https://www.wip.guide/');
    await scrivi(`seo_sitemap_shard_${n}`, nuovo);
    corrette++;
    console.log(`  shard ${n}: corretto`);
  }
  console.log(`\nFatto: ${corrette} corrette, ${gia} gia' a posto.`);
}

main().catch((e) => { console.error(String(e?.response?.data?.message || e?.message || e)); process.exit(1); });
