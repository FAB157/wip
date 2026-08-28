const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient('https://qfxxhzkkrkvbuekfknhh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
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
  
  fs.writeFileSync('C:/progetti/itainta/poi_list_today.md', md);
  console.log("Lista scritta su file");
}
run().catch(console.error);
