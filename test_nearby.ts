import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const lat = 44.0;
  const lon = 10.0;
  const radius = 2000;
  
  console.log("Test RPC nearby_pois...");
  let start = Date.now();
  const { data: rpcData, error: rpcErr } = await sb.rpc('nearby_pois', {
    p_lat: lat,
    p_lon: lon,
    radius_m: radius,
    limit_num: 400
  });
  console.log(`RPC Time: ${Date.now() - start}ms`);
  if (rpcErr) console.log("RPC Error:", rpcErr.message);
  else console.log(`RPC returned ${rpcData?.length} results.`);
  
  console.log("\nTest Fallback Query...");
  const delta = (radius / 111000);
  start = Date.now();
  const { data: fbData, error: fbErr } = await sb
      .from('shared_pois')
      .select('id, name, lat, lon, category, status, description_ai, is_gem, photo_url, image_url')
      .gte('lat', lat - delta)
      .lte('lat', lat + delta)
      .gte('lon', lon - delta)
      .lte('lon', lon + delta)
      .in('status', ['verified', 'auto', 'approved', 'draft'])
      .not('name', 'is', null)
      .order('image_url', { ascending: true, nullsFirst: false })
      .order('photo_url', { ascending: true, nullsFirst: false })
      .order('description_ai', { ascending: true, nullsFirst: false })
      .limit(400);
  console.log(`Fallback Time: ${Date.now() - start}ms`);
  if (fbErr) console.log("Fallback Error:", fbErr.message);
  else console.log(`Fallback returned ${fbData?.length} results.`);
  
}
run();
