-- 29/10/2026 — shared_pois.country aveva DEFAULT 'Italy' (migrate_*_to_shared_pois.sql): ogni import che non indicava il
-- paese (Wikidata, NRHP, Wikivoyage, Viator…) scriveva «Italy». Misurato il 28/10: 70.775 gemme visibili fuori dall'Italia
-- marcate Italia, corrette la notte del 29/10 (copia in /root/citta/paesi-gemme-prima-2026-10-28.jsonl su Oracle).
-- Senza default un paese mancante resta NULL: meglio vuoto che sbagliato. Nessuna query del server filtra per country.
-- Solo metadati (nessuna riscrittura della tabella); lock_timeout perché non resti in coda dietro a query lunghe.
SET lock_timeout = '5s';
ALTER TABLE public.shared_pois ALTER COLUMN country DROP DEFAULT;
