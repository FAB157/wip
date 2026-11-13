-- PIN MAPPA, funzione v2 con ordinamento per distanza sull'indice (KNN, 25/09/2026).
-- La prima versione copiava la struttura della vecchia (candidati senza ordine, LIMIT×4, poi
-- ordinamento): con più di 2.000 pin nel raggio la scelta dei candidati era casuale (Roma:
-- 305 pin su 500 in comune tra due chiamate uguali). Sul GiST della tabella leggera
-- `geog <-> punto` restituisce i 500 PIÙ VICINI in ordine, in un colpo solo.
create or replace function public.nearby_pois_map_v2(p_lat float8, p_lon float8, radius_m integer, limit_num integer default 500, p_lang text default 'it')
returns table(id text, nome text, lat float8, lon float8, distanza_m float8, category text, sub_category text, image_url text,
              is_gem boolean, status text, description_short text, teaser text)
language sql stable
set statement_timeout to '25s'
as $$
  with punto as (select st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography as g),
  vicini as (
    select pm.*, st_distance(pm.geog, punto.g) as d
    from public.pin_mappa pm, punto
    where st_dwithin(pm.geog, punto.g, radius_m)
    order by pm.geog <-> punto.g
    limit greatest(coalesce(limit_num, 500), 1)
  )
  select v.id, v.nome, v.lat, v.lon, v.d as distanza_m, v.category, v.sub_category, v.image_url, v.is_gem, v.status, v.description_short,
    case lower(coalesce(p_lang, 'it'))
      when 'en' then coalesce(v.teaser_en, v.teaser_it)
      when 'fr' then coalesce(v.teaser_fr, v.teaser_en, v.teaser_it)
      when 'es' then coalesce(v.teaser_es, v.teaser_en, v.teaser_it)
      when 'de' then coalesce(v.teaser_de, v.teaser_en, v.teaser_it)
      when 'ru' then coalesce(v.teaser_ru, v.teaser_en, v.teaser_it)
      when 'zh' then coalesce(v.teaser_zh, v.teaser_en, v.teaser_it)
      else v.teaser_it
    end as teaser
  from vicini v
  order by v.d asc;
$$;
