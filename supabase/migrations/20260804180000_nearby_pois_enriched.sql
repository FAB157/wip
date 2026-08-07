-- La RPC nearby_pois restituiva solo id/nome/lat/lon/distanza/source.
-- Tutti i consumatori (mappa web, radar nativo Android, overlay AR) leggono
-- però anche categoria, foto, descrizione e flag gemma: ricevendo `undefined`
-- ogni POI del database veniva mostrato senza immagine, senza descrizione,
-- classificato d'ufficio come "monumenti" e mai come gemma — e nell'AR il
-- filtro per categoria li scartava tutti, lasciando la schermata vuota.
--
-- I POI restituiti sono ESATTAMENTE gli stessi di prima (la clausola where non
-- cambia): si aggiungono solo colonne.
--
-- Le colonne opzionali sono lette via to_jsonb(sp)->>'campo': se una colonna
-- non esiste nella tabella si ottiene NULL invece di un errore, quindi questa
-- migration è sicura su qualsiasi variante dello schema.

drop function if exists public.nearby_pois(float, float, int, int);

create or replace function public.nearby_pois(
  p_lat float,
  p_lon float,
  radius_m int,
  limit_num int default 60
)
returns table (
  id text,
  nome text,
  lat float,
  lon float,
  distanza_m float,
  source text,
  category text,
  sub_category text,
  description_short text,
  description_ai text,
  image_url text,
  is_gem boolean,
  status text
)
language sql stable as $$
  select
    sp.id,
    sp.name as nome,
    sp.lat,
    sp.lon,
    st_distance(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) as distanza_m,
    coalesce(to_jsonb(sp) ->> 'enrichment_source', 'official') as source,
    to_jsonb(sp) ->> 'category'          as category,
    to_jsonb(sp) ->> 'sub_category'      as sub_category,
    to_jsonb(sp) ->> 'description_short' as description_short,
    to_jsonb(sp) ->> 'description_ai'    as description_ai,
    coalesce(to_jsonb(sp) ->> 'image_url', to_jsonb(sp) ->> 'photo_url') as image_url,
    coalesce((to_jsonb(sp) ->> 'is_gem')::boolean, false) as is_gem,
    coalesce(to_jsonb(sp) ->> 'status', 'verified') as status
  from public.shared_pois sp
  where st_dwithin(
    st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    radius_m
  )
  order by distanza_m asc
  limit limit_num;
$$;

grant execute on function public.nearby_pois(float, float, int, int) to anon, authenticated;
