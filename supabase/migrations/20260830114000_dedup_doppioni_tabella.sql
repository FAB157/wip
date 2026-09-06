-- NASCONDERE 155.000 DOPPIONI IN UNA SOLA ISTRUZIONE, DENTRO IL DATABASE.
-- ======================================================================
-- Il 30/08 mattina la scrittura da fuori non passava: l'UPDATE di una riga
-- di shared_pois costa ~1,2 s (trigger, indici, righe larghe) e con sei in
-- parallelo si finiva nel timeout di 8 s di PostgREST; 155.000 righe una
-- alla volta sarebbero state piu' di un giorno. Qui l'elenco (id da
-- nascondere, id tenuto) si carica in una tabella d'appoggio piccola e
-- l'aggiornamento e' UN join fatto dal server, con il suo timeout.
create table if not exists public.dedup_doppioni (
  id text primary key,          -- il POI da nascondere
  tieni text not null,          -- il POI tenuto al suo posto
  regola text,                  -- 'A' (Overture vicino a omologo) | 'B' (omonimi tra fonti)
  metri integer,
  caricato_at timestamptz not null default now(),
  applicato_at timestamptz
);
alter table public.dedup_doppioni enable row level security;
-- Nessuna policy: la legge e la scrive solo la chiave di servizio.

-- L'aggiornamento vero. SECURITY DEFINER + statement_timeout proprio, cosi'
-- passa anche chiamata via RPC dalla chiave di servizio. Idempotente: le
-- righe gia' applicate si saltano. Ritorna quante ne ha nascoste.
create or replace function public.nascondi_doppioni(lotto integer default 20000)
returns integer
language plpgsql
security definer
-- NIENTE search_path fisso: un trigger di shared_pois chiama st_makepoint
-- (PostGIS) senza schema, e con 'public' o 'public, extensions' non lo
-- trovava (42883, 30/08 14:27-14:29). Si eredita quello della sessione,
-- lo stesso con cui le PATCH via PostgREST funzionano. La funzione e'
-- eseguibile solo da service_role, quindi il rischio del definer e' nullo.
set statement_timeout = '900s'
as $$
declare
  n integer;
begin
  with da_fare as (
    select id, tieni from public.dedup_doppioni
    where applicato_at is null
    order by id
    limit lotto
  ), agg as (
    update public.shared_pois s
       set is_hidden = true,
           hidden_reason = 'doppione',
           duplicate_of = d.tieni
      from da_fare d
     where s.id = d.id
     returning s.id
  )
  update public.dedup_doppioni x
     set applicato_at = now()
    from da_fare d
   where x.id = d.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.nascondi_doppioni(integer) from public;
grant execute on function public.nascondi_doppioni(integer) to service_role;

-- Per tornare indietro:
--   update public.shared_pois set is_hidden=false, hidden_reason=null, duplicate_of=null
--    where hidden_reason='doppione';
--   update public.dedup_doppioni set applicato_at=null;

notify pgrst, 'reload schema';
