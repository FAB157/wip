// DISMESSA — vulnerabilità critica (auth condizionale → crediti infiniti).
//
// L'auth qui era condizionale (`if (AUTH && ...)`) e la env si chiamava
// REVENUECAT_WEBHOOK_AUTH (diversa da quella su Vercel), quindi quasi
// certamente non impostata: il controllo era saltato e chiunque poteva
// accreditare crediti su qualsiasi account, in loop. Il webhook sicuro vive
// su Vercel (`POST /api/revenuecat/webhook`, segreto obbligatorio + accredito
// idempotente). RevenueCat deve puntare lì.
//
// AZIONE RICHIESTA: rimuovere la function deployata e aggiornare l'URL webhook
// su RevenueCat →
//   supabase functions delete revenuecat-webhook
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({ error: "gone", detail: "Usa /api/revenuecat/webhook su Vercel" }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  )
);
