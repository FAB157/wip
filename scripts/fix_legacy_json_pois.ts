import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Mancano le credenziali Supabase nel file .env");
  process.exit(1);
}

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
}
let currentClientIndex = 0;

const BATCH_SIZE = 100;
const MODEL_NAME = "agnes-2.5-flash";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cleanJsonString(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : raw;
}

const systemPrompt = `Sei un esperto di storia, cultura e turismo. 
Riceverai un testo descrittivo o un frammento di JSON incompleto su un POI.
Devi estrarre i dati utili e completare tutti i campi mancanti, restituendo ESCLUSIVAMENTE un oggetto JSON valido. NON aggiungere markdown (\`\`\`json).

Il JSON da restituire deve essere:
{
  "descrizione_breve_it": "Max 25 parole",
  "descrizione_breve_en": "Max 25 words",
  "descrizione_dettagliata_it": "Testo storico-turistico denso di informazioni, 1000-1500 caratteri",
  "descrizione_dettagliata_en": "Historical-tourist text",
  "ulteriori_informazioni_it": "Info pratiche",
  "teaser_it": "Un teaser invitante di circa 25-30 parole",
  "teaser_en": "An inviting teaser",
  "testo_nicky_it": "120-150 parole. Stile informale. Inizia con ✨",
  "testo_nicky_en": "English nicky style. Inizia con ✨",
  "testo_dante_it": "120-150 parole. Stile formale/storico. Inizia con 📜",
  "testo_dante_en": "English dante style. Inizia con 📜"
}
Ricicla e migliora i testi forniti nell'input se sono buoni, inventa (in modo realistico) se mancano.`;

async function fixPoi(poi: any) {
  console.log(`\n🛠️  Processing POI: ${poi.name} (ID: ${poi.id})`);
  
  const rawDesc = poi.description_ai;
  const jsonStr = cleanJsonString(rawDesc);
  let parsed: any = null;
  let needsAiComplete = false;

  try {
    parsed = JSON.parse(jsonStr);
    // Controllo se ha le audioguide (il vecchio mass-enrich a volte non le generava)
    if (!parsed.testo_nicky_it || !parsed.testo_dante_it || !parsed.teaser_it) {
      needsAiComplete = true;
    }
  } catch (e) {
    console.log(`   ⚠️ JSON corrotto/incompleto, richiedo completamento AI...`);
    needsAiComplete = true;
  }

  if (needsAiComplete) {
    const activeClient = aiClients[currentClientIndex];
    currentClientIndex = (currentClientIndex + 1) % aiClients.length;

    try {
      const response = await activeClient.chat.completions.create({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Dati di input del POI "${poi.name}":\n\n${jsonStr}` }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const aiText = response.choices[0].message.content || "{}";
      parsed = JSON.parse(aiText);
      console.log(`   ✅ Dati completati dall'AI con successo.`);
    } catch (e: any) {
      console.error(`   ❌ Errore AI per ${poi.name}:`, e.message);
      return false;
    }
  }

  // A questo punto abbiamo 'parsed' garantito (sia dal parse diretto che dall'AI)
  const updatePayload = {
    description_short: parsed.descrizione_breve_it || parsed.descrizione_breve,
    description_long: parsed.descrizione_dettagliata_it || parsed.descrizione_dettagliated_it || parsed.descrizione_dettagliata,
    teaser_text_it: parsed.teaser_it || parsed.teaser_text_it,
    teaser_text_en: parsed.teaser_en || parsed.teaser_text_en,
    practical_info: parsed.ulteriori_informazioni_it,
    description_ai: parsed.descrizione_dettagliata_it || parsed.descrizione_dettagliated_it || parsed.descrizione_dettagliata // testo pulito!
  };

  // Aggiorniamo shared_pois
  const { error: updErr } = await supabase.from('shared_pois').update(updatePayload).eq('id', poi.id);
  if (updErr) {
    console.error(`   ❌ Errore update POI ${poi.id}:`, updErr.message);
    return false;
  }

  // Inseriamo/aggiorniamo le audioguide
  const audioguides = [];
  const nowIso = new Date().toISOString();
  if (parsed.testo_nicky_it) audioguides.push({ poi_id: poi.id, language: 'IT', guide_character: 'nicky', audio_text: parsed.testo_nicky_it, generated_at: nowIso });
  if (parsed.testo_nicky_en) audioguides.push({ poi_id: poi.id, language: 'EN', guide_character: 'nicky', audio_text: parsed.testo_nicky_en, generated_at: nowIso });
  if (parsed.testo_dante_it) audioguides.push({ poi_id: poi.id, language: 'IT', guide_character: 'dante', audio_text: parsed.testo_dante_it, generated_at: nowIso });
  if (parsed.testo_dante_en) audioguides.push({ poi_id: poi.id, language: 'EN', guide_character: 'dante', audio_text: parsed.testo_dante_en, generated_at: nowIso });

  if (audioguides.length > 0) {
    const { error: audioErr } = await supabase.from('poi_audioguides').upsert(audioguides, { onConflict: 'poi_id,language,guide_character' });
    if (audioErr) {
      console.error(`   ❌ Errore salvataggio audioguide per ${poi.name}:`, audioErr.message);
      return false;
    }
  }

  console.log(`   ✅ Successo: POI ripulito e audioguide salvate.`);
  return true;
}

async function runBackfill() {
  console.log("🚀 Avvio script migrazione Legacy JSON POIs...");

  let processedTotal = 0;
  
  while (true) {
    // Cerchiamo i POI con JSON ancora visibile nel description_ai
    const { data: pois, error } = await supabase
      .from('shared_pois')
      .select('id, name, description_ai')
      .not('description_ai', 'is', null)
      .like('description_ai', '%{"status":"OK"%')
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Errore fetch POIs:", error.message);
      break;
    }

    if (!pois || pois.length === 0) {
      console.log("🎉 Nessun altro POI legacy trovato. Migrazione completata!");
      break;
    }

    console.log(`\n⏳ Trovati ${pois.length} POI da sistemare. Elaborazione in corso...`);
    
    // Elaborazione sequenziale veloce
    for (const poi of pois) {
      const ok = await fixPoi(poi);
      if (ok) processedTotal++;
      await sleep(100); // Piccolo delay di cortesia
    }

    console.log(`\n✅ Batch completato. Totale processati finora: ${processedTotal}`);
    await sleep(2000);
  }
}

runBackfill();
