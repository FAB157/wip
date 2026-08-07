import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

// Query separata per arricchiti
const { data: enrichedData } = await sb
  .from('shared_pois')
  .select('name, category')
  .ilike('city', '%carrara%')
  .not('enriched_at', 'is', null)
  .limit(100);

// Query separata per non arricchiti
const { data: pendingData } = await sb
  .from('shared_pois')
  .select('name, category')
  .ilike('city', '%carrara%')
  .is('enriched_at', null)
  .limit(100);

const enriched = enrichedData || [];
const pending = pendingData || [];

console.log(`\n📍 CARRARA — Situazione POI`);
console.log(`✅ Arricchiti: ${enriched.length}`);
console.log(`⏳ Da fare:    ${pending.length}`);

if (enriched.length > 0) {
  console.log(`\n✅ Già arricchiti:`);
  enriched.forEach((p: any) => console.log(`  - ${p.name} [${p.category}]`));
}
if (pending.length > 0) {
  console.log(`\n⏳ In coda:`);
  pending.slice(0, 15).forEach((p: any) => console.log(`  - ${p.name} [${p.category}]`));
}
process.exit(0);

