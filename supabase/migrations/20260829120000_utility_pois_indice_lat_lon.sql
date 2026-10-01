-- L'INDICE CHE MANCA A `utility_pois`, PRIMA DELLE PANCHINE.
-- ==========================================================
-- Committente (29/08/2026): «inserisci anche bagni e panchine».
--
-- La tabella ha un indice GiST sull'espressione geometrica (lo usa la RPC
-- get_utility_pois con st_dwithin) e uno su `category`. Ma il livello 🚰
-- della mappa (src/lib/servicesLayer.ts) legge via REST filtrando per
-- `sub_category` e per un riquadro `lat`/`lon`: quel filtro NON puo' usare
-- l'indice GiST, e senza un indice suo e' una scansione della tabella.
--
-- Con 450.000 righe (fontanelle + bagni) passa inosservata. Con i ~10
-- milioni di panchine che stanno per entrare, ogni spostamento della mappa
-- col livello acceso diventerebbe una scansione di 10 milioni di righe:
-- timeout, e un livello che «a volte funziona». L'indice va messo PRIMA
-- dell'importazione, non dopo: costruirlo su 10 milioni di righe con il
-- database sotto carico e' molto piu' lento che farlo crescere riga per riga.
--
-- (sub_category, lat): la prima colonna restringe al tipo — panchine,
-- fontanelle o bagni — e la seconda alla fascia di latitudine; la longitudine
-- si filtra sul residuo, che a quel punto e' piccolo.
--
-- SENZA `concurrently`: l'editor SQL di Supabase esegue dentro una
-- transazione e lo rifiuta (25001). Con le 450.000 righe di oggi l'indice si
-- costruisce in pochi secondi e il blocco della tabella non si nota — ed e'
-- esattamente il motivo per cui va fatto PRIMA dei 10 milioni di panchine,
-- quando `concurrently` sarebbe diventato indispensabile.
create index if not exists utility_pois_sub_lat_idx
  on public.utility_pois (sub_category, lat);

-- Anche la RPC e la chip Utilita' interrogano per riquadro sulla tabella
-- grande: lat da sola serve alle letture senza tipo.
create index if not exists utility_pois_lat_idx
  on public.utility_pois (lat);
