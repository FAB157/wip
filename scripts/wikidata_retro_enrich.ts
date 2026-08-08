import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import ws from 'ws';
import { collectPoiSources, fetchWikivoyageContext } from './lib/wiki';

(global as any).WebSocket = ws;
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: { fetch: fetch.bind(globalThis) }
});

const agnesKey = process.env.AGNES_API_KEY;
const agnesKey2 = process.env.AGNES_API_KEY_2;
const aiClients: OpenAI[] = [];

if (agnesKey) {
  aiClients.push(new OpenAI({ baseURL: "https://apihub.agnes-ai.com/v1", apiKey: agnesKey }));
}
if (agnesKey2) {
  aiClients.push(new OpenAI({ baseURL: "https://apihub.agnes-ai.com/v1", apiKey: agnesKey2 }));
}
if (aiClients.length === 0) {
  console.error("Nessuna AGNES_API_KEY trovata!");
  process.exit(1);
}

let currentClientIndex = 0;

const BATCH_SIZE = 30;
const MODEL_NAME = "agnes-2.5-flash";

// ── Parametri da riga di comando ────────────────────────────────────────────
// Lo script riscrive POI già pubblicati: parte in simulazione e richiede
// --apply per toccare il database.
const argv = process.argv.slice(2);
const DRY_RUN = !argv.includes('--apply');
const getArg = (name: string, fallback: string) =>
  (argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const MAX_POIS = parseInt(getArg('limit', '0'), 10); // 0 = nessun limite
const DELAY_MS = parseInt(getArg('delay', '300'), 10);

/**
 * Bonifica dei POI scritti dal vecchio prompt che ordinava di INVENTARE i
 * dettagli quando le fonti mancavano. Quel percorso marcava i POI con
 * enrichment_source = 'agnes_free_internal_json' (nessun testo Wikipedia
 * trovato), quindi il marcatore li identifica con precisione.
 * In questa modalità un POI senza fonti NON viene saltato: va riscritto sul
 * solo contesto, altrimenti la scheda inventata resterebbe pubblicata.
 */
const REDO_INVENTED = argv.includes('--redo-invented');
const INVENTED_SOURCE = 'agnes_free_internal_json';

/**
 * `--near=lat,lon,km`: limita l'elaborazione a una zona. Serve soprattutto per
 * giudicare la qualità dei testi su posti che si conoscono, invece di trovarsi
 * davanti POI presi in ordine di id da mezzo mondo.
 */
const NEAR = (() => {
  const raw = getArg('near', '');
  if (!raw) return null;
  const [lat, lon, km] = raw.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, km: Number.isFinite(km) && km > 0 ? km : 20 };
})();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const CULTURAL_CATEGORIES = [
  'monumenti', 'monument', 'musei', 'museum', 'museo',
  'castle', 'castelli', 'archaeological_site', 'siti_archeologici',
  'memorial', 'artwork', 'statua', 'statue', 'scultura', 'sculture',
  'panorami', 'panorama', 'viewpoint', 'cave_entrance', 'grotte',
  'nature_reserve', 'chiese', 'church', 'gemme'
];

// fetchWikidata e fetchWikipedia sono state sostituite da collectPoiSources
// (scripts/lib/wiki.ts): identifica il POI dalle coordinate invece di
// prendere il primo risultato di una ricerca testuale.

function finish(processed: number, updated: number) {
  console.log(`\n🎉 Retro-enrichment terminato! Processati: ${processed}, Aggiornati: ${updated}${DRY_RUN ? ' (simulazione)' : ''}`);
  if (DRY_RUN) console.log('Nessuna scrittura effettuata: rilancia con --apply per salvare.');
}

