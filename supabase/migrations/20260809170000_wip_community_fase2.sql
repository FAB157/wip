-- ─────────────────────────────────────────────────────────────────────────
-- WIP COMMUNITY — Fase 2/3: revisione admin, foto private, pubblicazione.
-- DA APPLICARE A MANO su Supabase (SQL editor), DOPO la
-- 20260809150000_wip_community_vision.sql.
-- ─────────────────────────────────────────────────────────────────────────
set lock_timeout = '5s';

-- 1) Foto pubblicata: URL nel bucket PUBBLICO vision-public della versione
--    approvata (ripulita) — usata dal POI community e dal feed anonimo.
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS published_photo_url text;

-- Backfill: schede create prima che le colonne di revisione esistessero
-- (il server ha un retry "sole colonne storiche") → entrano in coda.
UPDATE vision_cards SET review_status = 'pending' WHERE review_status IS NULL;
UPDATE vision_cards SET recognized = true WHERE recognized IS NULL;

-- 2) Bucket PUBBLICO per le foto approvate: l'originale dell'utente non
--    viene mai esposto — si pubblica una COPIA (eventualmente ripulita).
INSERT INTO storage.buckets (id, name, public)
VALUES ('vision-public', 'vision-public', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Il bucket degli originali diventa PRIVATO ("senza censure restano solo
--    nell'account dell'utente"). Le nuove foto sono salvate in cartelle
--    per-utente (<uid>/<card>.jpg): la policy sotto consente all'utente di
--    firmare/leggere SOLO la propria cartella. Il server (service role)
--    continua a leggere tutto.
UPDATE storage.buckets SET public = false WHERE id = 'vision-photos';

DROP POLICY IF EXISTS "vision_photos_owner_read" ON storage.objects;
CREATE POLICY "vision_photos_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vision-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Nota: eventuali foto caricate alla RADICE del bucket tra le due migration
-- (senza cartella utente) non sono più leggibili dal client — solo il
-- server le vede. Impatto atteso: nullo o quasi (finestra di poche ore).
