import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { collectPoiSources, findOfficialPhoto, fetchWikivoyageContext } from './lib/wiki';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Mancano le credenziali Supabase nel file .env");
  process.exit(1);
}

const FOURSQUARE_KEY = process.env.VITE_FOURSQUARE_API_KEY || process.env.FOURSQUARE_API_KEY || '';


// Polyfill per il warning di Supabase su Node
import ws from 'ws';
(global as any).WebSocket = ws;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: { fetch: fetch.bind(globalThis) }
});

// ── Parametri da riga di comando ────────────────────────────────────────────
const argv = process.argv.slice(2);
const getArg = (name: string, fallback: string) =>
  (argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);

/**
 * Provider LLM. Agnes resta il motore predefinito di questo script; OpenRouter
 * è opzionale (--provider=openrouter) per le campagne in cui serve un modello
 * diverso o un fallback quando Agnes è satura.
 */
const PROVIDER = getArg('provider', 'agnes');
/** Quanti POI elaborare in parallelo: era rigorosamente uno alla volta. */
const CONCURRENCY = Math.max(1, Math.min(parseInt(getArg('concurrency', '1'), 10) || 1, 12));

const agnesKey = process.env.AGNES_API_KEY;
const agnesKey2 = process.env.AGNES_API_KEY_2;

const aiClients: OpenAI[] = [];
let MODEL_NAME: string;

if (PROVIDER === 'openrouter') {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    console.error("Manca OPENROUTER_API_KEY nel file .env");
    process.exit(1);
  }
  MODEL_NAME = getArg('model', 'google/gemini-2.0-flash-001');
  aiClients.push(new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: orKey,
    // OpenRouter usa questi header per le statistiche di utilizzo.
    defaultHeaders: { 'HTTP-Referer': 'https://wip.guide', 'X-Title': 'WIP World in Pocket' },
  }));
  console.log(`🌐 Motore OpenRouter attivo (modello: ${MODEL_NAME}).`);
} else {
  if (!agnesKey) {
    console.error("Manca AGNES_API_KEY nel file .env");
    process.exit(1);
  }
  MODEL_NAME = getArg('model', 'agnes-2.5-flash');
  aiClients.push(new OpenAI({ baseURL: "https://apihub.agnes-ai.com/v1", apiKey: agnesKey }));
  if (agnesKey2) {
    aiClients.push(new OpenAI({ baseURL: "https://apihub.agnes-ai.com/v1", apiKey: agnesKey2 }));
    console.log("🚀 DOPPIO MOTORE AGNES AI ATTIVATO! (Load Balancing su 2 chiavi)");
  } else {
    console.log("🚗 Singolo motore Agnes AI attivato.");
  }
}

let currentClientIndex = 0;
/** Sceglie il client a rotazione: con più chiavi il carico si distribuisce. */
function nextClient(): OpenAI {
  const client = aiClients[currentClientIndex];
  currentClientIndex = (currentClientIndex + 1) % aiClients.length;
  return client;
}

const BATCH_SIZE = 30; // Alzato da 15 a 30 per raddoppiare la velocità
const DELAY_BETWEEN_BATCHES = 100; // Abbassato da 1000 a 100 per ridurre i tempi morti tra batch
/** Pausa dopo ogni POI, per worker: tiene a bada Wikimedia e il provider AI. */
const POI_DELAY_MS = parseInt(getArg('delay', '2000'), 10);

const CULTURAL_CATEGORIES = [
  'monumenti', 'monument', 
  'musei', 'museum', 'museo',
  'castle', 'castelli',
  'archaeological_site', 'siti_archeologici',
  'memorial',
  'artwork', 'statua', 'statue', 'scultura', 'sculture',
  'panorami', 'panorama', 'viewpoint',
  'cave_entrance', 'grotte',
  'nature_reserve',
  'chiese', 'church',
  'gemme'
];

