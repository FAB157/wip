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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
}

let currentClientIndex = 0;
const BATCH_SIZE = 15;
const DELAY_BETWEEN_BATCHES = 1000; 
const MODEL_NAME = "agnes-2.5-flash";

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function processUpdateBatch() {
  // Prendiamo i vecchi POI arricchiti con il prompt "corto" prima delle 09:22 del 31 luglio.
  const { data: pois, error } = await supabase
    .from('shared_pois')
    .select('id, name, city, region, category, is_gem, lat, lon')
    .not('enriched_at', 'is', null)
    .lt('enriched_at', '2026-07-31T09:22:00Z')
    .limit(BATCH_SIZE);

  if (error) {
    console.error(`Errore fetch POI vecchi:`, error.message);
    return false;
  }

  if (!pois || pois.length === 0) return false;

  console.log(`\n📍 Trovati ${pois.length} Luoghi da aggiornare. Inizio batch...`);

  await Promise.all(pois.map(async (poi) => {
    const searchQuery = `${poi.name} ${poi.city || ''}`.trim();
    console.log(`-> AGGIORNAMENTO TESTI di: ${searchQuery} [Cat: ${poi.category}]`);

    const [wikiRaw, wvRaw] = await Promise.all([
      fetchWikipedia(searchQuery),
      fetchWikivoyage(searchQuery)
    ]);

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
  "teaser_it": "Frase accattivante di 10-12 parole (italiano) che contiene un FATTO specifico o un mistero reale del luogo.",
  "teaser_en": "Catchy 10-12 word teaser (English) containing a specific fact.",
  "testo_nicky_it": "120-150 parole. Stile informale e vivace, ma DEVE raccontare aneddoti specifici, dettagli visivi concreti (colori, materiali) e curiosità reali. Vietato il filler. (Inizia con ✨)",
  "testo_nicky_en": "Nicky style in English, 120-150 words with concrete details (start with ✨).",
  "testo_dante_it": "120-150 parole. Stile formale, storico, colto. Ricco di nomi, secoli, eventi storici tangibili. Niente retorica vuota. (Inizia con 📜)",
  "testo_dante_en": "Dante style in English, 120-150 words full of tangible historical facts (start with 📜)."
}

LUOGO DA ARRICCHIRE: "${searchQuery}" — Categoria: "${poi.category}"
ZONA DEL LUOGO: "${poi.region}" (Città: "${poi.city || 'N/A'}")
ATTENZIONE: Se il testo Wikipedia sotto parla di un luogo famoso in un'altra regione italiana lontana da ${poi.region}, è un errore! IGNORALO e scrivi un testo specifico e ricco di dettagli plausibili per un "${poi.category}" situato a ${poi.region}.

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
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      }

      parsed.status = "OK";
      const sourceAI = wikiRaw ? 'agnes_free_wiki_json_updated' : 'agnes_free_internal_json_updated';

      const updatePayload = {
        description_short: parsed.descrizione_breve_it,
        description_long: parsed.descrizione_dettagliata_it,
        teaser_text_it: parsed.teaser_it,
        teaser_text_en: parsed.teaser_en,
        practical_info: parsed.ulteriori_informazioni_it,
        description_ai: JSON.stringify(parsed),
        // IMPORTANTE: NON tocchiamo le foto, le manteniamo intatte!
        enriched_at: new Date().toISOString(), // aggiorniamo la data per toglierlo dal batch!
        enrichment_source: sourceAI
      };

      await supabase.from('shared_pois').update(updatePayload).eq('id', poi.id);
      
      console.log(`   ✅ Successo: Testi aggiornati per ${poi.name}!`);
      
    } catch (llmErr: any) {
      console.error(`   ❌ Errore AI su ${poi.name}:`, llmErr.message || llmErr);
      const isRateLimit = llmErr.status === 429;
      if (isRateLimit) {
         console.warn(`🚨 Rate limit Agnes AI! Riposo di 30 secondi...`);
         await sleep(30000);
         return; 
      }
    }
  }));

  return true;
}

async function startLoop() {
  console.log(`Inizio script di AGGIORNAMENTO TESTI VECCHI con Agnes AI (${MODEL_NAME})...`);
  
  let hasMore = true;
  while (hasMore) {
    hasMore = await processUpdateBatch();
    if (hasMore) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }
  
  console.log("🎉 AGGIORNAMENTO DEI 42.000 VECCHI POI COMPLETATO.");
  process.exit(0);
}

startLoop();
