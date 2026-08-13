// DISMESSA — webhook Stripe NON idempotente (nessuna deduplica sugli event_id).
//
// Questa edge function accreditava crediti a ogni consegna dell'evento Stripe:
// Stripe RIPETE gli eventi (retry, at-least-once), quindi lo stesso acquisto
// poteva accreditare crediti più volte. Leggeva inoltre `metadata.credits_to_add`,
// una chiave che il checkout attuale non imposta più (quindi era anche già di
// fatto inerte). Il webhook sicuro e IDEMPOTENTE vive ora su Vercel
// (`POST /api/stripe/webhook`, con guardia (source,event_id)); è l'UNICO che
// deve processare gli eventi Stripe. Come stripe-checkout/revenuecat-webhook,
// questo file resta un tombstone: se ridistribuito, non fa nulla di dannoso.
//
// AZIONE RICHIESTA: puntare l'endpoint webhook Stripe al gestore Vercel e
// rimuovere la function deployata →  supabase functions delete stripe-webhook
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({ error: "gone", detail: "Il webhook Stripe è gestito (idempotente) da /api/stripe/webhook" }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  )
);
