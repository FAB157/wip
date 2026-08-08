import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import axios from 'axios';
import ws from 'ws';

(global as any).WebSocket = ws;
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: { fetch: fetch.bind(globalThis) }
});

const openAIApiKeys = [
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
].filter(Boolean) as string[];

const aiClients = openAIApiKeys.map(key => new OpenAI({ apiKey: key }));
let currentClientIndex = 0;

const BATCH_SIZE = 30;
const MODEL_NAME = "agnes-2.5-flash";

const CULTURAL_CATEGORIES = [
  'monumenti', 'monument', 'musei', 'museum', 'museo',
  'castle', 'castelli', 'archaeological_site', 'siti_archeologici',
  'memorial', 'artwork', 'statua', 'statue', 'scultura', 'sculture',
  'panorami', 'panorama', 'viewpoint', 'cave_entrance', 'grotte',
  'nature_reserve', 'chiese', 'church', 'gemme'
];

async function fetchWikidata(name: string): Promise<string> {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=it&format=json`;
    const searchRes = await axios.get(searchUrl, { headers: { 'User-Agent': 'ItaintaBot/1.0' }, timeout: 3000 });
    
    if (searchRes.data?.search?.length > 0) {
      const entityId = searchRes.data.search[0].id;
      const entityDesc = searchRes.data.search[0].description || '';
      const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&languages=it&props=claims&format=json`;
      const entityRes = await axios.get(entityUrl, { headers: { 'User-Agent': 'ItaintaBot/1.0' }, timeout: 3000 });
      const claims = entityRes.data.entities[entityId]?.claims || {};
      
      const importantProps: any = {
        'P571': 'Data di creazione', 'P84': 'Architetto/Creatore',
        'P149': 'Stile', 'P186': 'Materiale', 'P31': 'Tipo'
      };
      
      let facts: string[] = [];
      if (entityDesc) facts.push(`Sommario: ${entityDesc}`);
      
      let idsToResolve: string[] = [];
      for (const prop of Object.keys(importantProps)) {
        if (claims[prop]) {
          const valueObj = claims[prop][0].mainsnak.datavalue;
          if (valueObj?.type === 'wikibase-entityid') {
             idsToResolve.push(valueObj.value.id);
          } else if (valueObj?.type === 'time') {
             let timeStr = valueObj.value.time;
             timeStr = timeStr.replace(/^\+/, '').split('T')[0];
             facts.push(`${importantProps[prop]}: ${timeStr}`);
          }
        }
      }
      
      if (idsToResolve.length > 0) {
         const idsChunk = idsToResolve.slice(0, 50).join('|');
         const valUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${idsChunk}&languages=it&props=labels&format=json`;
         const valRes = await axios.get(valUrl, { headers: { 'User-Agent': 'ItaintaBot/1.0' }, timeout: 3000 });
         
         for (const [prop, label] of Object.entries(importantProps)) {
           if (claims[prop]) {
             const valueObj = claims[prop as string][0].mainsnak.datavalue;
             if (valueObj?.type === 'wikibase-entityid') {
               const valLabel = valRes.data.entities[valueObj.value.id]?.labels?.it?.value;
               if (valLabel) facts.push(`${label}: ${valLabel}`);
             }
           }
         }
      }
      return facts.join(', ');
    }
  } catch(e: any) {}
  return "";
}

async function fetchWikipedia(title: string): Promise<string> {
  const headers = { 'User-Agent': 'ItaintaApp/1.0' };
  try {
    const res = await axios.get(`https://it.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=1&prop=extracts&exintro=false&explaintext=1&format=json`, { timeout: 3000, headers });
    const pages = res.data?.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      if (pageId && pageId !== "-1" && pages[pageId].extract) return pages[pageId].extract.substring(0, 1500);
    }
  } catch (e) {}
  return "";
}

