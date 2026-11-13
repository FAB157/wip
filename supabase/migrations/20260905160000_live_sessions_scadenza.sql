-- =====================================================================
-- AUDIOGUIDA DI GRUPPO: nessuno riusciva a entrare (05/09/2026)
-- =====================================================================
-- Sintomo riferito dal committente: crea la sessione con un account, prova
-- a collegarsi con un altro, errore.
--
-- Causa: `joinByPin` (src/hooks/useLiveTour.ts) cerca la sessione con
--
--     .eq('pin', pin).eq('is_active', true)
--     .gt('expires_at', new Date().toISOString())
--
-- ma la colonna `expires_at` NON ESISTE su questo database. PostgREST
-- risponde 400 con «column live_sessions.expires_at does not exist», il
-- codice vede un errore e mostra «Sessione non trovata, scaduta o
-- terminata.» — un messaggio che manda a cercare il problema dalla parte
-- sbagliata: la sessione c'e' eccome, e' la query a essere invalida.
--
-- Non riguarda solo il secondo account: NESSUNO poteva entrare, mai, e
-- nemmeno il ripristino della sessione dopo il riavvio dell'app poteva
-- funzionare (usa la stessa funzione).
--
-- La migration 20260721103000_live_sessions.sql dichiara `expires_at` e
-- `language`, ma la tabella in produzione non le ha: e' stata creata da una
-- versione precedente e la migration non e' mai stata applicata per intero.
-- Stesso schema visto oggi con i coupon (reward_credits/expires_at
-- dichiarati nel form ma assenti nel DB): il codice si aspetta uno schema
-- che nessuno ha mai messo in piedi.
--
-- Verificato colonna per colonna prima di scrivere: ci sono id, pin,
-- leader_id, created_at, is_active, current_poi_id. Mancano expires_at e
-- language.
-- =====================================================================

alter table public.live_sessions
  add column if not exists expires_at timestamptz,
  add column if not exists language   text default 'IT';

-- Le sessioni gia' in tabella (luglio e agosto) sono rimaste `is_active` per
-- sempre proprio perche' non esisteva una scadenza. Assegnare
-- created_at + 12 ore le rende scadute, che e' la verita': sono morte da
-- settimane. Nessuna riga viene cancellata.
update public.live_sessions
   set expires_at = created_at + interval '12 hours'
 where expires_at is null;

alter table public.live_sessions
  alter column expires_at set default now() + interval '12 hours';

alter table public.live_sessions
  alter column expires_at set not null;

comment on column public.live_sessions.expires_at is
  'Scadenza della sessione di gruppo (12 ore). Il join la controlla: senza questa colonna la query di ingresso falliva e nessuno poteva unirsi.';
