-- ═══════════════════════════════════════════════════════════════════════════
-- GENERAZIONE IN DIFFERITA + NOTIFICHE PUSH/EMAIL (06/09/2026)
--
-- Decisione del committente: «l'utente non puo' stare ad aspettare: si dice
-- che la guida sara' creata, inviata alla sua email e salvata nel suo
-- archivio, e lui puo' lasciare la pagina e anche l'app». E le push servono
-- anche per comunicazioni col cliente.
--
-- Tre tabelle:
--   generazioni       la coda dei lavori (guida premium, itinerario): stato,
--                     parametri, crediti gia' addebitati, destinatari email
--                     aggiuntivi, risultato. La legge il client per mostrare
--                     «in preparazione» nell'Archivio; la scrive solo il server.
--   dispositivi_push  un token FCM per dispositivo, legato all'utente. Il
--                     client lo registra e lo cancella (proprio); il server lo
--                     legge per inviare. Token = dato personale: sparisce con
--                     l'account (ON DELETE CASCADE).
--   notifiche         registro di ogni notifica (push/email/in-app) per
--                     utente: serve all'inbox dell'app, alla notifica locale
--                     all'apertura («non lette») e al registro invii del
--                     pannello admin.
-- Piu' due preferenze sul profilo: push di servizio (sempre, salvo rifiuto
-- del sistema) e push promozionali (consenso esplicito, GDPR).
--
-- IDEMPOTENTE: si puo' applicare piu' volte.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.generazioni (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('guida', 'itinerario')),
  stato          text NOT NULL DEFAULT 'in_coda'
                 CHECK (stato IN ('in_coda', 'in_corso', 'pronta', 'fallita')),
  titolo         text,                       -- cosa si sta preparando, per l'Archivio
  parametri      jsonb NOT NULL,             -- il body della richiesta originale
  lingua         text NOT NULL DEFAULT 'IT',
  crediti        integer NOT NULL DEFAULT 0, -- gia' addebitati alla creazione
  email_extra    text[] NOT NULL DEFAULT '{}', -- altri destinatari scelti dall'utente (max 5)
  risultato_id   text,                       -- itinerary_guides.itinerary_hash | user_itineraries.id
  errore         text,
  tentativi      integer NOT NULL DEFAULT 0,
  avviata_at     timestamptz,
  pronta_at      timestamptz,
  notificata_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generazioni_user_created_idx ON public.generazioni (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generazioni_stato_idx ON public.generazioni (stato) WHERE stato IN ('in_coda', 'in_corso');

ALTER TABLE public.generazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "generazioni: lettura del proprietario" ON public.generazioni;
CREATE POLICY "generazioni: lettura del proprietario"
  ON public.generazioni FOR SELECT USING (auth.uid() = user_id);
-- Scrittura solo dal server (service role): i crediti si addebitano li'.

CREATE TABLE IF NOT EXISTS public.dispositivi_push (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  piattaforma   text NOT NULL CHECK (piattaforma IN ('android', 'ios', 'web')),
  lingua        text NOT NULL DEFAULT 'IT',
  created_at    timestamptz NOT NULL DEFAULT now(),
  visto_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispositivi_push_user_idx ON public.dispositivi_push (user_id);

ALTER TABLE public.dispositivi_push ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push: il proprietario gestisce i suoi dispositivi" ON public.dispositivi_push;
CREATE POLICY "push: il proprietario gestisce i suoi dispositivi"
  ON public.dispositivi_push FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.notifiche (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo          text NOT NULL DEFAULT 'servizio' CHECK (tipo IN ('servizio', 'promo')),
  titolo        text NOT NULL,
  corpo         text NOT NULL,
  dati          jsonb NOT NULL DEFAULT '{}'::jsonb, -- {azione:'archivio'|'coupon'|..., id:...}
  canali        text[] NOT NULL DEFAULT '{}',      -- canali su cui e' partita: push, email, inapp
  esito         jsonb NOT NULL DEFAULT '{}'::jsonb, -- per canale: ok / errore
  inviata_da    uuid,                              -- admin, se manuale
  letta_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifiche_user_created_idx ON public.notifiche (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifiche_non_lette_idx ON public.notifiche (user_id) WHERE letta_at IS NULL;

ALTER TABLE public.notifiche ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifiche: lettura del destinatario" ON public.notifiche;
CREATE POLICY "notifiche: lettura del destinatario"
  ON public.notifiche FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifiche: il destinatario segna come letta" ON public.notifiche;
CREATE POLICY "notifiche: il destinatario segna come letta"
  ON public.notifiche FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Preferenze: le push di servizio (guida pronta, rimborso, tour di gruppo)
-- restano attive salvo rifiuto del sistema operativo; le promozionali solo
-- con consenso esplicito, disattivabile dal profilo.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS push_servizio boolean NOT NULL DEFAULT true;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS push_promo    boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.generazioni IS 'Coda delle generazioni in differita (guide premium, itinerari): l''utente chiude l''app, il server finisce, salva in archivio e avvisa via email/push.';
COMMENT ON TABLE public.dispositivi_push IS 'Token FCM per dispositivo. Dato personale: cade con l''account.';
COMMENT ON TABLE public.notifiche IS 'Registro/inbox delle notifiche per utente (push, email, in-app).';