async function processRetroEnrichment() {
  console.log("🚀 Avvio Retro-Enrichment Wikidata...");
  
  let lastId = '0';
  let processed = 0;
  let updated = 0;

  while(true) {
    const { data: pois, error } = await supabase
      .from('shared_pois')
      .select('id, name, city, category, description_ai')
      .not('enriched_at', 'is', null) // Prendi quelli GIA' arricchiti in passato
      .in('category', CULTURAL_CATEGORIES)
      // Evita di riprocessare all'infinito quelli appena rifatti da questo script
      // (possiamo usare il campo `description_ai` per capire se è stato appena aggiornato con wikidata
      // ma per sicurezza scorriamo semplicemente avanti)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);
      
    if (error || !pois || pois.length === 0) {
      console.log("Fine dei POI o errore:", error?.message);
      break;
    }

    console.log(`\n⏳ Analizzo batch da ${pois.length} POI (partendo da ${pois[0].name})...`);

    for (const poi of pois) {
      lastId = poi.id;
      processed++;
      
      // Controllo se il JSON attuale contiene già tracce o dati generati da Wikidata
      // Se vuoi evitare loop futuri, potremmo aggiungere una flag nel JSON, ma per ora tiriamo dritto.

      const searchQuery = `${poi.name} ${poi.city || ''}`.trim();
      
      const wikiData = await fetchWikidata(searchQuery);
      
      if (!wikiData) {
        // Niente Wikidata, passiamo oltre per risparmiare query AI
        continue;
      }
      
      console.log(`-> 💡 TROVATO WIKIDATA per [${poi.name}]: ${wikiData}`);
      
      // Tiriamo giù anche Wikipedia per passarlo ad Agnes
      const wikiRaw = await fetchWikipedia(searchQuery);

      const systemPrompt = `Sei un esperto di storia, cultura e turismo. Devi SOVRASCRIVERE e MIGLIORARE i contenuti turistici di questo luogo, sfruttando al massimo i nuovi "Dati Strutturati Ufficiali" (Wikidata) appena estratti.
Devi restituire ESCLUSIVAMENTE un oggetto JSON valido.

JSON da restituire:
{
  "status": "OK",
  "descrizione_breve_it": "Max 25 parole (italiano). Includi un dettaglio unico reale.",
  "descrizione_breve_en": "Max 25 words (English). Include a specific unique detail.",
  "descrizione_dettagliata_it": "Testo storico-turistico denso di informazioni, 1000-1500 caratteri (italiano). Nomi, date, curiosità storiche. Niente frasi fatte.",
  "descrizione_dettagliata_en": "Historical-tourist text, dense with facts, 1000-1500 chars (English).",
  "ulteriori_informazioni_it": "Info pratiche precise (usa quelle in Wikidata!).",
  "teaser_it": "Un teaser invitante di circa 5/6 secondi di lettura (italiano).",
  "teaser_en": "An inviting teaser of about 5/6 seconds of reading (English).",
  "testo_nicky_it": "120-150 parole. Stile informale e vivace, usa dettagli visivi. (Inizia con ✨)",
  "testo_nicky_en": "Nicky style in English, 120-150 words. (start with ✨)",
  "testo_dante_it": "120-150 parole. Stile formale, enciclopedico. Sfrutta a pieno i dati esatti (date, architetti, materiali) di Wikidata. (Inizia con 📜)",
  "testo_dante_en": "Dante style in English, 120-150 words full of tangible historical facts. (start with 📜)"
}

LUOGO: "${searchQuery}" — Categoria: "${poi.category}"

Wikidata (Dati Strutturati ESATTI): ${wikiData}
Wikipedia: ${wikiRaw || 'Nessun testo discorsivo.'}`;

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
        
        if (parsed.status === "OK") {
          // Ricostruiamo l'oggetto JSON completo che usa l'app (aggiungendo la flag 'wikidata_retro_enriched')
          parsed.wikidata_retro_enriched = true;
          
          await supabase
            .from('shared_pois')
            .update({
              description_ai: JSON.stringify(parsed),
              updated_at: new Date().toISOString()
            })
            .eq('id', poi.id);

          // Salva/aggiorna le audioguide per Nicky e Dante
          const audioRecords = [
            { poi_id: poi.id, profile: 'nicky', language: 'it', text_content: parsed.testo_nicky_it },
            { poi_id: poi.id, profile: 'nicky', language: 'en', text_content: parsed.testo_nicky_en },
            { poi_id: poi.id, profile: 'dante', language: 'it', text_content: parsed.testo_dante_it },
            { poi_id: poi.id, profile: 'dante', language: 'en', text_content: parsed.testo_dante_en }
          ];

          for (const record of audioRecords) {
            await supabase
              .from('poi_audioguides')
              .upsert(record, { onConflict: 'poi_id, profile, language' });
          }

          console.log(`      ✅ Upgrade completato per: ${poi.name}`);
          updated++;
        }
      } catch (e: any) {
         console.error("Errore AI/DB:", e.message);
      }
    }
  }
  
  console.log(`\n🎉 Retro-enrichment terminato! Processati: ${processed}, Aggiornati: ${updated}`);
}

processRetroEnrichment();
