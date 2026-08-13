// Supabase Edge Function: manager-poi
// Description: Architettura ORACLE & Protocollo Antigravity - Stage 2 Automation Motor with Free Night-Enrichment (Wikipedia, Wikidata, Wikimedia - No Google API Billing)
// Runtime: Deno

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function isGenericUtilityName(name?: string | null): boolean {
  if (!name) return true;
  const lower = name.trim().toLowerCase();
  
  // Generic single words
  const genericWords = [
    "parcheggio", "parco", "giardino", "giardinetti", "giardinetto", "villa",
    "parking", "park", "garden", "playground", "posteggio", "sosta", "stazionamento",
    "luogo d'interesse", "luogo d interesse", "area camper", "area sosta", "area di sosta", "sito", "punto"
  ];
  
  if (genericWords.includes(lower)) return true;

  // Generic combinations (starts with or is composed of generic terms)
  const genericRegex = /^(parcheggio|parco|giardino|giardini|giardinetto|giardinetti|parking|park|garden|area verde|area di sosta|area sosta|posteggio|sosta)\b/i;
  
  if (genericRegex.test(lower)) {
    const genericDescriptors = [
      "pubblico", "pubblici", "comunale", "comunali", "gratuito", "gratuiti", "pagamento", "privato", "privati",
      "riservato", "riservati", "clienti", "coperto", "scoperto", "cittadino", "cittadini", "auto", "camper",
      "moto", "disabili", "residenti", "gratis", "free", "public", "private", "custodito", "interrato", "multipiano"
    ];
    
    const words = lower.split(/\s+/);
    if (words.length <= 4) {
      const isAllGeneric = words.slice(1).every(w => genericDescriptors.includes(w) || w === "a" || w === "di" || w === "per" || w === "e");
      if (isAllGeneric) {
        return true;
      }
    }
  }

  return false;
}

// Utility to calculate distance between coordinates (in meters)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // returns distance in meters
}

// Utility to determine category from OSM tags
export function determineCategory(tags: Record<string, string>): string {
  if (!tags) return "monumenti";
  if (tags.historic === "castle" || tags.historic === "ruins" || tags.historic === "archaeological_site") return "castelli";
  if (tags.tourism === "museum" || tags.tourism === "gallery") return "musei";
  if (tags.amenity === "place_of_worship") return "chiese";
  if (tags.tourism === "artwork") return "artwork";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.historic === "monument" || tags.historic === "memorial" || tags.historic) return "monumenti";
  return "attraction";
}

