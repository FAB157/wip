-- =====================================================================
-- LE TAPPE DEI PERCORSI
-- =====================================================================
--
-- Un cammino non e' solo una linea: e' una successione di tappe, ed e'
-- quella che serve a chi deve decidere dove dormire e quanto camminare
-- domani. La linea la disegna `line`, le tappe stanno qui.
--
-- Formato: [{ "n": 1, "luogo": "Aulla", "lat": 44.21, "lon": 9.97,
--             "note": "la Via Francigena entra in Lunigiana" }, …]
--
-- REGOLA che vale per come si riempie questa colonna: le tappe sono
-- LOCALITA, mai strutture private. Un rifugio cambia gestione, chiude,
-- cambia nome; un paese resta dov'e'. La stessa regola del catalogo delle
-- strade del gusto, dove le tappe sono paesi e mai aziende.
--
-- jsonb e non una tabella a parte: le tappe si leggono sempre e solo
-- insieme al percorso, non si interrogano da sole, e una join in piu' per
-- ogni linea disegnata sarebbe lavoro sprecato.
-- =====================================================================

alter table public.route_geometries
  add column if not exists stops jsonb;

comment on column public.route_geometries.stops is
  'Tappe in ordine: [{n, luogo, lat, lon, note}]. Localita, mai strutture private.';
