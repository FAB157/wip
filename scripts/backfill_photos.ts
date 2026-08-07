import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Mancano credenziali!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getWikimediaImage(name: string): Promise<string | null> {
  try {
    const headers = { 'User-Agent': 'ItaintaApp/1.0 (contact@itainta.com)' };
    // 1. Prova Wikipedia IT page image
    let url = `https://it.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(name)}&format=json&pithumbsize=1200`;
    let res = await axios.get(url, { timeout: 5000, headers });
    let pages = res.data?.query?.pages;
    if (pages) {
      let page: any = Object.values(pages)[0];
      if (page && page.thumbnail && page.thumbnail.source) {
        return page.thumbnail.source;
      }
    }

    // 2. Se non trova l'immagine diretta, prova a cercare su Wikimedia Commons
    let commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&format=json`;
    res = await axios.get(commonsUrl, { timeout: 5000, headers });
    pages = res.data?.query?.pages;
    if (pages) {
      let page: any = Object.values(pages)[0];
      if (page && page.imageinfo && page.imageinfo.length > 0) {
        return page.imageinfo[0].url;
      }
    }

    // 3. Wikipedia Search come fallback
    let searchUrl = `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&utf8=&format=json&srlimit=1`;
    res = await axios.get(searchUrl, { timeout: 5000, headers });
    let search = res.data?.query?.search;
    if (search && search.length > 0) {
      let title = search[0].title;
      let url2 = `https://it.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&format=json&pithumbsize=1200`;
      let res2 = await axios.get(url2, { timeout: 5000, headers });
      let pages2 = res2.data?.query?.pages;
      if (pages2) {
        let page2: any = Object.values(pages2)[0];
        if (page2 && page2.thumbnail && page2.thumbnail.source) {
          return page2.thumbnail.source;
        }
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

async function getUnsplashImage(name: string): Promise<string | null> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null;
  try {
    const res = await axios.get(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(name)}&client_id=${process.env.UNSPLASH_ACCESS_KEY}&per_page=1`, { timeout: 3000 });
    if (res.data && res.data.results && res.data.results.length > 0) {
      return res.data.results[0].urls.regular;
    }
  } catch (e) {}
  return null;
}

async function run() {
  console.log("Inizio backfill FOTO tramite Wikimedia/Wikipedia...");
  
  let totalUpdated = 0;
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: pois, error } = await supabase
      .from('shared_pois')
      .select('id, name, lat, lon')
      .not('enriched_at', 'is', null)
      .is('photo_url', null)
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Errore fetch:", error);
      break;
    }

    if (!pois || pois.length === 0) {
      console.log("Nessun altro POI senza foto trovato. Completato!");
      break;
    }

    console.log(`Trovato batch di ${pois.length} POI (offset ${offset}). Inizio ricerca su Wikimedia/Unsplash...`);

    let updated = 0;
    for (const poi of pois) {
      try {
        let photoUrl = await getWikimediaImage(poi.name);
        
        if (!photoUrl) {
          photoUrl = await getUnsplashImage(poi.name);
        }
        
        if (photoUrl) {
           await supabase.from('shared_pois').update({
             photo_url: photoUrl,
             image_url: photoUrl
           }).eq('id', poi.id);
           console.log(`✅ FOTO TROVATA per: ${poi.name}`);
           updated++;
        } else {
           console.log(`❌ Nessuna foto su Wikimedia/Unsplash per: ${poi.name}`);
        }
      } catch (e: any) {

        console.log(`⚠️ Errore su ${poi.name}: ${e.message}`);
      }
      await sleep(300); // rate limit
    }
    
    totalUpdated += updated;
    console.log(`Batch finito. Foto aggiunte a ${updated} POI.`);
    offset += limit;
  }
  
  console.log(`\n🎉 Finito totale! Foto aggiunte a ${totalUpdated} POI in totale.`);
}

run();