serve(async (req) => {
  // CORS Preflight handle
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { 
      action = "enrich-now", // "discovery", "enrich-now", "batch-cron"
      place_id, 
      id,
      name, 
      lat, 
      lon, 
      category, 
      mode = "standard", // "standard" or "premium"
      lang = "it",
      poisList = [] // for "discovery" mode
    } = body;

    const requestLang = (lang || "it").toLowerCase();

    // Initialize Supabase Client with service role key for secure DB writes
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SICUREZZA: prima QUALSIASI chiamante con la anon key pubblica poteva
    // seminare/curare/sovrascrivere shared_pois con la service key (backdoor
    // scrittura globale). Ora serve la service role key (server/cron) o un JWT
    // di un utente ADMIN; la sola anon key pubblica viene rifiutata.
    {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY") || "";
      let authorized = !!token && !!supabaseKey && token === supabaseKey;
      if (!authorized && token && token !== anonKey) {
        try {
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) {
            const { data: prof } = await supabase
              .from("user_profiles").select("is_admin").eq("id", user.id).single();
            authorized = prof?.is_admin === true;
          }
        } catch (_e) { /* non autorizzato */ }
      }
      if (!authorized) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ==========================================
    // MODULE 1: DISCOVERY (Nearby Search Seeder)
    // ==========================================
    if (action === "discovery") {
      console.log(`[ORACLE Discovery] Processing discovery list of ${poisList.length} POIs`);
      const results = { seeded: 0, skipped: 0, errors: 0 };

      for (const item of poisList) {
        const { place_id: itemPlaceId, name: itemName, lat: itemLat, lon: itemLon, category: itemCat } = item;
        if (!itemName || itemLat === undefined || itemLon === undefined) {
          results.errors++;
          continue;
        }

        // Reject generic or unnamed parks and parkings universally
        if (isGenericUtilityName(itemName)) {
          results.skipped++;
          continue;
        }

        const numericLat = parseFloat(itemLat);
        const numericLon = parseFloat(itemLon);
        const latId = numericLat.toFixed(4).replace('.', '_');
        const lonId = numericLon.toFixed(4).replace('.', '_');
        
        // Multi-language isolated deterministic ID
        const coordId = `${latId}_${lonId}_${requestLang.toUpperCase()}`;

        // 1. Check if record exists in database
        let exists = false;
        if (itemPlaceId) {
          const { data } = await supabase
            .from("shared_pois")
            .select("id, is_locked")
            .eq("place_id", itemPlaceId)
            .eq("id", coordId)
            .maybeSingle();
          if (data) exists = true;
        }

        if (!exists) {
          const { data } = await supabase
            .from("shared_pois")
            .select("id, is_locked")
            .eq("id", coordId)
            .maybeSingle();
          if (data) exists = true;
        }

        // 2. If it exists, protect and skip it completely (do not overwrite!)
        if (exists) {
          results.skipped++;
          continue;
        }

        // 3. Save as pending (draft in Postgres)
        const pendingPoi = {
          id: coordId,
          place_id: itemPlaceId || null,
          name: itemName,
          lat: numericLat,
          lon: numericLon,
          category: itemCat || "monumenti",
          // Seed automatico: 'auto', MAI 'verified' (nessuna revisione umana).
          status: "auto",
          is_locked: false,
          flag_review: false,
          created_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from("shared_pois")
          .insert(pendingPoi);

        if (error) {
          console.error(`[ORACLE Discovery] Seed failed for ${itemName}:`, error.message);
          results.errors++;
        } else {
          results.seeded++;
        }
      }

      console.log(`[ORACLE Discovery] Discovery complete. Seeded: ${results.seeded}, Skipped: ${results.skipped}, Errors: ${results.errors}`);
      return new Response(JSON.stringify({ success: true, ...results }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // MODULE 3: BATCH ENRICHMENT (Asynchronous Night Cron - 100% Free: No Google)
    // ==========================================
    if (action === "batch-cron") {
      console.log("[ORACLE Batch Curation] Starting nightly batch enrichment loop (Google Bypass Mode)...");
      
      // Query oldest 10 POIs with status draft and not locked
      const { data: pendingPois, error: queryErr } = await supabase
        .from("shared_pois")
        .select("*")
        .eq("status", "draft")
        .eq("is_locked", false)
        .order("created_at", { ascending: true })
        .limit(10);

      if (queryErr) {
        throw new Error(`Failed to query pending POIs: ${queryErr.message}`);
      }

      if (!pendingPois || pendingPois.length === 0) {
        console.log("[ORACLE Batch Curation] No pending POIs found. Curation loop idle.");
        return new Response(JSON.stringify({ success: true, message: "No pending POIs found." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[ORACLE Batch Curation] Found ${pendingPois.length} pending POIs to enrich.`);
      const batchResults = [];

      for (const poi of pendingPois) {
        try {
          console.log(`[ORACLE Batch Curation] Process starting (FREE MODE) for: "${poi.name}"`);
          
          // Call enrichSinglePoi with useGoogle = false (5th parameter) for 100% free scraping
          const enriched = await enrichSinglePoi(supabase, poi, mode, requestLang, false);
          batchResults.push({ id: poi.id, name: poi.name, success: true, flag_review: enriched.flag_review });
          
          // Micro-pause (500ms) to respect API rate limits
          await new Promise(r => setTimeout(r, 500));
        } catch (poiErr) {
          console.error(`[ORACLE Batch Curation] Curation failed for "${poi.name}":`, poiErr.message);
          batchResults.push({ id: poi.id, name: poi.name, success: false, error: poiErr.message });
        }
      }

      return new Response(JSON.stringify({ success: true, processedCount: batchResults.length, details: batchResults }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // MODULE 4: COORDINATE LOOKUP & OSM FALLBACK (Antigravity Motore Intelligente)
    // ==========================================
    if (action === "lookup-coords") {
      if (lat === undefined || lon === undefined) {
        return new Response(JSON.stringify({ error: "Missing required parameters: lat, lon" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const numericLat = parseFloat(lat);
      const numericLon = parseFloat(lon);

      console.log(`[ORACLE Lookup-Coords] Internal database lookup for [${numericLat}, ${numericLon}]`);
      
      // Bounding box per velocizzare (50m ~ 0.00045 gradi lat, ~0.0006 gradi lon in Italia)
      const deltaLat = 0.00045;
      const deltaLon = 0.00045 / Math.cos(numericLat * Math.PI / 180);

      const { data: candidates, error: dbErr } = await supabase
        .from("shared_pois")
        .select("*")
        .gte("lat", numericLat - deltaLat)
        .lte("lat", numericLat + deltaLat)
        .gte("lon", numericLon - deltaLon)
        .lte("lon", numericLon + deltaLon);

      if (dbErr) {
        console.error("[ORACLE Lookup-Coords] Database query failed:", dbErr.message);
      }

      // Trova il candidato più vicino entro 50m
      let bestLocalMatch = null;
      let minLocalDistance = 50.0;

      if (candidates && candidates.length > 0) {
        for (const c of candidates) {
          const dist = haversineDistance(numericLat, numericLon, c.lat, c.lon);
          if (dist <= 50 && dist < minLocalDistance) {
            minLocalDistance = dist;
            bestLocalMatch = c;
          }
        }
      }

      if (bestLocalMatch) {
        console.log(`[ORACLE Lookup-Coords] Cache HIT! Found POI "${bestLocalMatch.name}" within ${minLocalDistance.toFixed(1)}m`);
        return new Response(JSON.stringify({
          name: bestLocalMatch.name,
          description_ai: bestLocalMatch.description_ai || bestLocalMatch.description_short || bestLocalMatch.description_long || "",
          image_url: bestLocalMatch.image_url || bestLocalMatch.photo_url || "",
          source: "DB",
          technical_data: bestLocalMatch.technical_data || {}
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. Fallback (External API - Overpass/OSM)
      console.log(`[ORACLE Lookup-Coords] Cache MISS. Querying Overpass API for [${numericLat}, ${numericLon}]`);
      
      const overpassQuery = `[out:json][timeout:15];
      (
        node(around:50,${numericLat},${numericLon})[tourism];
        way(around:50,${numericLat},${numericLon})[tourism];
        node(around:50,${numericLat},${numericLon})[historic];
        way(around:50,${numericLat},${numericLon})[historic];
        node(around:50,${numericLat},${numericLon})[amenity~"place_of_worship|museum|arts_centre|theatre|castle|monument"];
        way(around:50,${numericLat},${numericLon})[amenity~"place_of_worship|museum|arts_centre|theatre|castle|monument"];
      );
      out center tags;`;

      try {
        const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
        const overpassRes = await fetch(overpassUrl, {
          headers: { "User-Agent": "WIPWorldInPocket/2.0 (info@itaintasca.it)" }
        });

        if (!overpassRes.ok) {
          throw new Error(`Overpass API error: ${overpassRes.statusText}`);
        }

        const osmResult = await overpassRes.json();
        const elements = osmResult.elements || [];

        // Trova l'elemento OSM più vicino con un nome e entro 50m
        let bestOsmMatch = null;
        let minOsmDistance = 50.0;
        let matchLat = numericLat;
        let matchLon = numericLon;

        for (const el of elements) {
          const elLat = el.lat ?? el.center?.lat;
          const elLon = el.lon ?? el.center?.lon;
          if (elLat === undefined || elLon === undefined) continue;

          if (el.tags?.name) {
            const dist = haversineDistance(numericLat, numericLon, elLat, elLon);
            if (dist <= 50 && dist < minOsmDistance) {
              minOsmDistance = dist;
              bestOsmMatch = el;
              matchLat = elLat;
              matchLon = elLon;
            }
          }
        }

        if (bestOsmMatch) {
          console.log(`[ORACLE Lookup-Coords] OSM Match found: "${bestOsmMatch.tags.name}" within ${minOsmDistance.toFixed(1)}m`);
          
          const osmCategory = determineCategory(bestOsmMatch.tags);
          const latId = matchLat.toFixed(4).replace('.', '_');
          const lonId = matchLon.toFixed(4).replace('.', '_');
          const coordId = `${latId}_${lonId}_${requestLang.toUpperCase()}`;

          // Crea l'oggetto POI per l'arricchimento
          const osmPoi = {
            id: coordId,
            name: bestOsmMatch.tags.name,
            lat: matchLat,
            lon: matchLon,
            category: osmCategory,
            wikidata: bestOsmMatch.tags.wikidata || null,
            wikipedia: bestOsmMatch.tags.wikipedia || null,
            technical_data: {
              wikipedia: bestOsmMatch.tags.wikipedia || null,
              wikidata: bestOsmMatch.tags.wikidata || null,
              wikimedia: bestOsmMatch.tags.wikimedia_commons || null,
              osm_id: bestOsmMatch.id,
              osm_type: bestOsmMatch.type,
              osm_tags: bestOsmMatch.tags
            }
          };

          console.log(`[ORACLE Lookup-Coords] Auto-enriching OSM POI: "${osmPoi.name}"`);
          
          // Chiama enrichSinglePoi in modalità gratuita (useGoogle = false)
          const enrichedResult = await enrichSinglePoi(supabase, osmPoi, mode, requestLang, false);

          return new Response(JSON.stringify({
            name: enrichedResult.name,
            description_ai: enrichedResult.description_ai || enrichedResult.description_short || enrichedResult.description_long || "",
            image_url: enrichedResult.image_url || enrichedResult.photo_url || "",
            source: "OSM_FALLBACK",
            technical_data: enrichedResult.technical_data || {}
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } else {
          console.log("[ORACLE Lookup-Coords] No cultural/historic OSM elements found within 50m.");
          return new Response(JSON.stringify({
            error: "No POI found",
            message: "Nessun punto di interesse culturale o storico trovato entro 50 metri dalle coordinate fornite."
          }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

      } catch (osmErr: any) {
        console.error("[ORACLE Lookup-Coords] Overpass / Curation Fallback failed:", osmErr.message);
        return new Response(JSON.stringify({ error: osmErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ==========================================
    // MODULE 2: LAZY ENRICHMENT (Real-Time user click - Google Validated)
    // ==========================================
    if (action === "enrich-now") {
      if (!name || lat === undefined || lon === undefined) {
        return new Response(JSON.stringify({ error: "Missing required parameters: name, lat, lon" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reject generic or unnamed parks and parkings universally
      if (isGenericUtilityName(name)) {
        return new Response(JSON.stringify({ error: true, message: "Parcheggi e parchi generici o senza nome non sono ammessi alla curatela." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const numericLat = parseFloat(lat);
      const numericLon = parseFloat(lon);
      const latId = numericLat.toFixed(4).replace('.', '_');
      const lonId = numericLon.toFixed(4).replace('.', '_');
      
      // Multi-language isolated deterministic ID or exact passed ID to prevent duplicate coord constraint failures
      const coordId = id || `${latId}_${lonId}_${requestLang.toUpperCase()}`;

      // 1. Check database cache using multi-language isolated ID
      console.log(`[ORACLE Enrich-Now] Querying cache for isolated ID: "${coordId}"`);
      let cachedRecord = null;

      const { data } = await supabase
        .from("shared_pois")
        .select("*")
        .eq("id", coordId)
        .maybeSingle();
      cachedRecord = data;

      if (cachedRecord) {
        // If locked, return IMMEDIATELY (never overwrite locked data!)
        if (cachedRecord.is_locked) {
          console.log(`[ORACLE Enrich-Now] Record is locked (is_locked = TRUE). Returning cached copy.`);
          return new Response(JSON.stringify({ ...cachedRecord, from_cache: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // If already enriched and complete, return cache (Self-Healing logic for null columns).
        // Accetta anche 'auto' (la curatela automatica ora scrive 'auto', non
        // 'verified'): senza questo si ri-curava a ogni chiamata → costi inutili.
        if ((cachedRecord.status === "verified" || cachedRecord.status === "auto") && cachedRecord.description_long) {
          console.log(`[ORACLE Enrich-Now] Record already enriched and complete. Returning cached copy.`);
          return new Response(JSON.stringify({ ...cachedRecord, from_cache: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // 2. Perform Single POI Curation & Quality Checks
      const mockPoi = {
        id: coordId,
        place_id: place_id || cachedRecord?.place_id || null,
        name: name,
        lat: numericLat,
        lon: numericLon,
        category: category || cachedRecord?.category || "monumenti"
      };

      console.log(`[ORACLE Enrich-Now] Initiating synchronous lazy enrichment for: "${name}" in lang: "${requestLang.toUpperCase()}"`);
      
      // Call enrichSinglePoi with useGoogle = true (default) for premium geocoded validation
      const enrichedResult = await enrichSinglePoi(supabase, mockPoi, mode, requestLang, true);

      return new Response(JSON.stringify({
        ...enrichedResult,
        from_cache: false,
        synthesis_mode: mode
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unsupported action: ${action}`);

  } catch (err: any) {
    // Dettaglio solo nei log; al client un messaggio generico.
    console.error("[ORACLE Manager POI] Server execution error:", err.message);
    return new Response(JSON.stringify({ error: "manager_poi_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Free Wikimedia Commons search helper
async function fetchWikimediaCommonsImage(name: string): Promise<string | null> {
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const fileName = searchData.query?.search?.[0]?.title;
      if (fileName && fileName.startsWith("File:")) {
        const cleanName = fileName.substring(5);
        return `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${encodeURIComponent(cleanName.replace(/ /g, "_"))}&width=800`;
      }
    }
  } catch (e) {
    console.warn("[Wikimedia Commons] Search failed:", e.message);
  }
  return null;
}

// Centralized Enrichment & Quality Gates Logic
async function enrichSinglePoi(supabase: any, poi: any, mode: string, lang: string, _useGoogle: boolean = false) {
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY");

  if (!geminiKey) throw new Error("Missing Gemini API Key");

  let resolvedPlaceId = poi.place_id || "";
  let resolvedName = poi.name;
  let resolvedLat = poi.lat;
  let resolvedLon = poi.lon;
  let googleEditorial = "";
  let imageUrl = "";

  console.log(`[ORACLE Curation] Google Places BYPASSED (100% Free Mode) for "${resolvedName}"`);

  // 2. Wikipedia & Wikidata Scraping (FREE SOURCES)
  let wikipediaExtract = "";
  let technicalDetails = "";

  const resolvedWikidata = poi.wikidata || poi.technical_data?.wikidata || null;
  const resolvedWikipedia = poi.wikipedia || poi.technical_data?.wikipedia || null;

  try {
    let pageTitle = null;
    let langCode = lang;

    if (resolvedWikipedia) {
      langCode = resolvedWikipedia.includes(":") ? resolvedWikipedia.split(":")[0] : lang;
      pageTitle = resolvedWikipedia.includes(":") ? resolvedWikipedia.split(":").slice(1).join(":") : resolvedWikipedia;
    } else {
      const wikiSearchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(resolvedName)}&format=json&origin=*`;
      const wikiSearchRes = await fetch(wikiSearchUrl);
      if (wikiSearchRes.ok) {
        const wikiSearchData = await wikiSearchRes.json();
        pageTitle = wikiSearchData.query?.search?.[0]?.title;
      }
    }

    if (pageTitle) {
      const wikiSummaryUrl = `https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;
      const wSummaryRes = await fetch(wikiSummaryUrl, { headers: { "User-Agent": "WIPWorldInPocket/1.0" } });
      if (wSummaryRes.ok) {
        const wSummaryData = await wSummaryRes.json();
        if (wSummaryData.extract) {
          wikipediaExtract = wSummaryData.extract;
        }
        // Extract Wikipedia image if Google photo is bypassed/missing
        if (!imageUrl && (wSummaryData.originalimage?.source || wSummaryData.thumbnail?.source)) {
          imageUrl = wSummaryData.originalimage?.source || wSummaryData.thumbnail?.source;
          console.log(`[ORACLE Curation] Wikipedia Image resolved: ${imageUrl}`);
        }
      }
    }
  } catch (wikiErr) {
    console.warn(`[ORACLE Curation] Wikipedia lookup failed for ${resolvedName}:`, wikiErr.message);
  }

  // Fetch free image from Wikimedia Commons as fallback
  if (!imageUrl) {
    const wikimediaUrl = await fetchWikimediaCommonsImage(resolvedName);
    if (wikimediaUrl) {
      imageUrl = wikimediaUrl;
      console.log(`[ORACLE Curation] Wikimedia Commons Image resolved: ${imageUrl}`);
    }
  }

  // Wikidata & Overpass scraping in Premium Mode
  if (mode === "premium") {
    try {
      let wikibaseItem = resolvedWikidata;
      if (!wikibaseItem) {
        const wikiSearchQUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(resolvedName)}&format=json&origin=*`;
        const qRes = await fetch(wikiSearchQUrl);
        if (qRes.ok) {
          const qData = await qRes.json();
          const pages = qData.query?.pages;
          if (pages) {
            const firstPageId = Object.keys(pages)[0];
            wikibaseItem = pages[firstPageId]?.pageprops?.wikibase_item;
          }
        }
      }

      if (wikibaseItem) {
        const wdUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikibaseItem}&languages=${lang}|en&format=json&origin=*`;
        const wdRes = await fetch(wdUrl);
        if (wdRes.ok) {
          const wdData = await wdRes.json();
          const desc = wdData.entities?.[wikibaseItem]?.descriptions?.[lang]?.value;
          if (desc) technicalDetails += `Wikidata Description: ${desc}. `;
        }
      }
    } catch (e) {
      console.warn("[ORACLE Curation] Wikidata resolution failed:", e.message);
    }

    try {
      const overpassQuery = `[out:json][timeout:15];(node(around:50,${resolvedLat},${resolvedLon})[historic];way(around:50,${resolvedLat},${resolvedLon})[historic];);out tags;`;
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
      const overpassRes = await fetch(overpassUrl);
      if (overpassRes.ok) {
        const overpassData = await overpassRes.json();
        const tags = overpassData.elements?.[0]?.tags || {};
        let tagsStr = "";
        for (const [k, v] of Object.entries(tags)) {
          if (["style", "material", "religion", "building"].includes(k)) tagsStr += `${k}=${v}; `;
        }
        if (tagsStr) technicalDetails += `OSM Tags: ${tagsStr}`;
      }
    } catch (e) {
      console.warn("[ORACLE Curation] Overpass lookup failed:", e.message);
    }
  }

  // Language mapping helper for explicit Gemini prompt commands
  const langNames: Record<string, string> = {
    it: "italiano (Italian)",
    en: "inglese (English)",
    fr: "francese (French)",
    es: "spagnolo (Spanish)",
    ru: "russo (Russian)",
    zh: "cinese (Chinese)",
    de: "tedesco (German)"
  };
  const targetLangName = langNames[lang.toLowerCase()] || "italiano (Italian)";

  // 3. Gemini Curation Synthesis (Dynamically localized)
  const systemPrompt = `Sei l'AI engine di WIP - World in Pocket. Generi schede descrittive per monumenti reali in modalità "${mode}".
Tutto il testo inserito nel JSON (descrizione breve, descrizione lunga, script audio breve, script audio lungo) DEVE essere generato e scritto rigorosamente nella lingua: "${targetLangName}". Non tradurre i nomi propri se non è consuetudine farlo in "${targetLangName}".

REGOLE PER IL CONTENUTO:
1. Modalità "standard": Crea una descrizione breve, affascinante, fattuale e fluida composta TASSATIVAMENTE da 2 frasi storiche precise scritte nella lingua "${targetLangName}". Evita frasi introduttive o riassuntive generiche.
2. Modalità "premium": Crea una descrizione immersiva di "Deep Storytelling" ricca di narrazione storica, aneddoti curiosi, stile architettonico, dettagli culturali, e note artistiche (massimo 180 parole) in lingua "${targetLangName}".
3. "audio_script_short": Un testo in lingua "${targetLangName}" ottimizzato per la lettura vocale sintetica di 15 secondi, fluido, colloquiale e privo di elenchi o parentesi.
4. "audio_script_long": Una magnifica e accattivante narrazione in lingua "${targetLangName}" per audioguida immersiva di 45 secondi, scritta in prima persona o da guida esperta coinvolgente, ricca di ritmo e pause naturali.

REGOLA DI SICUREZZA ANTI-ALLUCINAZIONE:
Affidati ESCLUSIVAMENTE alle informazioni verificate fornite nel testo delle fonti esterne. Non inventare dati, re storici o eventi se non sono esplicitamente citati nelle fonti.

Rispondi TASSATIVAMENTE ed esclusivamente con un singolo oggetto JSON valido avente questo esatto schema, non aggiungere markdown o spiegazioni esterne:
{
  "name": "Nome Corretto Monumento",
  "description_short": "Sintesi breve nella lingua ${targetLangName} (max 2 frasi)...",
  "description_long": "Storytelling dettagliato nella lingua ${targetLangName}...",
  "audio_script_short": "Script audio breve nella lingua ${targetLangName}...",
  "audio_script_long": "Script audio immersivo lungo nella lingua ${targetLangName}..."
}`;

  const curatorPrompt = `${systemPrompt}
Nome: "${resolvedName}"
Google: "${googleEditorial || 'Bypassed'}"
Wikipedia: "${wikipediaExtract}"
Dati Tecnici: "${technicalDetails}"`;

  const aiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: curatorPrompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    }
  );

  if (!aiResponse.ok) throw new Error(`Gemini synthesis failed: ${aiResponse.statusText}`);

  const aiResult = await aiResponse.json();
  const aiText = aiResult.candidates?.[0]?.content?.parts?.[0]?.text;
  const synthesis = JSON.parse(aiText || "{}");

  if (!synthesis.description_short) {
    throw new Error("Gemini returned invalid or empty JSON schema");
  }

  // 4. QUALITY GATES & VERIFICATION PIPELINE
  const isTooShort = (synthesis.description_short || "").length < 100;
  const isMissingPhoto = !imageUrl;
  const flagReview = isTooShort || isMissingPhoto;

  const finalUpsertData = {
    id: poi.id,
    place_id: resolvedPlaceId || null,
    name: synthesis.name || resolvedName,
    lat: resolvedLat,
    lon: resolvedLon,
    category: poi.category || "monumenti",
    description_ai: synthesis.description_short,
    description_short: synthesis.description_short,
    description_long: synthesis.description_long || synthesis.description_short,
    photo_url: imageUrl || `https://source.unsplash.com/800x600/?${encodeURIComponent(resolvedName + ' Italy')}`,
    image_url: imageUrl || `https://source.unsplash.com/800x600/?${encodeURIComponent(resolvedName + ' Italy')}`,
    // Curatela automatica → 'auto', MAI 'verified' (la revisione umana): prima
    // promuoveva a verified anche contenuti generati/potenzialmente allucinati.
    status: "auto",
    is_locked: false,
    flag_review: flagReview,
    last_reviewed_at: new Date().toISOString()
  };

  console.log(`[ORACLE Quality Gates] POI Curation complete (Free Mode):`);
  console.log(`  - Text length: ${(synthesis.description_short || "").length} chars (gate fail: ${isTooShort})`);
  console.log(`  - Photo URL resolved: ${!!imageUrl}`);
  console.log(`  - flag_review = ${flagReview}`);

  const { error: dbErr } = await supabase
    .from("shared_pois")
    .upsert(finalUpsertData, { onConflict: "id" });

  if (dbErr) {
    throw new Error(`Supabase persistence failed: ${dbErr.message}`);
  }

  return finalUpsertData;
}