const ALWAYS_ENRICH_CATEGORIES = new Set(CULTURAL_CATEGORIES);


let sessionEnrichedCount = 0;
let nextReportTarget = 5000;
let samplePoisForReport: any[] = [];
const REGIONS = [
  // 🇮🇹 Priorità assoluta richiesta: Tutta Italia
  { name: "Massa-Carrara",    minLat: 44.01, maxLat: 44.15,  minLon: 9.95,  maxLon: 10.20 },
  { name: "Toscana",          minLat: 42.2, maxLat: 44.5,  minLon: 9.6,   maxLon: 12.4  },
  { name: "Lazio & Roma",     minLat: 41.2, maxLat: 42.8,  minLon: 11.4,  maxLon: 14.0  },
  { name: "Lombardia",        minLat: 44.6, maxLat: 46.7,  minLon: 8.5,   maxLon: 11.4  },
  { name: "Campania & Napoli",minLat: 39.9, maxLat: 41.4,  minLon: 13.7,  maxLon: 16.0  },
  { name: "Sicilia",          minLat: 36.6, maxLat: 38.3,  minLon: 12.4,  maxLon: 15.7  },
  { name: "Veneto & Venezia", minLat: 44.8, maxLat: 46.7,  minLon: 10.9,  maxLon: 13.1  },
  { name: "Liguria",          minLat: 43.7, maxLat: 44.5,  minLon: 6.6,   maxLon: 10.0  },
  { name: "Piemonte",         minLat: 44.0, maxLat: 46.5,  minLon: 6.6,   maxLon: 9.0   },
  { name: "Puglia",           minLat: 39.7, maxLat: 41.9,  minLon: 14.9,  maxLon: 18.5  },
  { name: "Sardegna",         minLat: 38.8, maxLat: 41.3,  minLon: 8.1,   maxLon: 9.8   },
  { name: "Umbria & Marche",  minLat: 42.4, maxLat: 43.9,  minLon: 11.4,  maxLon: 14.0  },
  { name: "Resto Italia",     minLat: 36.6, maxLat: 47.1,  minLon: 6.6,   maxLon: 18.5  },

  // 🌍 Resto del mondo
  { name: "Francia",          minLat: 41.3, maxLat: 51.1,  minLon: -5.1,  maxLon: 9.5   },
  { name: "Europa",           minLat: 35.0, maxLat: 71.0,  minLon: -25.0, maxLon: 40.0  },
  { name: "USA e Nord America",minLat: 24.3, maxLat: 49.3, minLon: -125.0,maxLon: -66.9 },
  { name: "Mondo",            minLat: -90,  maxLat: 90,    minLon: -180,  maxLon: 180   }
];


// fetchWikipedia e fetchWikidata sono state sostituite da collectPoiSources
// (scripts/lib/wiki.ts), che identifica il POI dalle coordinate invece di
// prendere il primo risultato di una ricerca testuale.

// fetchWikivoyage e fetchWikimediaImages sono state sostituite da
// fetchWikivoyageContext e findOfficialPhoto (scripts/lib/wiki.ts): cercavano
// per testo e restituivano il primo risultato, spesso di un altro luogo.

async function fetchFoursquareImages(lat: number, lon: number, name: string): Promise<string[]> {
  if (!FOURSQUARE_KEY) return [];
  try {
    const sUrl = `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&query=${encodeURIComponent(name)}&limit=1`;
    const sRes = await axios.get(sUrl, { headers: { Authorization: FOURSQUARE_KEY }, timeout: 3000 });
    const fsq_id = sRes.data?.results?.[0]?.fsq_id;
    if (fsq_id) {
       const dRes = await axios.get(`https://api.foursquare.com/v3/places/${fsq_id}/photos?limit=3`, { headers: { Authorization: FOURSQUARE_KEY }, timeout: 3000 });
       if (dRes.data && Array.isArray(dRes.data)) {
         return dRes.data.map((p: any) => `${p.prefix}original${p.suffix}`);
       }
    }
  } catch (e) {}
  return [];
}

