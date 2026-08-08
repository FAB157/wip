import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

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

const agnesKey = process.env.AGNES_API_KEY;
const agnesKey2 = process.env.AGNES_API_KEY_2;
if (!agnesKey) {
  console.error("Manca AGNES_API_KEY nel file .env");
  process.exit(1);
}

const aiClients = [
  new OpenAI({ baseURL: "https://apihub.agnes-ai.com/v1", apiKey: agnesKey })
];

if (agnesKey2) {
  aiClients.push(new OpenAI({ baseURL: "https://apihub.agnes-ai.com/v1", apiKey: agnesKey2 }));
  console.log("🚀 DOPPIO MOTORE AGNES AI ATTIVATO! (Load Balancing su 2 chiavi)");
} else {
  console.log("🚗 Singolo motore Agnes AI attivato.");
}

let currentClientIndex = 0;

const BATCH_SIZE = 30; // Alzato da 15 a 30 per raddoppiare la velocità
const DELAY_BETWEEN_BATCHES = 100; // Abbassato da 1000 a 100 per ridurre i tempi morti tra batch
const MODEL_NAME = "agnes-2.5-flash";

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


async function fetchWikipedia(title: string): Promise<string> {
  const headers = { 'User-Agent': 'ItaintaApp/1.0 (contact@itainta.com)' };
  try {
    const res = await axios.get(`https://it.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=1&prop=extracts&exintro=false&explaintext=1&format=json`, { timeout: 3000, headers });
    const pages = res.data?.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      if (pageId && pageId !== "-1" && pages[pageId].extract) return pages[pageId].extract.substring(0, 1500);
    }
  } catch (e) {}
  
  try {
    const resEn = await axios.get(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=1&prop=extracts&exintro=false&explaintext=1&format=json`, { timeout: 3000, headers });
    const pagesEn = resEn.data?.query?.pages;
    if (pagesEn) {
      const pageId = Object.keys(pagesEn)[0];
      if (pageId && pageId !== "-1" && pagesEn[pageId].extract) return pagesEn[pageId].extract.substring(0, 1500);
    }
  } catch (e) {}
  return "";
}

async function fetchWikivoyage(query: string): Promise<string> {
  try {
    const res = await axios.get(`https://it.wikivoyage.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=1`, { 
      timeout: 3000,
      headers: { 'User-Agent': 'ItaintaApp/1.0 (contact@itainta.com)' }
    });
    if (res.data?.query?.search?.[0]) return res.data.query.search[0].snippet.replace(/<\/?[^>]+(>|$)/g, "");
  } catch (e) {}
  return "";
}

