// DISMESSA — vulnerabilità critica (prezzo e crediti scelti dal client).
//
// Questa edge function accettava priceCents e credits dal body: si potevano
// comprare 1.000.000 di crediti per €0,50. Il checkout sicuro vive ora su
// Vercel (`POST /api/stripe/create-checkout`, prezzo e crediti derivati
// server-side da CREDIT_PACKS) e il client (Pricing.tsx / ShopScreen.tsx) lo
// usa già. Questo file resta come tombstone: se venisse ridistribuito, non fa
// nulla di dannoso.
//
// AZIONE RICHIESTA: rimuovere la function deployata →
//   supabase functions delete stripe-checkout
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({ error: "gone", detail: "Usa /api/stripe/create-checkout" }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  )
);
