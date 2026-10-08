#!/usr/bin/env node
/** Applica 20260928140000_gist_locali_pois.sql a passi separati (~6,5M righe: un blocco solo va in timeout). */
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

await passo('colonna geog', `alter table public.locali_pois add column if not exists geog geography(Point, 4326)`, '30s');

// (28/09/2026, dopo l'incidente 503) Autovacuum su locali_pois scattato con
// lotti da 20.000 e pausa 2s: saturava risorse condivise e il sito rispondeva
// 503. Ripresa piu' prudente: lotti piu' piccoli, pausa piu' lunga, e un
// controllo di /api/health PRIMA di ogni lotto — se il sito e' lento o giu'
// lo script si ferma da solo invece di insistere.
async function saluteSitoOk() {
  try {
    const t0 = Date.now();
    const res = await fetch('https://www.wip.guide/api/health', { signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - t0;
    if (!res.ok || ms > 1500) {
      console.log(`[salute] /api/health non ok o lento (status ${res.status}, ${ms} ms)`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(`[salute] /api/health irraggiungibile: ${e.message}`);
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fatte = -1;
let giro = 0;
let dimensione = 8000; // ridotto da 20000 dopo l'incidente 503 di stanotte
let saluteMaleDiFila = 0;
while (fatte !== 0) {
  if (!(await saluteSitoOk())) {
    saluteMaleDiFila++;
    console.log(`[salute] pausa 60s prima di riprovare (${saluteMaleDiFila}/3)...`);
    if (saluteMaleDiFila >= 3) {
      console.log('[STOP] sito non sano per 3 controlli di fila, mi fermo per sicurezza. Riprendibile in seguito.');
      // (28/09/2026) `break` da solo faceva proseguire lo script fino
      // all'indice GIST — col sito gia' in sofferenza quel passo andava
      // anche lui in timeout e faceva crashare tutto con un errore non
      // gestito. Uscita pulita qui: niente indice/trigger/RPC finche' i
      // lotti non sono davvero finiti.
      await c.end();
      process.exit(0);
    }
    await sleep(60000);
    continue;
  }
  saluteMaleDiFila = 0;
  await c.query(`SET statement_timeout = '180s'`);
  const t0 = Date.now();
  try {
    const r = await c.query(`
      with lotto as (
        select id from public.locali_pois
        where geog is null and lat is not null and lon is not null
        limit ${dimensione}
      )
      update public.locali_pois lp
      set geog = st_setsrid(st_makepoint(lp.lon, lp.lat), 4326)::geography
      from lotto where lotto.id = lp.id
    `);
    fatte = r.rowCount || 0;
    giro++;
    console.log(`[ok] lotto ${giro} geog: ${fatte} righe, dimensione ${dimensione} (${Date.now() - t0} ms)`);
    if (fatte > 0) await sleep(4000);
  } catch (e) {
    if (e.code === '57014' && dimensione > 1000) {
      dimensione = Math.floor(dimensione / 2);
      console.log(`[timeout] lotto troppo lento, dimensione ridotta a ${dimensione}, riprovo...`);
      fatte = -1;
      await sleep(4000);
    } else {
      throw e;
    }
  }
}

await passo('indice GIST', `create index if not exists idx_locali_pois_geog on public.locali_pois using gist (geog)`, '15min');

await passo('trigger function', `create or replace function public.tg_locali_pois_geog()
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

await passo('trigger', `drop trigger if exists trg_locali_pois_geog on public.locali_pois;
create trigger trg_locali_pois_geog
  before insert or update of lat, lon
  on public.locali_pois
  for each row execute function public.tg_locali_pois_geog()`, '10s');

// (28/09/2026) Versione CON p_diete — vedi 20260928150000_fix_locali_pois_diete_e_zoom.sql.
// sub_category non e' MAI valorizzato per le diete (0 righe su tutta la
// tabella): il filtro vero e' su osm_diet, applicato DENTRO la query prima
// del taglio per confidence.
await passo('funzione RPC', `create or replace function public.locali_pois_vicini(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_sub_category text[] default null, p_limit integer default 400,
  p_diete text[] default null
)
returns table(id text, name text, lat double precision, lon double precision, sub_category text,
              cucina text, brand text, address text, city text, website text, phone text,
              socials jsonb, operating_status text, confidence double precision, osm_diet jsonb)
language plpgsql stable
set statement_timeout to '10s'
as $$
begin
  return query execute
    'with candidati as (
       select lp.id, lp.name, lp.lat, lp.lon, lp.sub_category, lp.cucina, lp.brand, lp.address,
         lp.city, lp.website, lp.phone, lp.socials, lp.operating_status, lp.confidence, lp.osm_diet
       from public.locali_pois lp
       where lp.geog is not null
         and st_intersects(lp.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)
         and (lp.operating_status is null or lp.operating_status <> ''closed'')
         and ($5 is null or lp.sub_category = any($5))
         and ($7 is null or exists (
               select 1 from unnest($7) d where lp.osm_diet ->> d = ''true''
             ))
       limit greatest($6,1) * 6
     )
     select * from candidati order by confidence desc nulls last limit greatest($6,1)'
  using p_south, p_west, p_north, p_east, p_sub_category, p_limit, p_diete;
end;
$$`, '10s');

await c.query(`grant execute on function public.locali_pois_vicini(float8, float8, float8, float8, text[], integer, text[]) to anon, authenticated`);
console.log('[ok] grant');

const r = await c.query(`select count(*) from locali_pois where geog is not null`);
console.log('locali_pois con geog:', r.rows[0].count);
await c.end();
