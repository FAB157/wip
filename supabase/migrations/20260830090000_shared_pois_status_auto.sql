-- ═══════════════════════════════════════════════════════════════════════════
-- LE TAPPE DEGLI ITINERARI NON DIVENTAVANO MAI POI (30/08/2026)
--
-- Collaudo: dell'itinerario «4 Giorni a Parigi» ZERO tappe su 23 esistono in
-- shared_pois. Niente POI ⇒ niente foto, niente descrizione, niente audioguida
-- in cache, e niente pin sulla mappa nella loro categoria.
--
-- CAUSA: `PlanScreen.tsx` fa l'upsert delle tappe con `status: 'auto'` (messo
-- il 27/08 perche' senza status i POI restavano esclusi dal download offline).
-- Ma il vincolo CHECK su shared_pois.status NON ammette 'auto': ogni riga
-- viene respinta con 23514. Verificato provando i valori uno per uno con la
-- chiave di servizio:
--     auto, approved, published, active → 23514 RIFIUTATO
--     verified, draft                   → ammessi
-- E l'errore non si vedeva: l'upsert del client finisce in un `console.warn`.
--
-- E` il VINCOLO a essere fuori posto, non il codice: tutto il resto del
-- sistema tratta 'auto' come stato normale e VISIBILE —
--   • 20260714000000_fix_get_nearby_pois.sql:  status IN ('verified','auto','approved','draft')
--   • 20260716000001_optimize_poi_queries.sql: idem
--   • 20260803000000_utility_pois.sql:         status IN ('verified','auto')
--   • 20260731120000_security_hardening.sql:   policy INSERT con `coalesce(status,'auto') = 'auto'`
--     (cioe' la policy AUTORIZZA proprio il valore che la tabella rifiuta)
--   • src/services/poiRepository.ts: HIDDEN_POI_STATUSES = draft/needs_revision/
--     rejected/hidden — 'auto' e' visibile e scaricabile.
-- Usare 'draft' non e' un rimedio: e' fra gli stati NASCOSTI, i POI non
-- comparirebbero sulla mappa. Usare 'verified' sarebbe una bugia: vuol dire
-- «rivisto da un amministratore», e queste tappe non lo sono.
--
-- Qui si aggiungono 'auto' e 'approved' ai valori ammessi. Il nome del vincolo
-- non e' noto a priori (creato in una migration antica o a mano dal pannello
-- Supabase), quindi lo si cerca in pg_constraint invece di indovinarlo.
--
-- IDEMPOTENTE: si puo' applicare piu' volte.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

DO $$
DECLARE
  v_nome text;
  v_def  text;
BEGIN
  IF to_regclass('public.shared_pois') IS NULL THEN
    RAISE NOTICE 'shared_pois assente: salto';
    RETURN;
  END IF;

  -- Il vincolo CHECK che nomina la colonna status.
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO v_nome, v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.shared_pois'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LIMIT 1;

  IF v_nome IS NULL THEN
    RAISE NOTICE 'Nessun CHECK su status: niente da fare';
    RETURN;
  END IF;

  RAISE NOTICE 'Vincolo trovato: % → %', v_nome, v_def;

  IF v_def ILIKE '%''auto''%' THEN
    RAISE NOTICE 'Ammette gia'' auto: niente da fare';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.shared_pois DROP CONSTRAINT %I', v_nome);

  -- NOT VALID: la tabella ha ~2 milioni di righe e una validazione completa
  -- prenderebbe un lock lungo (e con lock_timeout=5s fallirebbe). Il vincolo
  -- vale comunque su ogni riga NUOVA o modificata, che e' cio' che serve; le
  -- righe storiche hanno gia' valori legittimi.
  EXECUTE $c$
    ALTER TABLE public.shared_pois
      ADD CONSTRAINT shared_pois_status_check
      CHECK (status IS NULL OR status IN (
        'verified', 'auto', 'approved', 'draft', 'needs_revision', 'rejected', 'hidden'
      )) NOT VALID
  $c$;

  RAISE NOTICE 'Vincolo rifatto: ora ammette auto/approved e gli stati di moderazione.';
END $$;
