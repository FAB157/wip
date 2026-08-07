require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('shared_pois')
    .select('id, name, category, image_url, description_short, description_long')
    .gte('created_at', d.toISOString());
    
  if (error) {
    console.error(error);
  } else {
    let withPhoto = 0;
    let withShortDesc = 0;
    let withLongDesc = 0;
    
    data.forEach(p => {
       if (p.image_url && p.image_url.length > 5) withPhoto++;
       if (p.description_short && p.description_short.length > 10) withShortDesc++;
       if (p.description_long && p.description_long.length > 50) withLongDesc++;
    });

    console.log(`Totale POI analizzati oggi: ${data.length}`);
    console.log(`Con Foto: ${withPhoto} / ${data.length}`);
    console.log(`Con Descrizione Breve: ${withShortDesc} / ${data.length}`);
    console.log(`Con Descrizione Lunga: ${withLongDesc} / ${data.length}`);
    
    const missingPhoto = data.filter(p => !p.image_url || p.image_url.length < 5).slice(0, 5);
    if (missingPhoto.length > 0) {
       console.log("\nEsempi senza foto:");
       missingPhoto.forEach(p => console.log(`- ${p.name} (${p.category})`));
    }
  }
}
check();
