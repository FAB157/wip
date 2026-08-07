// Supabase Edge Function: auto-enrich-poi
// =========================================
// Si attiva su INSERT in shared_pois via Database Webhook / pg_net
// Arricchisce automaticamente con:
//   - Wikipedia (testo esatto dal tag OSM)
//   - Wikidata (dati tecnici: anno, architetto, stile)
//   - WikiVoyage (destinazione via geosearch coordinate)
//   - Wikimedia Commons (immagine)
//   - audio_script (testo pronto per TTS)
//
// Deploy: supabase functions deploy auto-enrich-poi

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── HTTP helper ────────────────────────────────────────────────────────
async function httpGet(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ItaInTasca/4.0 (info@itaintasca.it)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Wikipedia ─────────────────────────────────────────────────────────
async function fetchWikipedia(wpTag: string) {
  try {
    const langCode = wpTag.includes(":") ? wpTag.split(":")[0] : "it";
    const title    = wpTag.includes(":") ? wpTag.split(":").slice(1).join(":") : wpTag;
    const url = `https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    const data = await httpGet(url);
    if (!data || !data.extract || data.type?.includes("not_found")) return null;
    return {
      extract:   data.extract as string,
      thumbnail: data.thumbnail?.source as string | null || null,
      url:       data.content_urls?.desktop?.page as string | null || null,
    };
  } catch { return null; }
}

// ── Wikidata ──────────────────────────────────────────────────────────
async function resolveQidLabel(qid: string): Promise<string | null> {
  if (!qid?.startsWith("Q")) return null;
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=it|en&format=json`;
    const data = await httpGet(url);
    const e = data?.entities?.[qid];
    return e?.labels?.it?.value || e?.labels?.en?.value || null;
  } catch { return null; }
}

async function fetchWikidata(qid: string) {
  try {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
    const data = await httpGet(url);
    if (!data?.entities?.[qid]) return null;
    const entity = data.entities[qid];
    const claims = entity.claims || {};

    const getVal = (prop: string): string | null => {
      const c = claims[prop];
      if (!c?.[0]) return null;
      const sv = c[0].mainsnak?.datavalue?.value;
      if (!sv) return null;
      if (typeof sv === "string") return sv;
      if (typeof sv === "object") {
        if (sv.time)            return sv.time.replace(/^\+/, "").split("T")[0].split("-")[0];
        if (sv["entity-type"])  return sv.id;
        if (sv.text)            return sv.text;
        if (sv.amount)          return sv.amount.replace(/^\+/, "");
      }
      return null;
    };

    const architectQid = getVal("P84");
    const styleQid     = getVal("P149");
    const materialQid  = getVal("P186");
    const adminQid     = getVal("P131");

    const [architectLabel, styleLabel, materialLabel, adminLabel] = await Promise.all([
      architectQid ? resolveQidLabel(architectQid) : null,
      styleQid     ? resolveQidLabel(styleQid)     : null,
      materialQid  ? resolveQidLabel(materialQid)  : null,
      adminQid     ? resolveQidLabel(adminQid)     : null,
    ]);

    // Sitelinks Wikipedia italiano
    const wpItTitle = entity.sitelinks?.itwiki?.title || entity.sitelinks?.enwiki?.title || null;
    const wpItLang  = entity.sitelinks?.itwiki ? "it" : (entity.sitelinks?.enwiki ? "en" : null);

    return {
      inception:    getVal("P571"),
      architect:    architectLabel || architectQid,
      style:        styleLabel     || styleQid,
      material:     materialLabel  || materialQid,
      height:       getVal("P2048"),
      image:        getVal("P18"),
      website:      getVal("P856"),
      phone:        getVal("P1329"),
      adminLabel,
      wpTitle:      wpItTitle,
      wpLang:       wpItLang,
    };
  } catch { return null; }
}

// ── WikiVoyage GEOSEARCH per coordinate ───────────────────────────────
async function fetchWikiVoyageByCoords(lat: number, lon: number, lang = "it") {
  try {
    const url = `https://${lang}.wikivoyage.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=15000&gslimit=3&format=json&gsnamespace=0`;
    const data = await httpGet(url);
    const results = data?.query?.geosearch || [];
    if (!results.length) return null;

    const nearest = results[0];
    const summaryUrl = `https://${lang}.wikivoyage.org/api/rest_v1/page/summary/${encodeURIComponent(nearest.title.replace(/ /g, "_"))}`;
    const summary = await httpGet(summaryUrl);
    if (!summary?.extract || summary.extract.length < 30) return null;

    return {
      title:   summary.title || nearest.title,
      extract: summary.extract as string,
      url:     summary.content_urls?.desktop?.page as string | null || null,
      dist:    nearest.dist as number,
    };
  } catch { return null; }
}

// ── Wikimedia URL ─────────────────────────────────────────────────────
function buildWikimediaUrl(file: string): string {
  const clean = file.replace(/^File:/i, "").replace(/^Category:/i, "");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=1200`;
}

// ── Genera audio_script (testo ottimizzato per TTS) ───────────────────
function buildAudioScript(name: string, category: string, wpExtract: string | null, wvData: any, techData: any): string {
  const parts: string[] = [];

  // Intro con nome
  parts.push(`${name}.`);

  // Descrizione Wikipedia (max 500 chars per TTS ragionevole)
  if (wpExtract) {
    const shortExtract = wpExtract.length > 500
      ? wpExtract.substring(0, 497) + "..."
      : wpExtract;
    parts.push(shortExtract);
  }

  // Dati tecnici parlabili
  const techParts: string[] = [];
  if (techData.inception)  techParts.push(`costruito nel ${techData.inception}`);
  if (techData.architect)  techParts.push(`progettato da ${techData.architect}`);
  if (techData.style)      techParts.push(`in stile ${techData.style}`);
  if (techParts.length > 0) parts.push(techParts.join(", ") + ".");

  // Contesto WikiVoyage
  if (wvData?.title && wvData?.extract) {
    const shortWv = wvData.extract.length > 200
      ? wvData.extract.substring(0, 197) + "..."
      : wvData.extract;
    parts.push(`Nella zona: ${shortWv}`);
  }

  return parts.join(" ").trim();
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Payload dal Database Webhook (record = nuovo POI inserito)
    const record = body.record || body;
    const { id, name, category, lat, lon } = record;

    if (!id || !name) {
      return new Response(JSON.stringify({ error: "Missing id or name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Leggi technical_data già presente (sync da punti_interesse via trigger SQL)
    const techDataRaw = record.technical_data || {};
    const techData = typeof techDataRaw === "string" ? JSON.parse(techDataRaw) : techDataRaw;

    const wikipedia      = techData.wikipedia      || null;
    const wikidata       = techData.wikidata        || null;
    const wikimediaCommons = techData.wikimedia     || null;
    const latF = parseFloat(lat), lonF = parseFloat(lon);

    // Se non ha wikipedia/wikidata → skip (non ha fonti verificabili)
    if (!wikipedia && !wikidata) {
      return new Response(JSON.stringify({ skipped: true, reason: "no wiki tags" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch in parallelo tutte le fonti ─────────────────────────────
    let wpData: any = null, wdData: any = null, wvData: any = null;
    let wmImage: string | null = null;

    // 1. Wikidata (ha sitelinks → ottiene Wikipedia page)
    if (wikidata) wdData = await fetchWikidata(wikidata);

    // 2. Wikipedia (SOLO dal tag OSM o sitelink Wikidata — MAI per nome)
    const wpTag = wikipedia || (wdData?.wpTitle ? `${wdData.wpLang}:${wdData.wpTitle}` : null);
    if (wpTag) wpData = await fetchWikipedia(wpTag);

    // 3. WikiVoyage geosearch per coordinate
    if (latF && lonF) {
      wvData = await fetchWikiVoyageByCoords(latF, lonF, "it");
      if (!wvData) wvData = await fetchWikiVoyageByCoords(latF, lonF, "en");
    }

    // 4. Wikimedia image
    if (wikimediaCommons)     wmImage = buildWikimediaUrl(wikimediaCommons);
    else if (wdData?.image)   wmImage = buildWikimediaUrl(wdData.image);
    else if (wpData?.thumbnail) wmImage = wpData.thumbnail;

    // ── Costruisce full_description ───────────────────────────────────
    const descParts: string[] = [];
    if (wpData?.extract && wpData.extract.length > 30) descParts.push(wpData.extract);
    if (wvData?.extract && wvData.extract.length > 30) {
      const dist = wvData.dist ? ` (a ${wvData.dist}m)` : "";
      descParts.push(`📍 ${wvData.title}${dist}: ${wvData.extract}`);
    }
    const fullDescription = descParts.join("\n\n").trim() || null;

    // ── Technical data ────────────────────────────────────────────────
    const newTechData: Record<string, any> = { ...techData };
    if (wdData?.inception)    newTechData.inception    = wdData.inception;
    if (wdData?.architect)    newTechData.architect    = wdData.architect;
    if (wdData?.style)        newTechData.style        = wdData.style;
    if (wdData?.material)     newTechData.material     = wdData.material;
    if (wdData?.height)       newTechData.height       = `${wdData.height} m`;
    if (wdData?.adminLabel)   newTechData.city         = wdData.adminLabel;
    if (wpData?.url)          newTechData.wikipedia_url   = wpData.url;
    if (wvData?.url)          newTechData.wikivoyage_url  = wvData.url;
    if (wvData?.title)        newTechData.wikivoyage_dest = wvData.title;
    if (wvData?.dist)         newTechData.wikivoyage_dist = wvData.dist;
    if (wikidata)             newTechData.wikidata_id     = wikidata;

    // ── Practical info ────────────────────────────────────────────────
    let practicalInfo: string | null = record.practical_info || null;
    if (!practicalInfo) {
      const pParts: string[] = [];
      if (wdData?.phone)   pParts.push(`Tel: ${wdData.phone}`);
      if (wdData?.website) pParts.push(`Web: ${wdData.website}`);
      if (pParts.length) practicalInfo = pParts.join(" | ");
    }

    // ── Audio script (testo pre-generato per TTS) ─────────────────────
    const audioScript = buildAudioScript(name, category, wpData?.extract || null, wvData, newTechData);

    // ── Salva nel DB via Supabase ─────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (fullDescription || wmImage) {
      const { error } = await supabase
        .from("shared_pois")
        .update({
          description_ai:    fullDescription,
          description_long:  fullDescription,
          full_description:  fullDescription,
          image_url:         wmImage || undefined,
          photo_url:         wmImage || undefined,
          technical_data:    newTechData,
          practical_info:    practicalInfo || undefined,
          audio_script:      audioScript || undefined,
          enriched_at:       new Date().toISOString(),
          enrichment_source: "auto-edge-v4",
        })
        .eq("id", id);

      if (error) {
        console.error(`[auto-enrich] Failed to update POI ${id}:`, error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`[auto-enrich] ✅ ${id} (${name}): wp=${!!wpData} wd=${!!wdData} wv=${!!wvData} img=${!!wmImage}`);

    return new Response(JSON.stringify({
      ok: true,
      id,
      hasWikipedia:  !!wpData,
      hasWikidata:   !!wdData,
      hasWikiVoyage: !!wvData,
      hasImage:      !!wmImage,
      hasAudioScript: !!audioScript,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[auto-enrich] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