async function fetchUnsplashImages(searchQuery: string): Promise<string[]> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return [];
  try {
    const res = await axios.get(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&client_id=${process.env.UNSPLASH_ACCESS_KEY}&per_page=3`, { timeout: 3000 });
    if (res.data && res.data.results && res.data.results.length > 0) {
      return res.data.results.map((r: any) => r.urls.regular);
    }
  } catch (e) {}
  return [];
}


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function processBatchForRegion(region: typeof REGIONS[0]) {
  const { data: pois, error } = await supabase
    .from('shared_pois')
    .select('id, name, city, region, category, is_gem, lat, lon')
    .is('enriched_at', null)
    .in('category', CULTURAL_CATEGORIES)
    .gte('lat', region.minLat)
    .lte('lat', region.maxLat)
    .gte('lon', region.minLon)
    .lte('lon', region.maxLon)
    .limit(BATCH_SIZE);

  if (error) {
    console.error(`Errore fetch POI in ${region.name}:`, error.message);
    return false;
  }

  if (!pois || pois.length === 0) return false;

  console.log(`\n📍 Trovati ${pois.length} Luoghi in ${region.name}. Inizio batch...`);

  // Elabora un singolo POI. Isolato in una funzione per poterne mandare
  // avanti più d'uno in parallelo (vedi il pool più sotto): prima si andava
  // rigorosamente uno alla volta, con il processo fermo ad aspettare la rete.
  const processPoi = async (poi: any) => {
    const searchQuery = `${poi.name} ${poi.city || ''}`.trim();
    console.log(`-> Arricchimento di: ${searchQuery} [Cat: ${poi.category}]`);

    // Fonti del POI agganciate alle COORDINATE (scripts/lib/wiki.ts): la
    // vecchia ricerca per testo prendeva il primo risultato senza verifiche e
    // poteva restituire l'omonimo dall'altra parte d'Italia, i cui dati
    // finivano nel testo come se fossero di questo luogo.
    const sources = await collectPoiSources(poi.name, poi.lat, poi.lon);
    const wikiRaw = sources.wikipedia;
    const wikiData = sources.wikidata;

    const [wvRaw, officialPhoto, fsqImages, unsplashImages] = await Promise.all([
      // Wikivoyage resta una fonte di CONTESTO sulla località, non sul POI.
      fetchWikivoyageContext(poi.city || region.name),
      // Foto ufficiale del luogo, identificata dalle coordinate: riusa
      // l'entità già risolta, quindi non ripete la geosearch.
      findOfficialPhoto(poi.name, poi.lat, poi.lon, sources.match),
      fetchFoursquareImages(poi.lat, poi.lon, poi.name),
      fetchUnsplashImages(searchQuery)
    ]);

    if (sources.match) {
      console.log(`      🔗 Agganciato a "${sources.match.title}" (${sources.match.distanceM}m${sources.match.qid ? `, ${sources.match.qid}` : ''})`);
    } else {
      console.log(`      🌍 Nessuna pagina enciclopedica su questo punto: testo di solo contesto.`);
    }

    // Ordine di preferenza delle foto: prima quella UFFICIALE del luogo
    // (Wikidata/Commons/Wikipedia identificati per coordinate), poi le foto
    // del posto da Foursquare, e solo in fondo Unsplash — che è generica per
    // definizione e resta marcata come tale, così `fix-photos` la sostituirà
    // appena il luogo avrà una foto vera.
    let images: string[] = [];
    if (officialPhoto) {
      images = [officialPhoto.url];
      console.log(`      📷 Foto ufficiale (${officialPhoto.source}): ${officialPhoto.detail}`);
    } else if (fsqImages.length > 0) {
      images = fsqImages;
    } else if (unsplashImages.length > 0) {
      console.log(`      [IMG] Nessuna foto del luogo: ripiego generico, sostituibile con fix-photos.`);
      images = unsplashImages;
    }

    const photoUrl = images.length > 0 ? images[0] : null;
    const imagesJson = images.length > 0 ? images : null;

    // Due modalità di scrittura. La versione precedente ne aveva una sola e
    // ordinava al modello di INVENTARE date e architetti "verosimili" quando
    // le fonti mancavano: fatti falsi salvati nel database e poi letti ad alta
    // voce al turista come veri. Ora il testo c'è sempre, ma senza inventare:
    // con fonti si raccontano i FATTI di quel luogo, senza fonti si racconta
    // il CONTESTO reale (città, territorio, tipo di luogo) senza attribuire al
    // POI date, nomi o eventi che nessuno ha verificato.
    // Solo Wikipedia/Wikidata parlano di QUESTO POI. Wikivoyage descrive la
    // località: è contesto, non una fonte che autorizzi a citare date e nomi.
    const hasSources = !!(wikiRaw || wikiData);

    const regoleComuni = `REGOLA ASSOLUTA 1 — NON INVENTARE NULLA DI SPECIFICO SU QUESTO LUOGO. È VIETATO attribuirgli date di costruzione, secoli, architetti, artisti, committenti, eventi storici o aneddoti che non siano scritti nelle fonti qui sotto. Vietato anche dedurli o ipotizzarli ("risalente probabilmente al Quattrocento", "opera della scuola di..."). Se non lo sai, non scriverlo.
REGOLA ASSOLUTA 2 — VIETATE le frasi vuote da dépliant ("un viaggio nel tempo", "un mix di storia e bellezza", "un luogo magico", "sospeso tra passato e presente"): occupano spazio senza dire nulla.
REGOLA ASSOLUTA 3 — Scrivi in italiano e inglese naturali, mai tradotti alla lettera.`;

    const modalitaConFonti = `MODALITÀ: FONTI DISPONIBILI.
Racconta questo luogo usando i fatti delle fonti: date, nomi, stili e materiali che vi compaiono. Più sono concreti, meglio è. Se le fonti riguardano CHIARAMENTE un altro luogo (nome o zona incompatibili), ignorale del tutto e comportati come in assenza di fonti, descrivendo solo il contesto.`;

    const modalitaContesto = `MODALITÀ: NESSUNA FONTE SPECIFICA SU QUESTO LUOGO.
Non hai dati verificati su questo POI: NON inventarli. Scrivi comunque un testo utile e piacevole, ma parlando di ciò che è realmente noto e verificabile del CONTESTO:
— il territorio e la città ("${poi.city || region.name}"): paesaggio, tradizioni, materiali locali, storia generale della zona;
— che cosa è un "${poi.category}" e che ruolo ha di solito nella vita di un luogo così;
— che cosa può aspettarsi chi ci arriva davanti, in termini generali.
Parla del luogo al presente e in termini generali ("questa chiesa fa parte del tessuto storico di ${poi.city || region.name}"), MAI attribuendogli fatti precisi non verificati. Nessuna data, nessun nome proprio di architetto o artista riferito a questo edificio.`;

    const systemPrompt = `Sei un esperto di storia, cultura e turismo che scrive per un'app di viaggio.
Devi restituire ESCLUSIVAMENTE un oggetto JSON valido. NON aggiungere markdown (\`\`\`json).

${regoleComuni}

${hasSources ? modalitaConFonti : modalitaContesto}

JSON da restituire:
{
  "status": "OK",
  "descrizione_breve_it": "Max 25 parole (italiano). Con fonti: il dettaglio più caratterizzante. Senza fonti: che cos'è e dove si trova, senza fatti inventati.",
  "descrizione_breve_en": "Max 25 words (English), stesso criterio.",
  "descrizione_dettagliata_it": "800-1500 caratteri (italiano). Con fonti: nomi, date, vicende. Senza fonti: contesto territoriale e culturale reale, senza attribuire nulla di preciso a questo edificio.",
  "descrizione_dettagliata_en": "800-1500 chars (English), stesso criterio.",
  "ulteriori_informazioni_it": "Info pratiche solo se ricavabili dalle fonti; altrimenti indicazioni generali sulla visita, senza inventare orari o prezzi.",
  "teaser_it": "Teaser invitante di 25-30 parole, perfetto da leggere ad alta voce. Con fonti: un fatto concreto. Senza fonti: un invito legato al luogo e alla città, senza fatti inventati.",
  "teaser_en": "Inviting teaser, 25-30 words (English), stesso criterio.",
  "testo_nicky_it": "120-150 parole. Stile informale e vivace, dettagli visivi concreti di ciò che si vede. (Inizia con ✨)",
  "testo_nicky_en": "Nicky style in English, 120-150 words (start with ✨).",
  "testo_dante_it": "120-150 parole. Stile formale e colto. Con fonti: date ed eventi tangibili. Senza fonti: inquadramento storico del territorio, senza date attribuite a questo edificio. (Inizia con 📜)",
  "testo_dante_en": "Dante style in English, 120-150 words (start with 📜)."
}

LUOGO DA ARRICCHIRE: "${searchQuery}" — Categoria: "${poi.category}"
ZONA DEL LUOGO: "${region.name}" (Città: "${poi.city || 'N/A'}")

Wikidata (Dati Strutturati Ufficiali): ${wikiData || 'Nessun dato strutturato.'}
Wikipedia: ${wikiRaw || 'Nessun dato enciclopedico.'}
Wikivoyage: ${wvRaw || 'Nessun dato.'}`;


    try {
      const activeClient = nextClient();

      const response = await activeClient.chat.completions.create({
        model: MODEL_NAME,
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });
      
      const rawText = response.choices[0]?.message?.content?.trim() || "{}";
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        // Fallback robusto se il LLM ha aggiunto backticks
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      }

      parsed.status = "OK";

      // Traccia con quale materiale è stato scritto il testo: i POI descritti
      // solo per contesto vanno riprocessati quando compaiono fonti vere.
      const sourceAI = hasSources ? 'agnes_wiki_sourced' : 'agnes_context_only';

      // Mapping dei campi del Database
      const updatePayload = {
        description_short: parsed.descrizione_breve_it,
        description_long: parsed.descrizione_dettagliata_it,
        teaser_text_it: parsed.teaser_it,
        teaser_text_en: parsed.teaser_en,
        practical_info: parsed.ulteriori_informazioni_it,
        // Ripristinato a descrizione_dettagliata_it per evitare che la UI mostri il JSON grezzo come fallback
        description_ai: parsed.descrizione_dettagliata_it,
        // Se si volessero salvare i testi di Nicky e Dante si dovrebbero aggiungere campi ad-hoc (es. audio_script_nicky)
        photo_url: photoUrl,
        images_json: imagesJson,
        enriched_at: new Date().toISOString(),
        enrichment_source: sourceAI
      };

      await supabase.from('shared_pois').update(updatePayload).eq('id', poi.id);
      
      // Salvataggio testuale delle Audioguide (Nicky e Dante) pronte all'uso
      const audioguides = [];
      const nowIso = new Date().toISOString();
      if (parsed.testo_nicky_it) audioguides.push({ poi_id: poi.id, language: 'IT', guide_character: 'nicky', audio_text: parsed.testo_nicky_it, generated_at: nowIso });
      if (parsed.testo_nicky_en) audioguides.push({ poi_id: poi.id, language: 'EN', guide_character: 'nicky', audio_text: parsed.testo_nicky_en, generated_at: nowIso });
      if (parsed.testo_dante_it) audioguides.push({ poi_id: poi.id, language: 'IT', guide_character: 'dante', audio_text: parsed.testo_dante_it, generated_at: nowIso });
      if (parsed.testo_dante_en) audioguides.push({ poi_id: poi.id, language: 'EN', guide_character: 'dante', audio_text: parsed.testo_dante_en, generated_at: nowIso });
      
      if (audioguides.length > 0) {
        const { error: audioErr } = await supabase.from('poi_audioguides').upsert(audioguides, { onConflict: 'poi_id,language,guide_character' });
        if (audioErr) console.error(`   ❌ Errore salvataggio audioguide per ${poi.name}:`, audioErr.message);
      }
      
      console.log(`   ✅ Successo: JSON multiparte per ${poi.name} salvato (incluse Audioguide)!`);
      
      sessionEnrichedCount++;
      samplePoisForReport.push({ name: poi.name, city: poi.city, teaser: parsed.teaser_it, nicky: parsed.testo_nicky_it });

      if (sessionEnrichedCount >= nextReportTarget) {
        try {
          const reportPois = samplePoisForReport.slice(-50);
          const reportPath = path.join(process.cwd(), `report_arricchimento_${nextReportTarget}.md`);
          let md = `# Report Arricchimento JSON - Quota ${nextReportTarget}\\n\\n`;
          reportPois.forEach((p, idx) => {
             md += `## ${idx + 1}. ${p.name} (${p.city || 'N/A'})\\n`;
             md += `**Teaser:** ${p.teaser}\\n`;
             md += `**Nicky:** ${p.nicky?.substring(0, 150)}...\\n\\n`;
          });
          fs.writeFileSync(reportPath, md);
          console.log(`📝 Creato report intermedio: ${reportPath}`);
          
          nextReportTarget += 5000;
          samplePoisForReport = []; 
        } catch(e) {
          console.error("Errore salvataggio report:", e);
        }
      }
      
    } catch (llmErr: any) {
      console.error(`   ❌ Errore AI su ${poi.name}:`, llmErr.message || llmErr);
      
      const isRateLimit = llmErr.status === 429;
      const isTimeout = llmErr.status >= 500 || (llmErr.message && llmErr.message.includes('timed out'));
      
      if (isRateLimit || isTimeout) {
         console.warn(`🚨 Errore temporaneo AI (Rate limit o Timeout)! Riposo di 10 secondi, il POI resta da fare.`);
         await sleep(10000);
         return;
      }

      // Se è un errore grave non recuperabile (es. 400), lo scartiamo per non bloccare il loop all'infinito
      await supabase.from('shared_pois').update({
        enriched_at: new Date().toISOString(),
        enrichment_source: 'ai_error'
      }).eq('id', poi.id);
    }
  };

  // Pool a concorrenza fissa: N POI in volo, e appena uno finisce parte il
  // successivo. Con --concurrency=1 il comportamento resta quello sequenziale
  // di prima, che è il default.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, pois.length) }, async () => {
    while (cursor < pois.length) {
      const poi = pois[cursor++];
      try {
        await processPoi(poi);
      } catch (e: any) {
        console.error(`   ❌ POI ${poi?.name} saltato:`, e?.message || e);
      }
      await sleep(POI_DELAY_MS);
    }
  });
  await Promise.all(workers);

  return true;
}

async function startLoop() {
  console.log(`Inizio script massivo JSON con Agnes AI (${MODEL_NAME})...`);
  
  while (true) {
    for (const region of REGIONS) {
      console.log(`\n======================================================`);
      console.log(`🔎 Avvio scansione zona: ${region.name.toUpperCase()}`);
      console.log(`======================================================`);
      
      let regionHasMore = true;
      while (regionHasMore) {
        regionHasMore = await processBatchForRegion(region);
        if (regionHasMore) {
          await sleep(DELAY_BETWEEN_BATCHES);
        }
      }
      console.log(`🏆 Zona ${region.name} completata.`);
    }
    
    console.log("🎉 CICLO GLOBALE COMPLETATO. In attesa di 1 ora prima di ricominciare...");
    await sleep(3600000); // 1 hour sleep
  }
}

startLoop();
