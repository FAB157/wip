const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient('https://qfxxhzkkrkvbuekfknhh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEwMzU4NywiZXhwIjoyMDk0Njc5NTg3fQ.Q0QT3F2w8RlT88a7fY-wO2Mo2r26KeuA2ejZyYJ2d4Y');
async function run() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = today.toISOString();
  
  const { data: added, error: e1 } = await supabase.from('shared_pois').select('id, name, created_at, category').gte('created_at', todayStr).order('created_at', { ascending: false });
  
  const { data: enriched, error: e3 } = await supabase.from('shared_pois').select('id, name, created_at, category, description_ai').gte('created_at', todayStr).not('description_ai', 'is', null).order('created_at', { ascending: false });
  
  let md = "# POI Aggiunti e Arricchiti Oggi\n\n";
  
  md += `## POI Aggiunti Oggi (${added ? added.length : 0})\n`;
  if (added && added.length > 0) {
    added.forEach(poi => {
      md += `- **${poi.name || 'Senza Nome'}** (${poi.category || 'N/A'})\n`;
    });
  } else {
    md += "Nessun POI aggiunto.\n";
  }
  
  md += `\n## POI Arricchiti con AI Oggi (${enriched ? enriched.length : 0})\n`;
  if (enriched && enriched.length > 0) {
    enriched.forEach(poi => {
      md += `- **${poi.name || 'Senza Nome'}** (${poi.category || 'N/A'})\n`;
    });
  } else {
    md += "Nessun POI arricchito.\n";
  }
  
  fs.writeFileSync('C:/Users/HP/.gemini/antigravity-ide/brain/c8f40761-3087-4273-99a1-4da85ad66c7f/artifacts/poi_list_today.md', md);
  console.log("Lista scritta su file");
}
run().catch(console.error);
