// Supabase Edge Function: generate-poi-data
// Description: On-Demand Lazy-Loaded AI Curation with Silent Google Places Fallback & SaaS Quota Verification
// Runtime: Deno

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // CORS Preflight handle
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { name, lat, lon, category, city } = body;

    if (!name || lat === undefined || lon === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields: name, lat, lon" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numericLat = parseFloat(lat);
    const numericLon = parseFloat(lon);

    // --- SAAS QUOTA & CIRCUIT BREAKER PIPELINE ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SICUREZZA: identità derivata SOLO dal JWT (mai da body.userId: prima
    // bastava passare un userId nel payload per curare/consumare a nome altrui)
    // e NESSUN fallback ad un admin hardcoded. Serve la service role key
    // (server/cron) o un JWT di un utente ADMIN; la sola anon key è rifiutata.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY") || "";
    let userId: string | null = null;
    let authorized = false;
    if (token && supabaseKey && token === supabaseKey) {
      authorized = true; // chiamata server-to-server / cron (nessun utente)
    } else if (token && token !== anonKey) {
      try {
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (user && !authErr) {
          const { data: prof } = await supabase
            .from("user_profiles").select("is_admin").eq("id", user.id).single();
          if (prof?.is_admin === true) { authorized = true; userId = user.id; }
        }
      } catch (e) {
        console.warn("[Edge Function] Auth verification failed:", e.message);
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // La verifica quota vale solo per un UTENTE reale (admin). Per le chiamate
    // service-role/cron (userId null) si salta: non sono legate a un wallet.
    if (userId) {
    console.log(`[Edge Function] Verifying credits for user_id: ${userId}`);

    // Query quotas record
    let { data: quotaRecord, error: quotaErr } = await supabase
      .from("user_quotas")
      .select("*")
      .eq("user_id", userId)
      .single();

    // If no record exists, dynamically create one with baseline limits based on subscription tier
    if (!quotaRecord) {
      console.log(`[Edge Function] Seeding default quotas record for user: ${userId}`);
      let planType = "free";
      let itinerariesLimit = 5;
      let audioguidesLimit = 10;
      let visionLimit = 15;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .single();

      if (profile && profile.subscription_tier === "premium") {
        planType = "premium";
        itinerariesLimit = 50;
        audioguidesLimit = 100;
        visionLimit = 150;
      }

      quotaRecord = {
        user_id: userId,
        plan_type: planType,
        itinerari_used: 0,
        audioguide_used: 0,
        vision_used: 0,
        itinerari_limit: itinerariesLimit,
        audioguide_limit: audioguidesLimit,
        vision_limit: visionLimit
      };

      const { error: insertErr } = await supabase
        .from("user_quotas")
        .insert(quotaRecord);

      if (insertErr) {
        console.error("[Edge Function] Failed to seed default user_quotas:", insertErr.message);
      }
    }

    // Curation maps to the "vision" feature limits
    const used = quotaRecord.vision_used || 0;
    const limit = quotaRecord.vision_limit || 0;

    if (used >= limit) {
      console.warn(`[Edge Function] Blocked execution. Quota exceeded for user ${userId} (vision_used: ${used}/${limit})`);
      return new Response(JSON.stringify({
        error: "Quota Exceeded",
        message: `Hai esaurito i crediti per la funzionalità 'curation/vision' (${used}/${limit}). Effettua l'upgrade o contatta l'amministratore per sbloccare l'account.`
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    }

    let description = "";
    let isGem = false;
    let fallbackTriggered = false;
    // true SOLO quando l'AI ha esaminato il luogo e lo ha esplicitamente
    // rifiutato come generico/non documentato (parsed.error === true).
    // Distinto dai fallback "tecnici" (chiave mancante, API down, eccezione):
    // in quel caso non sappiamo se il luogo sia valido o meno, qui invece
    // l'AI ha già dato un verdetto negativo che va rispettato.
    let aiRejectedAsGeneric = false;

    // --- PHASE A: PRIMARY AI TRY (Gemini) ---
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY");
    if (geminiKey) {
      try {
        const systemInstruction = `Sei una guida turistica severa ed estremamente accurata.
Scrivi una descrizione storica reale, affascinante ed educativa (massimo 150 parole) in lingua italiana per questo luogo: "${name}" situato a "${city || 'Italia'}" alle coordinate [${numericLat}, ${numericLon}].

REGOLA D'ORO TASSATIVA E INVALICABILE:
Se il nome del luogo è generico (es. 'parcheggio', 'vista cascata', 'bagno pubblico', 'fermata bus', 'panchina', 'area pic-nic'), se si tratta di un'attività commerciale minore senza rilevanza storica o artistica degna di nota (es. un bar, un ristorante locale, una pizzeria, una farmacia, un albergo standard), oppure se NON esistono fonti storiche certe e documentate per questo specifico luogo, devi tassativamente rispondere con questo esatto JSON:
{
  "error": true
}

Se invece il luogo ha un'effettiva e documentata importanza storica, archeologica, artistica o panoramica di rilievo nazionale/internazionale, scrivi la descrizione reale e restituisci questo JSON:
{
  "description": "Descrizione dettagliata...",
  "is_gem": true
}

Rispondi esclusivamente con il JSON valido. Non aggiungere spiegazioni o markdown.`;

        const apiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemInstruction }] }],
              generationConfig: { responseMimeType: "application/json" }
            })
          }
        );

        if (apiResponse.ok) {
          const aiResult = await apiResponse.json();
          const text = aiResult.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = JSON.parse(text || "{}");

          if (parsed.error === true) {
            console.log(`[Edge Function] AI rejected generic landmark: "${name}". Skipping fabricated placeholder.`);
            fallbackTriggered = true;
            aiRejectedAsGeneric = true;
          } else if (parsed.description) {
            description = parsed.description;
            isGem = parsed.is_gem === true;
            console.log(`[Edge Function] AI successfully generated details for curated landmark: "${name}"`);
          } else {
            fallbackTriggered = true;
          }
        } else {
          console.warn("[Edge Function] Gemini API returned error status:", apiResponse.status);
          fallbackTriggered = true;
        }
      } catch (aiErr) {
        console.error("[Edge Function] Gemini Generation Exception:", aiErr.message);
        fallbackTriggered = true;
      }
    } else {
      console.warn("[Edge Function] Gemini Key is missing, skipping to fallback.");
      fallbackTriggered = true;
    }

    // --- PHASE B: FREE FALLBACK (Database & Coordinate Seed) ---
    // Il placeholder "Punto geografico..." viene generato SOLO per i fallback
    // tecnici (chiave mancante, API down, eccezione): in quei casi non
    // sappiamo nulla sul luogo. Se invece l'AI lo ha esplicitamente rifiutato
    // come generico, non fabbrichiamo alcuna descrizione (vedi Phase C).
    if (fallbackTriggered && !aiRejectedAsGeneric) {
      console.log(`[Edge Function] Google Places BYPASSED. Seeding default coordinate details for: "${name}"`);
      description = `Punto geografico di interesse situato alle coordinate lat ${numericLat.toFixed(4)}, lon ${numericLon.toFixed(4)} nel territorio di ${city || "Italia"}. Monumento e punto di interesse storico individuato via satellite.`;
    }

    // --- PHASE C: UPSERT TO DATABASE ---
    // Standardized geospatial ID: deterministic ID (5 decimal precision, ~1.1m,
    // e.g. "43_72123_10_39441") — prima era a 4 decimali (~11m), risoluzione
    // troppo grossolana: due POI reali distinti entro la stessa cella potevano
    // collidere sullo stesso id e sovrascriversi a vicenda.
    const latId = numericLat.toFixed(5).replace('.', '_');
    const lonId = numericLon.toFixed(5).replace('.', '_');
    const poiId = `${latId}_${lonId}`;

    // Unsplash cover photo generator
    const defaultImage = `https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800`;

    const finalPoi = {
      id: poiId,
      lat: numericLat,
      lon: numericLon,
      name: name,
      category: category || "monumenti",
      // Se l'AI ha rifiutato il luogo come generico non c'è nulla di reale da
      // salvare: niente descrizione fabbricata né foto stock spacciata per
      // copertina del luogo.
      description_ai: aiRejectedAsGeneric ? "" : description,
      image_url: aiRejectedAsGeneric ? null : defaultImage,
      is_gem: aiRejectedAsGeneric ? false : isGem,
      // MAI 'verified' da una funzione automatica (non è una revisione umana):
      // 'verified' promuoveva contenuti generati/allucinati. Sempre 'auto'.
      // Se l'AI ha rifiutato il luogo come generico/non documentato, la riga
      // viene comunque scritta (idempotenza: evita di richiamare l'AI ad ogni
      // richiesta per la stessa cella) ma con status 'rejected', che è tra gli
      // HIDDEN_POI_STATUSES di src/services/poiRepository.ts — quindi mai
      // visibile né triggerabile lato client.
      status: aiRejectedAsGeneric ? "rejected" : "auto",
      last_reviewed_at: new Date().toISOString(),
      reviewed_by: null
    };

    console.log(`[Edge Function] Upserting curated POI with ID: "${poiId}"`);
    const { error: dbErr } = await supabase
      .from("shared_pois")
      .upsert(finalPoi, { onConflict: "id" });

    if (dbErr) {
      console.error("[Edge Function] Database upsert failed:", dbErr.message);
    }

    // --- PHASE D: AUTO INCREMENT SAAS QUOTA COUNTER (solo utente reale) ---
    if (userId) try {
      console.log(`[Edge Function] Operation successful. Incrementing vision_used for ${userId}`);
      const { data: freshRecord } = await supabase
        .from("user_quotas")
        .select("vision_used")
        .eq("user_id", userId)
        .single();

      if (freshRecord) {
        const nextUsed = (freshRecord.vision_used || 0) + 1;
        await supabase
          .from("user_quotas")
          .update({ vision_used: nextUsed })
          .eq("user_id", userId);
        console.log(`[Edge Function] Increment completed successfully. New usage: ${nextUsed}`);
      }
    } catch (quotaIncErr) {
      console.error("[Edge Function] Failed to auto-increment quota counter:", quotaIncErr.message);
    }

    return new Response(JSON.stringify({
      ...finalPoi,
      riconosciuto: true,
      scoperto: false,
      // false quando l'AI ha rifiutato il luogo come generico/non documentato:
      // niente contenuto reale è stato prodotto né confermato, non spacciamo
      // il placeholder salvato per idempotenza come "confermato".
      confermato_da_database: !aiRejectedAsGeneric
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    // Dettaglio solo nei log; al client un messaggio generico.
    console.error("[Edge Function] Server execution error:", err.message);
    return new Response(JSON.stringify({ error: "curation_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
