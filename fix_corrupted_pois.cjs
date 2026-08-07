const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Carica variabili d'ambiente
let envConfig = {};
if (fs.existsSync('.env.local')) {
  envConfig = Object.assign(envConfig, dotenv.parse(fs.readFileSync('.env.local')));
}
if (fs.existsSync('.env')) {
  envConfig = Object.assign(envConfig, dotenv.parse(fs.readFileSync('.env')));
}

const SUPABASE_URL = envConfig.VITE_SUPABASE_URL || "https://qfxxhzkkrkvbuekfknhh.supabase.co";
const SUPABASE_KEY = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixCorruptedPois() {
    console.log("Fixing corrupted POIs...");
    
    // 1. Trova tutti i POI che hanno la parola "Avenza" nella descrizione ma il cui NOME non c'entra niente
    // e azzera le loro foto e descrizioni in modo che l'app le rigeneri da zero.
    const { data: corrupted, error } = await supabase.from('shared_pois')
        .select('id, name, description_ai, description_long')
        .or('description_ai.ilike.%avenza%,description_long.ilike.%avenza%,description_short.ilike.%avenza%')
        .not('name', 'ilike', '%Avenza%')
        .not('name', 'ilike', '%stazione%');
        
    if (error) {
        console.error("Errore DB:", error);
    }

    if (corrupted && corrupted.length > 0) {
        console.log(`Trovati ${corrupted.length} POI corrotti da resettare.`);
        for (const p of corrupted) {
            console.log(`Resetto: ${p.name}`);
            await supabase.from('shared_pois')
                .update({ 
                    photo_url: null, 
                    image_url: null, 
                    description_ai: null,
                    description_long: null,
                    description_short: null 
                })
                .eq('id', p.id);
            
            // Eliminiamolo anche dalla cache audio!
            await supabase.from('shared_poi_audio_cache')
                .delete()
                .ilike('poi_id', `${p.id}%`);
        }
    } else {
        console.log("Nessun POI corrotto trovato con la descrizione di Avenza.");
    }

    // Forza anche per dunchi e bresci per sicurezza se sono rimasti incastrati
    const { data: specifici } = await supabase.from('shared_pois')
        .select('id, name')
        .or('name.ilike.%dunchi%,name.ilike.%bresci%');
        
    if (specifici && specifici.length > 0) {
        console.log("Controllo specifico per Dunchi e Bresci...");
        for (const p of specifici) {
            console.log(`Forzo il reset di: ${p.name}`);
            await supabase.from('shared_pois')
                .update({ 
                    photo_url: null, 
                    image_url: null, 
                    description_ai: null,
                    description_long: null,
                    description_short: null 
                })
                .eq('id', p.id);
            await supabase.from('shared_poi_audio_cache')
                .delete()
                .ilike('poi_id', `${p.id}%`);
        }
    }

    console.log("Fatto!");
}

fixCorruptedPois();
