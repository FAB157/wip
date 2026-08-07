import sys

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Trova inizio e fine dell'endpoint corrotto per rimuoverlo
start_marker = '// --- BATCH ENSURE POIS (From Itinerary) ---'
end_marker = 'app.post("/api/poi/enrich", rateLimiter, async (req, res) => {'

if start_marker in content and end_marker in content:
    idx_start = content.find(start_marker)
    idx_end = content.find(end_marker)
    content = content[:idx_start] + content[idx_end:]

new_endpoint = """
  // --- BATCH ENSURE POIS (From Itinerary) ---
  app.post("/api/poi/batch-ensure", rateLimiter, async (req, res) => {
    try {
      const { pois, lang = "it" } = req.body;
      if (!pois || !Array.isArray(pois)) {
        return res.status(400).json({ error: "Invalid POIs array" });
      }

      const results = [];
      const errors = [];

      for (const p of pois) {
        if (!p.name || !p.coordinate || !p.coordinate.lat || !p.coordinate.lng) continue;

        const targetLat = parseFloat(p.coordinate.lat);
        const targetLon = parseFloat(p.coordinate.lng);
        const name = p.titolo_tappa || p.name;
        
        // Precision ID
        const precisionId = `${targetLat.toFixed(4).replace('.', '_')}_${targetLon.toFixed(4).replace('.', '_')}`;

        // Check if exists
        try {
          const { data: existing } = await axios.get(`${supabaseUrl}/rest/v1/shared_pois?id=eq.${precisionId}`, {
            headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
          });
          
          if (existing && existing.length > 0) {
            results.push({ id: precisionId, status: "exists" });
            continue;
          }
        } catch (e) {
          // ignore error and try to create
        }

        // Fetch wiki & photo
        let extract = "";
        let thumbnail = "";
        
        const wikiLangs = [lang, 'en', 'it'];
        for (const wikiLang of wikiLangs) {
          try {
            const wikiRes = await fetch(`https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${targetLat}|${targetLon}&gsradius=1000&gslimit=5&format=json&origin=*`);
            if (wikiRes.ok) {
              const wikiData = await wikiRes.json();
              const pages = wikiData.query?.geosearch || [];
              let bestPage = pages.find((page: any) => page.title.toLowerCase() === name.toLowerCase()) || pages[0];
              if (bestPage) {
                const summaryRes = await fetch(`https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestPage.title)}`);
                if (summaryRes.ok) {
                  const summary = await summaryRes.json();
                  extract = summary.extract || "";
                  thumbnail = summary.thumbnail?.source || summary.originalimage?.source || "";
                  if (extract) break;
                }
              }
            }
          } catch(e) {}
        }

        if (!thumbnail) {
          try {
            const wikiCommonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
            const cRes = await fetch(wikiCommonsUrl);
            if (cRes.ok) {
              const cData = await cRes.json();
              const fileName = cData.query?.search?.[0]?.title;
              if (fileName && fileName.startsWith("File:")) {
                thumbnail = `https://commons.wikimedia.org/w/index.php?title=Special:FilePath/${encodeURIComponent(fileName.substring(5).replace(/ /g, "_"))}&width=800`;
              }
            }
          } catch(e) {}
        }

        if (!thumbnail) {
           const cleanSearch = name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ',');
           thumbnail = `https://source.unsplash.com/featured/800x600/?${cleanSearch},landmark`;
        }

        // Groq Enrich
        let jsonResponse = { description_short: extract || "", description_long: "", audio_script: "", is_gem: false };
        try {
          const curatorPrompt = `Sei un curatore turistico d'eccellenza. Ricevi Nome e Coordinate (Lat: ${targetLat}, Lon: ${targetLon}).
Lingua: ${lang}.
Restituisci JSON con: 'description_short' (2 frasi), 'description_long' (min 1500 char), 'audio_script' (90 sec), 'is_gem' (boolean).
Nome: "${name}"
Wikipedia: "${extract || "Nessuna fonte trovata"}"`;
          
          const aiResponse = await callUniversalAi("groq", [{ role: "user", content: curatorPrompt }], { response_format: { type: "json_object" } }, "poi_batch_enrich", supabaseUrl, supabaseServiceKey, groq);
          const parsed = parseSafeJSON(aiResponse.data || "{}");
          
          jsonResponse.description_short = parsed.description_short || extract;
          jsonResponse.description_long = parsed.description_long || extract;
          jsonResponse.audio_script = parsed.audio_script || "";
          jsonResponse.is_gem = !!parsed.is_gem;
        } catch (aiErr) {
          console.warn("[batch-ensure] AI Failed:", aiErr);
        }

        // Save to Supabase
        const category = p.tipo || p.category || "attrazione";
        try {
          const updatePayload: any = {
            id: precisionId,
            lat: targetLat,
            lon: targetLon,
            name,
            category,
            image_url: thumbnail,
            photo_url: thumbnail,
            status: 'verified',
            is_gem: !!jsonResponse.is_gem,
            description_short: jsonResponse.description_short,
            description_ai: jsonResponse.description_long || jsonResponse.description_short,
            description_long: jsonResponse.description_long,
            updated_at: new Date().toISOString()
          };

          await axios.post(`${supabaseUrl}/rest/v1/shared_pois`, updatePayload, {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              Prefer: 'resolution=merge-duplicates'
            }
          });
          
          if (jsonResponse.audio_script) {
             const { upsertAudioguide } = await import('./src/services/poiRepository');
             await upsertAudioguide(precisionId, "it", "nicky", jsonResponse.audio_script);
             await upsertAudioguide(precisionId, "it", "dante", jsonResponse.audio_script);
          }
          
          results.push({ id: precisionId, status: "created" });
        } catch (dbErr: any) {
          console.warn("[batch-ensure] DB save failed:", dbErr.message);
          errors.push({ id: precisionId, error: dbErr.message });
          // Log to system_errors
          try {
            await axios.post(`${supabaseUrl}/rest/v1/system_errors`, {
              source: "batch-ensure",
              error_message: dbErr.message,
              details: JSON.stringify({ name, lat: targetLat, lon: targetLon })
            }, {
              headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
            });
          } catch (e) {}
        }
      }

      res.json({ success: true, results, errors });
    } catch (e: any) {
      console.error("[/api/poi/batch-ensure] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

"""

content = content.replace(end_marker, new_endpoint + end_marker)
with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Batch ensure fixed and injected")
