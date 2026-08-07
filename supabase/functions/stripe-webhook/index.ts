import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.5.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createCryptoProvider()

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')

  try {
    const body = await req.text()
    
    // Verifica che la richiesta provenga effettivamente da Stripe
    const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') as string
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature!,
        endpointSecret,
        undefined,
        cryptoProvider
      )
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`)
      return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const creditsToAdd = parseInt(session.metadata?.credits_to_add || "0", 10);

      if (userId && creditsToAdd > 0) {
        // Connetti a Supabase usando la chiave di servizio (Service Role) per bypassare RLS
        const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Aggiungi i crediti acquistati
        const { error } = await supabase.rpc('add_purchased_credits', {
          p_user_id: userId,
          p_amount: creditsToAdd
        });

        // Se la RPC non esiste, facciamo un update diretto (fallback)
        if (error) {
          console.log("RPC add_purchased_credits non trovata o in errore. Tento update diretto.");
          // Leggi bilancio attuale
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('purchased_credits')
            .eq('id', userId)
            .single();
            
          const currentCredits = profile?.purchased_credits || 0;
          
          await supabase
            .from('user_profiles')
            .update({ purchased_credits: currentCredits + creditsToAdd })
            .eq('id', userId);
        }

        console.log(`Successfully added ${creditsToAdd} credits to user ${userId}`);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`)
    return new Response(`Server Error`, { status: 500 })
  }
})