async function fetchWikimediaImages(query: string): Promise<string[]> {
  try {
    const images: string[] = [];
    const headers = { 'User-Agent': 'ItaintaApp/1.0 (contact@itainta.com)' };
    
    // 1. Prova Wikipedia IT page image
    let url = `https://it.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(query)}&format=json&pithumbsize=1200`;
    let res = await axios.get(url, { timeout: 3000, headers });
    let pages = res.data?.query?.pages;
    if (pages) {
      let page: any = Object.values(pages)[0];
      if (page && page.thumbnail && page.thumbnail.source) {
        images.push(page.thumbnail.source);
      }
    }

    // 2. Wikimedia Commons
    let commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&format=json`;
    res = await axios.get(commonsUrl, { timeout: 3000, headers });
    pages = res.data?.query?.pages;
    if (pages) {
      Object.values(pages).forEach((p: any) => {
        if (p.imageinfo?.[0]?.url) images.push(p.imageinfo[0].url);
      });
    }

    // 3. Wikipedia Search fallback
    if (images.length === 0) {
      let searchUrl = `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=1`;
      res = await axios.get(searchUrl, { timeout: 3000, headers });
      let search = res.data?.query?.search;
      if (search && search.length > 0) {
        let title = search[0].title;
        let url2 = `https://it.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&format=json&pithumbsize=1200`;
        let res2 = await axios.get(url2, { timeout: 3000, headers });
        let pages2 = res2.data?.query?.pages;
        if (pages2) {
          let page2: any = Object.values(pages2)[0];
          if (page2 && page2.thumbnail && page2.thumbnail.source) {
            images.push(page2.thumbnail.source);
          }
        }
      }
    }

    return images.filter(Boolean);
  } catch (e) {
    return [];
  }
}

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

  for (const poi of pois) {
    const searchQuery = `${poi.name} ${poi.city || ''}`.trim();
    console.log(`-> Arricchimento di: ${searchQuery} [Cat: ${poi.category}]`);

    const [wikiRaw, wvRaw, wikiImages, fsqImages, unsplashImages] = await Promise.all([
      fetchWikipedia(searchQuery),
      fetchWikivoyage(searchQuery),
      fetchWikimediaImages(searchQuery),
      fetchFoursquareImages(poi.lat, poi.lon, poi.name),
      fetchUnsplashImages(searchQuery)
    ]);

    let images = wikiImages.length > 0 ? wikiImages : fsqImages;
    if (images.length === 0 && unsplashImages.length > 0) {
      images = unsplashImages;
    }
    // Fallback: se ancora non ci sono foto, usiamo Unsplash con solo Città o Categoria
    if (images.length === 0) {
      console.log(`      [IMG] Fallback estremo per foto (ricerca generica per zona)...`);
      const fallbackQuery = `${poi.city || region.name} ${poi.category}`;
      images = await fetchUnsplashImages(fallbackQuery);
    }
    
    const photoUrl = images.length > 0 ? images[0] : null;
    const imagesJson = images.length > 0 ? images : null;

    // REGOLA ASSOLUTA: arricchisci SEMPRE tutti i POI, nessuno SKIP
    const systemPrompt = `Sei un esperto di storia, cultura e turismo. Il tuo compito è generare contenuti turistici ESTREMAMENTE DETTAGLIATI per un'app di viaggio.
Devi restituire ESCLUSIVAMENTE un oggetto JSON valido. NON aggiungere markdown (\`\`\`json).

REGOLA ASSOLUTA 1: Usa dettagli REALI, unici e specifici (date, stili architettonici, personaggi storici). VIETATO usare frasi generiche e banali come "un viaggio nel tempo", "un mix di storia e bellezza", "un luogo magico", "simbolo della città". Se un dettaglio è nel testo di Wikipedia, USALO.
REGOLA ASSOLUTA 2: Se NON hai dati reali (wiki vuoto), INVENTA dettagli storici o architettonici VEROSIMILI e SPECIFICI per la zona e la categoria, ma rendili credibili e concreti, non vaghi.

JSON da restituire:
{
  "status": "OK",
  "descrizione_breve_it": "Max 25 parole (italiano). Includi un dettaglio unico reale (es. anno di costruzione o stile), vietate frasi generiche.",
  "descrizione_breve_en": "Max 25 words (English). Include a specific unique detail.",
  "descrizione_dettagliata_it": "Testo storico-turistico denso di informazioni, 1000-1500 caratteri (italiano). Nomi, date, curiosità storiche. Niente frasi fatte.",
  "descrizione_dettagliata_en": "Historical-tourist text, dense with facts, 1000-1500 chars (English).",
  "ulteriori_informazioni_it": "Info pratiche precise: stile, secolo, nome di un artista/architetto coinvolto.",
  "teaser_it": "Un teaser invitante e con dettagli specifici di circa 5/6 secondi di lettura (circa 25-30 parole in italiano). Deve essere perfetto per essere letto ad alta voce da una voce guida. Includi un fatto specifico o un mistero del luogo.",
  "teaser_en": "An inviting teaser with specific details, taking about 5/6 seconds to read (around 25-30 words in English), perfect for a voice guide. Include a specific fact.",
  "testo_nicky_it": "120-150 parole. Stile informale e vivace, ma DEVE raccontare aneddoti specifici, dettagli visivi concreti (colori, materiali) e curiosità reali. Vietato il filler. (Inizia con ✨)",
  "testo_nicky_en": "Nicky style in English, 120-150 words with concrete details (start with ✨).",
  "testo_dante_it": "120-150 parole. Stile formale, storico, colto. Ricco di nomi, secoli, eventi storici tangibili. Niente retorica vuota. (Inizia con 📜)",
  "testo_dante_en": "Dante style in English, 120-150 words full of tangible historical facts (start with 📜)."
}

LUOGO DA ARRICCHIRE: "${searchQuery}" — Categoria: "${poi.category}"
ZONA DEL LUOGO: "${region.name}" (Città: "${poi.city || 'N/A'}")
ATTENZIONE: Se il testo Wikipedia sotto parla di un luogo famoso in un'altra regione italiana lontana da ${region.name}, è un errore! IGNORALO e scrivi un testo specifico e ricco di dettagli plausibili per un "${poi.category}" situato a ${region.name}.

Wikipedia: ${wikiRaw || 'Nessun dato — inventa dettagli storici verosimili e concreti basandoti sulla zona e categoria.'}
Wikivoyage: ${wvRaw || 'Nessun dato.'}`;


    try {
      const activeClient = aiClients[currentClientIndex];
      currentClientIndex = (currentClientIndex + 1) % aiClients.length;

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

      // Rimosso il blocco skip: forziamo sempre lo status su OK
      parsed.status = "OK";

      const sourceAI = wikiRaw ? 'agnes_free_wiki_json' : 'agnes_free_internal_json';

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
         console.warn(`🚨 Errore temporaneo AI (Rate limit o Timeout)! Riposo di 10 secondi e riproverò al prossimo giro...`);
         await sleep(10000);
         continue; 
      }
      
      // Se è un errore grave non recuperabile (es. 400), lo scartiamo per non bloccare il loop all'infinito
      await supabase.from('shared_pois').update({
        enriched_at: new Date().toISOString(),
        enrichment_source: 'ai_error'
      }).eq('id', poi.id);
    }
    
    console.log(`⏳ Attesa ridotta a 4 secondi per sfruttare la doppia chiave Agnes...`);
    await sleep(4000);
  }

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
