-- ═══════════════════════════════════════════════════════════════════════════
-- IL PACCHETTO OFFLINE PORTA IL PUNTO DELL'INDIRIZZO. DA APPLICARE A MANO.
--
-- PERCHE'. Il 23/08 le due RPC online (nearby_pois, get_geofence_pois) hanno
-- imparato a restituire `address_source` e `address_point_lat/lon/source`
-- (20260823150000 e 20260823170000): con quel punto il trigger scatta a 30 m
-- DALL'INDIRIZZO invece che dal centroide, e il centroide puro e' l'unico caso
-- che resta col raggio raddoppiato (RaggiFiducia.moltiplicatore).
-- `area_bundle_pois` no: la lista di colonne di una funzione SQL e' FISSA, e
-- quelle colonne — scritte sul database — restavano invisibili a chi scarica
-- un'area. Risultato: lo stesso POI, con la stessa app, aveva il raggio
-- stretto online e raddoppiato offline. Ed e' il contrario di quello che
-- serve, perche' chi scarica un'area e' proprio chi poi cammina senza rete.
--
-- COSA CAMBIA. Quattro colonne in piu' IN CODA alla tabella di ritorno:
--   address_source        — la provenienza della stringa. NON e' decorazione:
--                           'strada_vicina' vuol dire «la strada con nome piu'
--                           vicina», non l'indirizzo del luogo, e scarta anche
--                           il punto (RaggiFiducia.puntoIndirizzo).
--   address_point_lat/lon — il punto: la casa piu' vicina al POI nel dump
--                           Nominatim, vicinanza MISURATA a pochi metri.
--   address_point_source  — photon_casa_civico | photon_casa | ...: qualita' e
--                           provenienza in un valore solo, per chi un domani
--                           dovra' decidere il raggio dalla qualita'.
-- In coda perche' le app gia' installate leggono per nome e ignorano cio' che
-- non conoscono: un pacchetto scaricato ieri resta valido.
--
-- Il resto (filtri, lingua, audioguida, ingresso, perimetro, keyset,
-- total_count, firma) e' IDENTICO a
-- 20260822150000_area_bundle_ingresso_perimetro.sql: ricopiato tale e quale.
-- Il server (/api/area/bundle) passa le righe come sono: nessuna modifica la'.
--
-- PESO. Tre float e due stringhe corte per POI: qualche decina di byte su un
-- pacchetto che ne pesa alcune migliaia per POI. Irrilevante.
--
-- Il tipo di ritorno cambia: CREATE OR REPLACE non basta, serve DROP prima.
-- lock_timeout corto: se qualcuno tiene un lock si fallisce subito invece di
-- bloccare la produzione (lezione del 18/08).
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

drop function if exists public.area_bundle_pois(float, float, int, text, timestamptz, timestamptz, text, int);

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
  entrance_lat float,
  entrance_lon float,
  address text,
  footprint text,
  -- ── NUOVE, IN CODA (23/08/2026) ──────────────────────────────────────────
  address_source text,
  address_point_lat double precision,
  address_point_lon double precision,
  address_point_source text,
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
    coalesce(ag.audio_text, sp.audio_script, sp.description_long, sp.description_ai, sp.full_description) as audio_text,
    sp.updated_at,
    sp.entrance_lat,
    sp.entrance_lon,
    sp.address,
    fp.geojson as footprint,
    -- L'indirizzo con la sua PROVENIENZA e, quando c'e', il suo PUNTO: offline
    -- il raggio resta stretto come online invece di raddoppiare.
    sp.address_source,
    sp.address_point_lat,
    sp.address_point_lon,
    sp.address_point_source,
    count(*) over () as total_count
  from public.shared_pois sp
  -- 'nicky' FISSO E' UNA SCELTA (23/08/2026), NON UNA DIMENTICANZA: non
  -- aggiungere un p_character. Il TESTO dell'audioguida e' unico; il narratore
  -- scelto dall'utente cambia la VOCE, e offline la voce e' la sintesi di
  -- sistema, che il timbro se lo prende gia' dalle prefs "guideCharacter"
  -- (GeofenceBroadcastReceiver.applyTtsGender, SpeechQueue.voiceForLanguage).
  -- Duplicare i testi per personaggio raddoppierebbe il peso del pacchetto —
  -- il testo e' il 70% dei ~3,4 KB per POI — per far leggere le stesse parole.
  left join public.poi_audioguides ag
    on ag.poi_id = sp.id
   and ag.language = upper(p_lang)
   and ag.guide_character = 'nicky'
  -- Il perimetro e' una riga per POI (poi_id e' PRIMARY KEY): il LEFT JOIN non
  -- moltiplica le righe e non sposta il keyset.
  left join public.poi_footprints fp
    on fp.poi_id = sp.id
  where st_dwithin(
          st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
          st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
          p_radius_m
        )
    and coalesce(sp.status, 'verified') in ('verified', 'auto', 'approved')
    and sp.is_hidden is not true
    and not public.is_generic_poi_name(sp.name)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA — incollare dopo:
--
--   select count(*) filter (where entrance_lat is not null)      as con_porta,
--          count(*) filter (where footprint is not null)         as con_perimetro,
--          count(*) filter (where address_point_lat is not null) as con_punto,
--          count(*)                                              as totale
--   from area_bundle_pois(44.08, 10.10, 3000);               -- Carrara
--   → totale IDENTICO a prima della migration (non cambia nessun filtro);
--     con_porta e con_perimetro come prima; con_punto > 0 solo dopo che la
--     passata di geocodifica ha scritto address_point_* (prima e' 0, ed e'
--     normale: la colonna c'e', i dati arrivano dopo).
-- ═══════════════════════════════════════════════════════════════════════════
