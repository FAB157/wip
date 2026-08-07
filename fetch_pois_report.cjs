require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Mancano le variabili d'ambiente Supabase.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const now = new Date();
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const { data: allPois, error } = await supabase.from('shared_pois').select('*');
  
  if (error) {
    console.error("DB Error:", error);
    return;
  }

  const addedSinceYesterday = allPois.filter(p => p.created_at && new Date(p.created_at) >= yesterday);
  
  const enrichedTonight = allPois.filter(p => {
      if (!p.updated_at || !p.created_at) return false;
      const up = new Date(p.updated_at);
      const cr = new Date(p.created_at);
      return up >= today && Math.abs(up.getTime() - cr.getTime()) > 5000; 
  });

  const fs = require('fs');
  fs.writeFileSync('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\def39029-2da5-443d-914f-4f661890b058\\artifacts\\poi_report.json', JSON.stringify({
      aggiunti_da_ieri: {
          numero: addedSinceYesterday.length,
          dettagli: addedSinceYesterday.map(p => ({ id: p.id, nome: p.name, data_creazione: p.created_at }))
      },
      arricchiti_stanotte: {
          numero: enrichedTonight.length,
          dettagli: enrichedTonight.map(p => ({ id: p.id, nome: p.name, data_aggiornamento: p.updated_at, categoria: p.category }))
      }
  }, null, 2));
  console.log("Fatto.");
}

run();