async function processRetroEnrichment() {
  console.log("🚀 Avvio Retro-Enrichment Wikidata...");
  console.log(`   modalità: ${DRY_RUN ? 'SIMULAZIONE (usa --apply per salvare)' : 'SCRITTURA sul database'}`);
  console.log(`   selezione: ${REDO_INVENTED
    ? `bonifica dei POI col testo inventato (enrichment_source=${INVENTED_SOURCE})`
    : 'POI già arricchiti, riscritti solo dove esistono fonti verificate'}`);
  if (MAX_POIS > 0) console.log(`   limite: ${MAX_POIS} POI`);
  if (NEAR) console.log(`   zona: ${NEAR.lat},${NEAR.lon} (${NEAR.km} km)`);
  
  let lastId = '0';
  let processed = 0;
  let updated = 0;

  while(true) {
    let query = supabase
      .from('shared_pois')
      .select('id, name, city, category, lat, lon, description_ai')
      .not('lat', 'is', null)
      .not('enriched_at', 'is', null) // Prendi quelli GIA' arricchiti in passato
      .in('category', CULTURAL_CATEGORIES)
      // Paginazione per id crescente: si riprende sempre da dove si era fermi.
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    // In bonifica si lavora SOLO sui POI col testo inventato dal vecchio prompt.
    if (REDO_INVENTED) query = query.eq('enrichment_source', INVENTED_SOURCE);

    if (NEAR) {
      // Riquadro attorno al punto indicato: 1° di latitudine ≈ 111 km.
      const dLat = NEAR.km / 111;
      const dLon = NEAR.km / (111 * Math.max(0.2, Math.cos((NEAR.lat * Math.PI) / 180)));
      query = query
        .gte('lat', NEAR.lat - dLat).lte('lat', NEAR.lat + dLat)
        .gte('lon', NEAR.lon - dLon).lte('lon', NEAR.lon + dLon);
    }

    const { data: pois, error } = await query;
      
    if (error || !pois || pois.length === 0) {
      console.log("Fine dei POI o errore:", error?.message);
      break;
    }

    console.log(`\n⏳ Analizzo batch da ${pois.length} POI (partendo da ${pois[0].name})...`);

    for (const poi of pois) {
      if (MAX_POIS > 0 && processed >= MAX_POIS) {
        console.log(`\nRaggiunto il limite di ${MAX_POIS} POI richiesto.`);
        return finish(processed, updated);
      }
      lastId = poi.id;
      processed++;
      
      // Controllo se il JSON attuale contiene già tracce o dati generati da Wikidata
      // Se vuoi evitare loop futuri, potremmo aggiungere una flag nel JSON, ma per ora tiriamo dritto.

      const searchQuery = `${poi.name} ${poi.city || ''}`.trim();

      // Aggancio per COORDINATE (scripts/lib/wiki.ts). La versione precedente
      // cercava per testo e prendeva il primo risultato: i dati di un omonimo
      // lontano finivano nel testo di questo POI come "dati ufficiali".
      const sources = await collectPoiSources(poi.name, poi.lat, poi.lon);
      const wikiData = sources.wikidata;
      const wikiRaw = sources.wikipedia;

      const hasSources = !!(sources.match && (wikiData || wikiRaw));

      if (!hasSources && !REDO_INVENTED) {
        // Nessuna fonte verificata: il testo attuale resta. Riscriverlo alla
        // cieca sarebbe un peggioramento, non un aggiornamento.
        await sleep(DELAY_MS);
        continue;
      }

      if (hasSources) {
        console.log(`-> 💡 [${poi.name}] agganciato a "${sources.match!.title}" (${sources.match!.distanceM}m${sources.match!.qid ? `, ${sources.match!.qid}` : ''})`);
        if (wikiData) console.log(`      Wikidata: ${wikiData}`);
      } else {
        // Modalità bonifica: questo POI porta un testo scritto dal vecchio
        // prompt "INVENTA", quindi con date e architetti mai verificati.
        // Lasciarlo com'è significherebbe tenersi la bugia: lo riscriviamo
        // sul solo contesto reale.
        console.log(`-> 🧹 [${poi.name}] nessuna fonte: riscrittura sul solo contesto (rimuove i dettagli inventati).`);
      }

      const contestoWikivoyage = hasSources ? '' : await fetchWikivoyageContext(poi.city || '');

      const systemPrompt = `Sei un esperto di storia, cultura e turismo che riscrive la scheda di questo luogo per un'app di viaggio.
Devi restituire ESCLUSIVAMENTE un oggetto JSON valido.

REGOLA ASSOLUTA — NON INVENTARE NULLA DI SPECIFICO. Date, secoli, architetti, artisti, committenti ed eventi storici possono comparire SOLO se presenti nelle fonti qui sotto. Vietato dedurli o ipotizzarli. Un testo più breve e vero vale più di uno lungo e inventato.
${hasSources
  ? `REGOLA ASSOLUTA — Se le fonti riguardano chiaramente un ALTRO luogo (nome o zona incompatibili con quello indicato), ignorale e rispondi {"status": "SKIP"}: meglio lasciare il testo esistente che sostituirlo con dati di un altro monumento.`
  : `MODALITÀ CONTESTO — Per questo luogo NON esistono fonti verificate: la scheda attuale contiene dettagli inventati da rimuovere. Scrivi un testo utile parlando solo di ciò che è realmente noto del CONTESTO: il territorio e la città ("${poi.city || 'la zona'}"), che cosa è un "${poi.category}" e che ruolo ha di solito, che cosa trova chi ci arriva davanti. Nessuna data, nessun nome di architetto o artista riferito a questo edificio.`}

JSON da restituire:
{
  "status": "OK",
  "descrizione_breve_it": "Max 25 parole (italiano). Includi un dettaglio unico reale.",
  "descrizione_breve_en": "Max 25 words (English). Include a specific unique detail.",
  "descrizione_dettagliata_it": "Testo storico-turistico denso di informazioni, 1000-1500 caratteri (italiano). Nomi, date, curiosità storiche. Niente frasi fatte.",
  "descrizione_dettagliata_en": "Historical-tourist text, dense with facts, 1000-1500 chars (English).",
  "ulteriori_informazioni_it": "Info pratiche solo se ricavabili dalle fonti; altrimenti indicazioni generali sulla visita, senza inventare orari o prezzi.",
  "teaser_it": "Un teaser invitante di circa 5/6 secondi di lettura (italiano).",
  "teaser_en": "An inviting teaser of about 5/6 seconds of reading (English).",
  "testo_nicky_it": "120-150 parole. Stile informale e vivace, dettagli visivi di ciò che si vede. (Inizia con ✨)",
  "testo_nicky_en": "Nicky style in English, 120-150 words. (start with ✨)",
  "testo_dante_it": "120-150 parole. Stile formale, enciclopedico. Con fonti: sfrutta i dati esatti (date, architetti, materiali). Senza fonti: inquadramento storico del territorio, senza date attribuite a questo edificio. (Inizia con 📜)",
  "testo_dante_en": "Dante style in English, 120-150 words. (start with 📜)"
}

LUOGO: "${searchQuery}" — Categoria: "${poi.category}"

Wikidata (Dati Strutturati ESATTI): ${wikiData || 'Nessun dato strutturato.'}
Wikipedia: ${wikiRaw || 'Nessun testo discorsivo.'}
${contestoWikivoyage ? `Wikivoyage (contesto sulla località, NON sul singolo edificio): ${contestoWikivoyage}` : ''}`;

      try {
        const activeClient = aiClients[currentClientIndex];
        currentClientIndex = (currentClientIndex + 1) % aiClients.length;
        const response = await activeClient.chat.completions.create({
          model: MODEL_NAME,
          messages: [{ role: 'user', content: systemPrompt }],
          temperature: 0.3,
          response_format: { type: "json_object" }
        });

        const resultJson = response.choices[0].message.content;
        if (!resultJson) continue;
        
        let parsed;
        try { parsed = JSON.parse(resultJson); } catch (e) { continue; }
        
        if (parsed.status !== "OK") {
          console.log(`      ⏭️  Il modello ha risposto ${parsed.status || 'senza OK'}: testo esistente lasciato intatto.`);
          continue;
        }

        if (DRY_RUN) {
          console.log(`      🔎 [simulazione] aggiornerei: ${String(parsed.descrizione_breve_it || '').slice(0, 90)}…`);
          updated++;
          continue;
        }

        // Gli stessi campi che scrive mass-enrich: aggiornare solo
        // description_ai lasciava il resto dell'app (schede, teaser, info
        // pratiche) fermo ai testi vecchi.
        const { error: upErr } = await supabase
          .from('shared_pois')
          .update({
            description_short: parsed.descrizione_breve_it,
            description_long: parsed.descrizione_dettagliata_it,
            teaser_text_it: parsed.teaser_it,
            teaser_text_en: parsed.teaser_en,
            practical_info: parsed.ulteriori_informazioni_it,
            // Testo discorsivo, NON il JSON serializzato: la UI usa questo
            // campo come fallback e mostrerebbe le graffe all'utente.
            description_ai: parsed.descrizione_dettagliata_it,
            // Distingue le schede ricostruite sui fatti da quelle riscritte sul
            // solo contesto: le seconde vanno rifatte quando compaiono fonti.
            enrichment_source: hasSources ? 'wikidata_retro' : 'agnes_context_only',
            updated_at: new Date().toISOString()
          })
          .eq('id', poi.id);
        if (upErr) {
          console.error(`      ❌ Update POI fallito: ${upErr.message}`);
          continue;
        }

        // Colonne allineate a poiRepository.upsertAudioguide: la versione
        // precedente scriveva profile/text_content, che nel database non
        // esistono — le audioguide "salvate" non le leggeva nessuno.
        const nowIso = new Date().toISOString();
        const audioRecords = [
          { poi_id: poi.id, language: 'IT', guide_character: 'nicky', audio_text: parsed.testo_nicky_it, generated_at: nowIso },
          { poi_id: poi.id, language: 'EN', guide_character: 'nicky', audio_text: parsed.testo_nicky_en, generated_at: nowIso },
          { poi_id: poi.id, language: 'IT', guide_character: 'dante', audio_text: parsed.testo_dante_it, generated_at: nowIso },
          { poi_id: poi.id, language: 'EN', guide_character: 'dante', audio_text: parsed.testo_dante_en, generated_at: nowIso }
        ].filter(r => r.audio_text);

        if (audioRecords.length > 0) {
          const { error: audioErr } = await supabase
            .from('poi_audioguides')
            .upsert(audioRecords, { onConflict: 'poi_id,language,guide_character' });
          if (audioErr) console.error(`      ❌ Audioguide non salvate: ${audioErr.message}`);
        }

        console.log(`      ✅ Upgrade completato per: ${poi.name}`);
        updated++;
      } catch (e: any) {
         console.error("Errore AI/DB:", e.message);
      }

      // Le API Wikimedia sono gratuite: non tempestarle di richieste.
      await sleep(DELAY_MS);
    }
  }
  
  finish(processed, updated);
}

processRetroEnrichment();
