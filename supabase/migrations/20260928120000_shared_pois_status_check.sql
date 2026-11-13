-- =====================================================================
-- STATUS DEI POI: IL VINCOLO SEGUE GLI STATI CHE L'APP USA (28/09/2026).
-- DA APPLICARE A MANO (SQL editor di Supabase).
--
-- Sintomo: dall'Editor POI sulla mappa, scegliendo "banned" (o "auto") il
-- salvataggio falliva con
--   new row for relation "shared_pois" violates check constraint
--   "shared_pois_status_check"
-- Il vincolo nasce in schema.sql con i soli ('draft','verified',
-- 'needs_revision') e nessuna migration lo ha mai allargato, mentre il
-- pannello admin propone anche 'auto' e 'banned' e le RPC di visibilita'
-- (nearby_pois, area bundle, ricerca) ragionano anche su 'approved',
-- 'rejected' e 'hidden'.
--
-- NOT VALID: le righe esistenti non vengono ricontrollate (sono gia'
-- passate dal vincolo vecchio o da scritture service_role), le nuove si'.
-- Il vincolo pero' vale su OGNI UPDATE della riga, anche se non tocca lo
-- status: per questo la lista comprende anche gli stati storici, cosi' una
-- riga 'approved' resta modificabile.
-- =====================================================================

set lock_timeout = '5s';

alter table public.shared_pois drop constraint if exists shared_pois_status_check;

alter table public.shared_pois
  add constraint shared_pois_status_check
  check (status in (
    'draft', 'verified', 'needs_revision', 'auto', 'banned',
    'approved', 'rejected', 'hidden'
  )) not valid;
