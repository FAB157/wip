-- FIX (28/09/2026, committente: «possibile che in tutta Italia solo 2 locali
-- gluten free? deve mostrarsi tutti, e lo zoom deve essere senza limiti»).
-- Causa trovata: sub_category NON è mai valorizzato a "glutenfree" in
-- locali_pois (0 righe su tutta la tabella) — il dato vero sta in
-- osm_diet->>'gluten_free', mai controllato. E la select diretta in
-- MapArea.tsx caricava locali_pois SOLO sotto 0,6° di altezza mappa: a scala
-- di regione/paese (come nello screenshot) la app ripiegava su shared_pois
-- (nessun dato di dieta) e il filtro trovava solo gli esercizi che hanno
-- "gluten" nel NOME.
--
-- Qui: la RPC prende anche osm_diet, e un parametro p_diete che filtra
-- DENTRO la query (prima del taglio per confidence) — altrimenti con poche
-- centinaia di risultati ordinati per affidabilità i pochi senza-glutine
-- veri restano quasi sempre fuori dal taglio.
create or replace function public.locali_pois_vicini(
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
$$;
grant execute on function public.locali_pois_vicini(float8, float8, float8, float8, text[], integer, text[]) to anon, authenticated;
