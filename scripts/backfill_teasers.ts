import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

// Polyfill per il warning di Supabase su Node
(global as any).WebSocket = ws;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: { fetch: fetch.bind(globalThis) }
});

const openRouterKey = process.env.OPENROUTER_API_KEY;
if (!openRouterKey) {
  console.error("Nessuna OPENROUTER_API_KEY trovata nel file .env!");
  process.exit(1);
}

const openRouterClient = new OpenAI({ 
  baseURL: "https://openrouter.ai/api/v1", 
  apiKey: openRouterKey 
});

const FREE_MODELS = [
  "google/gemini-2.5-flash:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free"
];

const BATCH_SIZE = 30; 

async function runBackfill() {
  console.log("🚀 Inizio Backfill Chirurgico dei Teaser con OpenRouter (GRATIS)...");
  let totalProcessed = 0;

  while (true) {
    // Cerchiamo i POI già arricchiti ma che non hanno il teaser
    const { data: pois, error } = await supabase
      .from('shared_pois')
      .select('id, name, city, category, description_short')
      .not('enriched_at', 'is', null)
      .is('teaser_text_it', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Errore fetch POI:", error.message);
      break;
    }

    if (!pois || pois.length === 0) {
      console.log("🎉 NESSUN POI RIMASTO DA AGGIORNARE! Backfill completato.");
      break;
    }

    console.log(`\n📍 Trovati ${pois.length} Luoghi senza teaser. Inizio elaborazione...`);

    for (const poi of pois) {
      const systemPrompt = `Sei un esperto copywriter turistico. Il tuo compito è generare un "teaser" (frase di lancio) per un luogo turistico.
Devi restituire ESCLUSIVAMENTE un oggetto JSON valido. NON aggiungere markdown (\`\`\`json).

JSON da restituire:
{
  "teaser_it": "Un teaser invitante e con dettagli specifici di circa 5/6 secondi di lettura (circa 25-30 parole in italiano). Deve essere perfetto per essere letto ad alta voce da una voce guida. Includi un fatto specifico o un mistero del luogo.",
  "teaser_en": "An inviting teaser with specific details, taking about 5/6 seconds to read (around 25-30 words in English), perfect for a voice guide. Include a specific fact."
}

LUOGO: "${poi.name}" (${poi.city || 'Italia'}) — Categoria: "${poi.category}"
CONTESTO GIA' NOTO (usalo per estrarre il fatto specifico): "${poi.description_short || 'Luogo di interesse storico e culturale.'}"`;

      let success = false;

      // CICLO DI FALLBACK ROBUSTO
      for (const modelName of FREE_MODELS) {
        try {
          const response = await openRouterClient.chat.completions.create({
            model: modelName,
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

          if (parsed.teaser_it) {
            const updatePayload = {
              teaser_text_it: parsed.teaser_it,
              teaser_text_en: parsed.teaser_en
            };
            await supabase.from('shared_pois').update(updatePayload).eq('id', poi.id);
            console.log(`   ✅ Teaser salvato per: ${poi.name} (Modello: ${modelName})`);
            success = true;
            break; // Ha funzionato! Usciamo dal ciclo di fallback
          } else {
            console.log(`   ⚠️ JSON sformattato da ${modelName} per: ${poi.name}. Passo al modello di riserva...`);
          }
        } catch (err: any) {
          console.log(`   ❌ Errore 429 API da ${modelName} su ${poi.name}. Passo al modello di riserva...`);
        }
      }

      if (!success) {
        console.log(`   🚫 Tutti i modelli hanno fallito su ${poi.name}. Verrà ripescato in futuro.`);
      }

      // Pausa per evitare flood su Supabase e OpenRouter
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    totalProcessed += pois.length;
    console.log(`[Statistiche] Totale POI aggiornati col teaser finora: ${totalProcessed}`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runBackfill();
