-- =====================================================================
-- UN POI "BANNED" SPARISCE DALLA MAPPA, DA QUALUNQUE PARTE ARRIVI (28/09/2026).
-- DA APPLICARE A MANO (SQL editor di Supabase), dopo
-- 20260928120000_shared_pois_status_check.sql.
--
-- Sintomo: Museo Civico del Marmo messo in "banned" dall'Editor POI sulla
-- mappa, ma ancora visibile in Esplora. Le RPC della mappa (nearby_pois,
-- nearby_everything, area bundle) nascondono in base a is_hidden e a
-- status IN ('draft','needs_revision','rejected','hidden'): 'banned' non
-- c'e', e la rotta dell'editor (prima della correzione nel server) non
-- impostava is_hidden. AdminEditor invece lo imposta a mano.
--
-- Il trigger mette la regola nel database, cosi' vale per ogni scrittura
-- (editor sulla mappa, editor testuale, SQL a mano, script):
--   * status -> 'banned'            => is_hidden = true
--   * status 'banned' -> altro      => is_hidden = false, ma solo se chi
--     scrive non ha deciso is_hidden esplicitamente nello stesso UPDATE.
-- =====================================================================

set lock_timeout = '5s';

-- POI gia' bannati prima di questa migration.
update public.shared_pois
   set is_hidden = true
 where status = 'banned'
   and is_hidden is not true;

create or replace function public.shared_pois_banned_hidden()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'banned' then
    new.is_hidden := true;
  elsif tg_op = 'UPDATE'
    and old.status = 'banned'
    and new.is_hidden is not distinct from old.is_hidden then
    new.is_hidden := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shared_pois_banned_hidden on public.shared_pois;
create trigger trg_shared_pois_banned_hidden
  before insert or update of status on public.shared_pois
  for each row execute function public.shared_pois_banned_hidden();
