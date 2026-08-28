-- =====================================================================
-- LA LINEA A SCALA REGIONALE
-- =====================================================================
--
-- Inquadrando la Toscana intera si vogliono vedere i cammini che
-- l'attraversano — e finora le linee comparivano solo da zoom 12, cioe'
-- quando si e' gia' addosso a un paese.
--
-- Il problema non e' il numero di linee, e' il PESO: misurato il
-- 21/08/2026, quaranta percorsi importanti sulla Toscana fanno 851 KB,
-- perche' una dorsale da 1.000 km porta tremila punti e diradarli lato
-- client vuol dire averli comunque scaricati. Sulla Baviera si arriva a
-- 1,3 MB per una pannellata di mappa.
--
-- Quindi una SECONDA rappresentazione, grossolana: tolleranza ~250 m e un
-- tetto di 120 punti, che a scala regionale e' piu' di quanto l'occhio
-- distingua (a zoom 8 un pixel vale ~600 m). Cosi' una pannellata costa
-- ~36 KB invece di 850.
--
-- Non si riempie per tutti: solo per i percorsi che a quella scala hanno
-- senso — dorsali internazionali e nazionali, tappe CAI, ciclovie di rete,
-- e i percorsi della ricerca mondiale. Sono ~31.000 righe su 244.000, e la
-- colonna resta NULL per gli anelli comunali, che a zoom 8 non si devono
-- vedere comunque.
-- =====================================================================

alter table public.route_geometries
  add column if not exists line_regionale text;

comment on column public.route_geometries.line_regionale is
  'Versione grossolana della linea (tolleranza ~250 m, max 120 punti) per lo zoom regionale. NULL = questo percorso a quella scala non si mostra.';

-- Il filtro dello zoom regionale e'  line_regionale is not null  piu' il
-- riquadro: un indice parziale sul riquadro tiene la query sui 31.000
-- invece che sui 244.000.
create index if not exists route_geometries_regionale_idx
  on public.route_geometries (min_lat, max_lat, min_lon, max_lon)
  where line_regionale is not null;
