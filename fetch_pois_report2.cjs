const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const now = new Date();
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const { data: allPois, error } = await supabase.from('shared_pois').select('*').limit(3000);
  
  if (error) {
    console.error("DB Error:", error);
    process.exit(1);
  }

  const addedSinceYesterday = allPois.filter(p => p.created_at && new Date(p.created_at) >= yesterday);
  
  const enrichedTonight = allPois.filter(p => {
      if (!p.updated_at || !p.created_at || !p.description_ai) return false;
      const up = new Date(p.updated_at);
      const cr = new Date(p.created_at);
      // It is enriched if updated today and updated_at is different from created_at
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
