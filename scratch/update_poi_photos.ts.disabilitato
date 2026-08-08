import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import ws from 'ws';

// Polyfill per Supabase
(global as any).WebSocket = ws;

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Mancano le credenziali Supabase nel file .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  global: { fetch: fetch.bind(globalThis) }
});

const BATCH_SIZE = 50;
const SLEEP_BETWEEN_REQUESTS_MS = 500; // Mezzo secondo tra le chiamate a Wiki per non farsi bannare
const USER_AGENT = "ItaintaBot/1.0 (contact@itainta.com)";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Evita di cercare cose troppo generiche
const blacklistWords = ['ristorante', 'hotel', 'bar', 'pizzeria', 'trattoria', 'agriturismo'];

async function searchWikipediaImage(poiName: string): Promise<string | null> {
  const lowerName = poiName.toLowerCase();
  if (blacklistWords.some(w => lowerName.includes(w))) {
    return null; // Saltiamo ristoranti e hotel, wiki non ha le loro foto
  }

  try {
    const searchUrl = `https://it.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(poiName)}&prop=pageimages&pithumbsize=1000&format=json`;
    const res = await axios.get(searchUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (res.data?.query?.pages) {
      const pages = Object.values(res.data.query.pages) as any[];
      pages.sort((a, b) => (a.index || 0) - (b.index || 0));
      
      const bestMatch = pages.find(p => p.thumbnail?.source);
      if (bestMatch) {
        return bestMatch.thumbnail.source;
      }
    }
    return null;
  } catch(e: any) {
    console.log(`   ⚠️ Errore API Wiki per ${poiName}: ${e.message}`);
    return null;
  }
}

async function run() {
  console.log("📸 Avvio script sostituzione foto Wikipedia...");

  let lastId = '0';
  let processedCount = 0;
  let updatedCount = 0;

  while (true) {
    // Peschiamo i POI ordinati per ID (per poter riprendere da dove ci eravamo fermati)
    const { data: pois, error } = await supabase
      .from('shared_pois')
      .select('id, name, photo_url')
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Errore fetch database:", error.message);
      break;
    }

    if (!pois || pois.length === 0) {
      console.log(`\n🎉 Finito! Tutti i POI analizzati. Modificati: ${updatedCount}`);
      break;
    }

    console.log(`\n⏳ Analizzo batch da ${pois.length} POI (a partire da ${pois[0].name})...`);

    for (const poi of pois) {
      lastId = poi.id;
      processedCount++;

      const newPhoto = await searchWikipediaImage(poi.name);
      
      if (newPhoto) {
        // Ignora se la foto è identica (già aggiornata in precedenza)
        if (poi.photo_url !== newPhoto) {
          const { error: updErr } = await supabase
            .from('shared_pois')
            .update({ photo_url: newPhoto })
            .eq('id', poi.id);
            
          if (updErr) {
            console.error(`   ❌ Errore update POI ${poi.id}:`, updErr.message);
          } else {
            console.log(`   📸 [${poi.name}] Foto Wiki trovata e sostituita!`);
            updatedCount++;
          }
        }
      }

      // Attesa per rispettare i limiti di Wikipedia
      await sleep(SLEEP_BETWEEN_REQUESTS_MS);
    }
  }
}

run();
