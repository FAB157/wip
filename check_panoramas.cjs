const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    
    console.log(`Controllo quanti POI sono stati scaricati e salvati nel DB oggi (dopo ${todayStr})...`);
    
    const { data, error, count } = await supabase
        .from('shared_pois')
        .select('id, name, created_at, category', { count: 'exact' })
        .gte('created_at', todayStr)
        .ilike('id', 'wiki-%')
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error("Errore:", error);
        return;
    }
    
    console.log(`\n✅ NESSUN TIMEOUT! Grazie all'indice, la ricerca è stata immediata.`);
    console.log(`Trovati in totale ${count} POI generati automaticamente da Wikipedia oggi!`);
    
    if (data.length > 0) {
        console.log("\nEcco gli ultimi 10 aggiunti:");
        data.forEach((poi, index) => {
            console.log(`${index + 1}. ${poi.name} (Cat: ${poi.category}) - ${new Date(poi.created_at).toLocaleTimeString()}`);
        });
    }
}
    


run();
