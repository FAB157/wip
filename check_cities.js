import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Variabili Supabase non trovate in .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCities() {
  try {
    // Dipende da come sono memorizzati i paesi.
    // Supponiamo che ci sia una tabella 'cities', 'comuni', 'locations', o 'poi' con una colonna 'city'.
    // Proviamo a cercare le tabelle esistenti prima o facciamo una query generica se sappiamo il nome della tabella.
    // In itainta, solitamente si usa 'cities' o si guardano i 'shared_pois'.
    
    // Tentativo 1: Contare le righe nella tabella 'cities'
    const { count, error } = await supabase
      .from('cities')
      .select('*', { count: 'exact', head: true });
      
    if (error) {
      if (error.code === '42P01') {
        console.log("Tabella 'cities' non trovata. Controllo i POI unici per città in 'shared_pois'...");
        
        // Tentativo 2: Controllare shared_pois
        const { data: pois, error: poiError } = await supabase
          .from('shared_pois')
          .select('city');
          
        if (poiError) {
           console.error("Errore lettura shared_pois:", poiError);
        } else {
           const uniqueCities = new Set(pois.map(p => p.city).filter(Boolean));
           console.log(`Numero di paesi/città uniche trovate nei POI (shared_pois): ${uniqueCities.size}`);
           console.log("Città:", Array.from(uniqueCities).join(", "));
        }
      } else {
        console.error("Errore query su 'cities':", error);
      }
    } else {
      console.log(`Numero di paesi nella tabella 'cities': ${count}`);
    }
    
  } catch (err) {
    console.error("Eccezione:", err);
  }
}

checkCities();
