import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

// Bounding box Italia
const ITALY = { minLat: 36.6, maxLat: 47.1, minLon: 6.6, maxLon: 18.5 };

async function resetItaly() {
  console.log('🔄 Reset enriched_at per tutti i POI italiani...');
  let total = 0;
  let from = 0;
  const step = 1000;

  while (true) {
    // Fetch IDs of Italian POIs that have enriched_at set
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id')
      .gte('lat', ITALY.minLat).lte('lat', ITALY.maxLat)
      .gte('lon', ITALY.minLon).lte('lon', ITALY.maxLon)
      .not('enriched_at', 'is', null)
      .range(from, from + step - 1);

    if (error) { console.error('Errore:', error.message); break; }
    if (!data || data.length === 0) break;

    const ids = data.map((r: any) => r.id);
    const { error: upErr } = await supabase
      .from('shared_pois')
      .update({ enriched_at: null, enrichment_source: null })
      .in('id', ids);

    if (upErr) { console.error('Errore update:', upErr.message); break; }
    total += ids.length;
    console.log(`✅ Resettati ${total} POI finora...`);

    if (data.length < step) break;
    from += step;
  }

  console.log(`\n🎉 Reset completato! ${total} POI italiani pronti per essere riarricchiti.`);
  process.exit(0);
}

resetItaly();
