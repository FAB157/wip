/**
 * MIGRAZIONE: shared_poi_audio_cache
 * Aggiunge colonne per supporto multi-lingua e multi-guida (cache-first)
 * 
 * Prima:  poi_id | audio_base64 | created_at
 * Dopo:   poi_id | lang | guide_mode | audio_base64 | description | image_url | 
 *         wiki_data | created_at | updated_at
 * 
 * Logica cache-first:
 *   Chiave unica: (poi_id, lang, guide_mode)
 *   → Una volta prodotta la scheda/audio in IT-nicky, tutti gli utenti IT la trovano già pronta
 */
const { Client } = require('pg');
const client = new Client({
  user: 'postgres.qfxxhzkkrkvbuekfknhh',
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  database: 'postgres',
  password: 'Maf,Chj/S.2Jx8x',
  port: 6543,
});

const migration = `
-- 1. Aggiungi colonne mancanti (idempotente)
ALTER TABLE public.shared_poi_audio_cache
  ADD COLUMN IF NOT EXISTS lang        TEXT NOT NULL DEFAULT 'it',
  ADD COLUMN IF NOT EXISTS guide_mode  TEXT NOT NULL DEFAULT 'nicky',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS wiki_data   JSONB,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- 2. Rimuovi la vecchia chiave primaria (solo poi_id)
ALTER TABLE public.shared_poi_audio_cache DROP CONSTRAINT IF EXISTS shared_poi_audio_cache_pkey;

-- 3. Crea nuova chiave unica composta: (poi_id, lang, guide_mode)
--    → chiave cache-first: la stessa audioguida in IT-nicky è condivisa tra tutti gli utenti IT
ALTER TABLE public.shared_poi_audio_cache 
  ADD CONSTRAINT shared_poi_audio_cache_pkey 
  PRIMARY KEY (poi_id, lang, guide_mode);

-- 4. Indici per lookup veloce
CREATE INDEX IF NOT EXISTS idx_audio_cache_poi_lang 
  ON public.shared_poi_audio_cache (poi_id, lang);

CREATE INDEX IF NOT EXISTS idx_audio_cache_lang_mode 
  ON public.shared_poi_audio_cache (lang, guide_mode);

-- 5. RLS: tutti possono leggere, solo service_role può scrivere
ALTER TABLE public.shared_poi_audio_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audio_cache_read" ON public.shared_poi_audio_cache;
CREATE POLICY "audio_cache_read" ON public.shared_poi_audio_cache
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "audio_cache_write" ON public.shared_poi_audio_cache;
CREATE POLICY "audio_cache_write" ON public.shared_poi_audio_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);
`;

client.connect()
  .then(() => {
    console.log('✅ Connesso a Supabase');
    return client.query(migration);
  })
  .then(() => {
    console.log('✅ Migrazione shared_poi_audio_cache completata!');
    console.log('');
    console.log('📐 Nuova struttura:');
    console.log('   poi_id     (TEXT)  → ID del POI');
    console.log('   lang       (TEXT)  → Lingua: it, en, fr, es, ru, zh');
    console.log('   guide_mode (TEXT)  → Guida: nicky | dante');
    console.log('   audio_base64 (TEXT) → Audio TTS generato');
    console.log('   description (TEXT) → Scheda testo per questa lingua');
    console.log('   image_url   (TEXT) → Foto principale');
    console.log('   wiki_data   (JSONB) → Metadati Wikipedia/Wikidata');
    console.log('   created_at  (TIMESTAMPTZ)');
    console.log('   updated_at  (TIMESTAMPTZ)');
    console.log('');
    console.log('🔑 Chiave cache: (poi_id, lang, guide_mode)');
    console.log('   Es: ("osm-12345", "it", "nicky") → prodotta 1 volta, usata da tutti gli utenti IT');
    return client.end();
  })
  .catch(e => {
    console.error('❌ Errore:', e.message);
    client.end();
  });
