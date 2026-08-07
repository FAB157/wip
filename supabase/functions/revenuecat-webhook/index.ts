import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const REVENUECAT_WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH'); // opzionale, per sicurezza

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    // 1. Verifica header di autenticazione di RevenueCat (se configurato)
    const authHeader = req.headers.get('Authorization');
    if (REVENUECAT_WEBHOOK_AUTH && authHeader !== `Bearer ${REVENUECAT_WEBHOOK_AUTH}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const payload = await req.json();
    const event = payload.event;

    // Ci interessa solo quando viene generata una ricevuta NON rimborsata (INITIAL_PURCHASE o NON_RENEWING_PURCHASE)
    if (event && (event.type === 'INITIAL_PURCHASE' || event.type === 'NON_RENEWING_PURCHASE')) {
      const appUserId = event.app_user_id; // Questo DEVE essere l'ID utente di Supabase
      const productId = event.product_id;  // es. itainta_500_credits
      const entitlementIds = event.entitlement_ids || []; 
      
      // Calcola quanti crediti dare in base all'entitlement o al prodotto
      let creditsToAdd = 0;
      if (productId.includes('500')) creditsToAdd = 500;
      else if (productId.includes('1100')) creditsToAdd = 1100;
      else if (productId.includes('2600')) creditsToAdd = 2600;

      if (creditsToAdd > 0 && appUserId) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        // 1. Leggi i crediti attuali
        const { data: profile } = await supabase.from('user_profiles').select('purchased_credits').eq('id', appUserId).single();
        const current = profile?.purchased_credits || 0;

        // 2. Aggiungi i crediti acquistati
        await supabase.from('user_profiles').update({ purchased_credits: current + creditsToAdd }).eq('id', appUserId);

        console.log(`[RevenueCat] Added ${creditsToAdd} credits to user ${appUserId}`);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
