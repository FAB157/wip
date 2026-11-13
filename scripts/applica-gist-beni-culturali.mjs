#!/usr/bin/env node
/** Applica 20260927170000_gist_beni_culturali.sql a passi separati (1,78M righe: un blocco solo va in timeout). */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const c = new Client({ user: env.SUPABASE_DB_USER, host: env.SUPABASE_DB_HOST, database: 'postgres', password: env.SUPABASE_DB_PASSWORD, port: 5432, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
await c.connect();
await c.query('SET default_transaction_read_only = off');

async function passo(nome, sql, timeoutMs) {
  await c.query(`SET statement_timeout = '${timeoutMs}'`);
  const t0 = Date.now();
  await c.query(sql);
  console.log(`[ok] ${nome} (${Date.now() - t0} ms)`);
}

await passo('colonna geog', `alter table public.beni_culturali add column if not exists geog geography(Point, 4326)`, '30s');

// L'UPDATE su 1,78M righe e' lento e pesante (stesso rischio dell'incidente
// autovacuum del 24/09 su shared_pois): lotti piccoli, con pausa fra uno e
// l'altro, mai lotti piu' grandi anche se quello attuale passa veloce.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fatte = -1;
let giro = 0;
let dimensione = 20000; // ridotta da 50000: la scansione senza indice su "geog is null" e' lenta e cresce col numero di giri
while (fatte !== 0) {
  await c.query(`SET statement_timeout = '180s'`);
  const t0 = Date.now();
  try {
    const r = await c.query(`
      with lotto as (
        select id from public.beni_culturali
        where geog is null and lat is not null and lon is not null
        limit ${dimensione}
      )
      update public.beni_culturali bc
      set geog = st_setsrid(st_makepoint(bc.lon, bc.lat), 4326)::geography
      from lotto where lotto.id = bc.id
    `);
    fatte = r.rowCount || 0;
    giro++;
    console.log(`[ok] lotto ${giro} geog: ${fatte} righe, dimensione ${dimensione} (${Date.now() - t0} ms)`);
    if (fatte > 0) await sleep(2000);
  } catch (e) {
    if (e.code === '57014' && dimensione > 2000) {
      dimensione = Math.floor(dimensione / 2);
      console.log(`[timeout] lotto troppo lento, dimensione ridotta a ${dimensione}, riprovo...`);
      fatte = -1; // continua il ciclo
      await sleep(2000);
    } else {
      throw e;
    }
  }
}

await passo('indice GIST', `create index if not exists idx_beni_culturali_geog on public.beni_culturali using gist (geog)`, '8min');

await passo('trigger function', `create or replace function public.tg_beni_culturali_geog()
returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lon is not null then
    new.geog := st_setsrid(st_makepoint(new.lon, new.lat), 4326)::geography;
  else
    new.geog := null;
  end if;
  return new;
end;
$$`, '10s');

await passo('trigger', `drop trigger if exists trg_beni_culturali_geog on public.beni_culturali;
create trigger trg_beni_culturali_geog
  before insert or update of lat, lon
  on public.beni_culturali
  for each row execute function public.tg_beni_culturali_geog()`, '10s');

await passo('funzione RPC', `create or replace function public.beni_culturali_vicini(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_fasce text[] default null, p_limit integer default 400
)
returns table(id uuid, name text, lat float8, lon float8, tier text, category_wip text, typology text,
              comune text, address text, description text, promoted_poi_id text, matched_poi_id text,
              wikidata_id text, geocode_source text, image_url text, image_attribution text, catalog_url text)
language plpgsql stable
set statement_timeout to '10s'
as $$
begin
  return query execute
    'with candidati as (
       select bc.id, bc.name, bc.lat, bc.lon, bc.tier, bc.category_wip, bc.typology, bc.comune, bc.address,
         bc.description, bc.promoted_poi_id, bc.matched_poi_id, bc.wikidata_id, bc.geocode_source,
         bc.image_url, bc.image_attribution, bc.catalog_url
       from public.beni_culturali bc
       where bc.name is not null and bc.geog is not null
         and st_intersects(bc.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)
         and ($5 is null or bc.tier = any($5))
       limit greatest($6,1) * 6
     )
     select * from candidati order by tier asc, id asc limit greatest($6,1)'
  using p_south, p_west, p_north, p_east, p_fasce, p_limit;
end;
$$`, '10s');

await c.query(`grant execute on function public.beni_culturali_vicini(float8, float8, float8, float8, text[], integer) to anon, authenticated`);
console.log('[ok] grant');

const r = await c.query(`select count(*) from beni_culturali where geog is not null`);
console.log('beni_culturali con geog:', r.rows[0].count);
await c.end();
