-- =====================================================================
-- COUPON: un riscatto per persona, premio in crediti, scadenza.
-- 05/09/2026.
--
-- Perche' adesso: i coupon nascevano come voucher da dare a mano in hotel
-- (un codice, una persona). Il committente li usera' per CAMPAGNE SOCIAL:
-- il codice finisce pubblico su Instagram o Facebook, e con esso cambia
-- il profilo di rischio.
--
-- Tre difetti chiusi qui, tutti verificati sul database di produzione:
--
-- 1. NESSUN CONTROLLO SU CHI RISCATTA. /api/coupon/redeem guardava solo il
--    contatore globale uses_count contro max_uses. Con un codice pubblico e
--    max_uses=1000, la prima persona che lo prova puo' incollarlo mille
--    volte e prendersi tutti i riscatti. Non serve alcuna competenza: basta
--    ripremere «Attiva».
--
-- 2. `reward_credits` NON ESISTE come colonna, ma AdminCouponForm la manda
--    nell'upsert e il server la legge (`coupon.reward_credits || ...`). Il
--    form gestisce l'assenza di expires_at con un ripiego, non quella di
--    reward_credits: quindi creare un coupon dal pannello FALLISCE. E'
--    il motivo per cui la tabella coupons e' vuota.
--
-- 3. `expires_at` NON ESISTE. Un codice di una campagna di settembre resta
--    valido a Natale, quando chi lo trova non e' piu' il pubblico voluto.
--
-- Additiva e reversibile: nessuna colonna rimossa, nessun dato riscritto.
-- La tabella coupons e' vuota, quindi non c'e' nulla da migrare.
-- =====================================================================

-- --- 1. Le due colonne che il codice gia' si aspetta ------------------
alter table public.coupons
  add column if not exists reward_credits integer,
  add column if not exists expires_at     timestamptz;

comment on column public.coupons.reward_credits is
  'Crediti regalati dal coupon. Se NULL il server ripiega su duration_days*10 (eredita'' dell''epoca «giorni premium») e infine su 500.';
comment on column public.coupons.expires_at is
  'Scadenza. NULL = nessuna scadenza. Il riscatto rifiuta i codici scaduti.';

-- --- 2. Un riscatto per persona per coupon ----------------------------
-- Il vincolo di unicita' e' la difesa VERA: anche se due richieste della
-- stessa persona arrivano nello stesso istante, la seconda insert viola il
-- vincolo e il server risponde «gia' riscattato». Un controllo fatto solo
-- leggendo prima di scrivere sarebbe aggirabile con due click simultanei.
create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid        not null references public.coupons(id) on delete cascade,
  user_id     uuid        not null references auth.users(id)     on delete cascade,
  credits     integer     not null,
  redeemed_at timestamptz not null default now(),
  constraint coupon_redemptions_una_per_persona unique (coupon_id, user_id)
);

comment on table public.coupon_redemptions is
  'Chi ha riscattato quale coupon. Il vincolo unico (coupon_id, user_id) impedisce il riscatto multiplo dello stesso codice da parte della stessa persona: indispensabile da quando i codici si pubblicano sui social.';

create index if not exists coupon_redemptions_user_idx   on public.coupon_redemptions (user_id);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);

-- --- 3. Nessuno legge o scrive questa tabella dal client ---------------
-- Ci passa solo il server con la service key, che salta le policy. Senza
-- RLS attiva la tabella sarebbe leggibile con la chiave anonima: si
-- saprebbe chi ha riscattato cosa. RLS accesa e nessuna policy = porta
-- chiusa per tutti tranne il servizio.
alter table public.coupon_redemptions enable row level security;
