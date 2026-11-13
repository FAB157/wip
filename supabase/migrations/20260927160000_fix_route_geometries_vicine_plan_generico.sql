-- FIX (27/09/2026): `route_geometries_vicine` misurata a 3-6 SECONDI su un
-- riquadro grande (Italia intera, ciclabili) contro <1s della query
-- equivalente diretta — stesso problema di piano generico già visto oggi su
-- `pin_mappa_servizi_per_categoria` (20260927130000): una funzione
-- `language sql stable` viene pianificata senza conoscere i valori reali
-- dei parametri. Stesso fix: `plpgsql` + `EXECUTE...USING`, che forza una
-- pianificazione fresca sui valori reali ad ogni chiamata.
-- `denominazioni_vicine` NON ha lo stesso problema (misurata: 344/73ms anche
-- su un riquadro europeo) — tabella piccola, resta `language sql`.

create or replace function public.route_geometries_vicine(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_kinds text[], p_solo_regionale boolean default false, p_limit integer default 150
)
returns table(poi_id text, kind text, profile text, line text, line_regionale text, length_km numeric, stops jsonb)
language plpgsql stable
set statement_timeout to '10s'
as $$
begin
  return query execute
    'with candidati as (
       select rg.poi_id, rg.kind, rg.profile, rg.line, rg.line_regionale, rg.length_km, rg.stops
       from public.route_geometries rg
       where rg.kind = any($5)
         and (not $6 or rg.line_regionale is not null)
         and st_intersects(rg.bbox, st_makeenvelope($2,$1,$4,$3,4326))
       limit greatest($7,1) * 3
     )
     select poi_id, kind, profile, line, line_regionale, length_km, stops
     from candidati
     order by length_km desc nulls last
     limit greatest($7,1)'
  using p_south, p_west, p_north, p_east, p_kinds, p_solo_regionale, p_limit;
end;
$$;
grant execute on function public.route_geometries_vicine(float8, float8, float8, float8, text[], boolean, integer) to anon, authenticated;
