-- =====================================================================
-- OFFLINE PER-LINGUA — WIP (2026-08-09)
--
-- area_bundle_pois (pacchetti offline) restituiva teaser_text nella lingua
-- dell'utente (colonne teaser_text_xx) MA audio_text solo dai campi ITALIANI
-- di shared_pois (audio_script/description_long/…). Risultato: offline, un
-- utente straniero col Day Pass sentiva l'audioguida completa in italiano.
--
-- Fix: LEFT JOIN su poi_audioguides per (poi, lingua MAIUSCOLA, 'nicky') e usa
-- QUELLA come audio_text, con fallback ai campi italiani se la traduzione non
-- esiste ancora. IT+EN sono già popolati per quasi tutti i POI; le altre
-- lingue si riempiono man mano (via /api/poi/audioguide) e poi entrano anche
-- nei pacchetti offline. Il codice lato app non cambia: già invia `lang`.
--
-- DA APPLICARE A MANO su Supabase. Stessa firma; cambia solo audio_text + join.
-- =====================================================================

set lock_timeout = '5s';

create or replace function public.area_bundle_pois(
  p_lat float,
  p_lon float,
  p_radius_m int,
  p_lang text default 'it',
  p_since timestamptz default null,
  p_cursor_updated timestamptz default null,
  p_cursor_id text default null,
  p_limit int default 500
)
returns table (
  id text,
  nome text,
  lat float,
  lon float,
  category text,
  poi_type text,
  is_gem boolean,
  status text,
  alert_radius int,
  geofence_radius int,
  teaser_text text,
  description_short text,
  audio_text text,
  updated_at timestamptz,
  total_count bigint
)
language sql stable as $$
  select
    sp.id,
    sp.name as nome,
    sp.lat,
    sp.lon,
    sp.category,
    sp.poi_type,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status,
    coalesce(sp.alert_radius, 150) as alert_radius,
    coalesce(sp.geofence_radius, 50) as geofence_radius,
    case p_lang
      when 'en' then coalesce(sp.teaser_text_en, sp.teaser_text_it)
      when 'fr' then coalesce(sp.teaser_text_fr, sp.teaser_text_it)
      when 'es' then coalesce(sp.teaser_text_es, sp.teaser_text_it)
      when 'de' then coalesce(sp.teaser_text_de, sp.teaser_text_it)
      when 'ru' then coalesce(sp.teaser_text_ru, sp.teaser_text_it)
      when 'zh' then coalesce(sp.teaser_text_zh, sp.teaser_text_it)
      else sp.teaser_text_it
    end as teaser_text,
    sp.description_short,
    -- Audioguida NELLA LINGUA: prima la traduzione cachata in poi_audioguides
    -- (language in MAIUSCOLO, come il web/get-or-create), poi i campi italiani
    -- come rete di sicurezza finché quella lingua non è ancora stata generata.
    coalesce(ag.audio_text, sp.audio_script, sp.description_long, sp.description_ai, sp.full_description) as audio_text,
    sp.updated_at,
    count(*) over () as total_count
  from public.shared_pois sp
  left join public.poi_audioguides ag
    on ag.poi_id = sp.id
   and ag.language = upper(p_lang)
   and ag.guide_character = 'nicky'
  where st_dwithin(
          st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
          st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
          p_radius_m
        )
    and coalesce(sp.status, 'verified') in ('verified', 'auto', 'approved', 'draft')
    and (p_since is null or sp.updated_at > p_since)
    and (
          p_cursor_updated is null
          or (sp.updated_at, sp.id) > (p_cursor_updated, p_cursor_id)
        )
  order by sp.updated_at asc, sp.id asc
  limit least(greatest(p_limit, 1), 1000);
$$;

grant execute on function public.area_bundle_pois(float, float, int, text, timestamptz, timestamptz, text, int)
  to anon, authenticated;
