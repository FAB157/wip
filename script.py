import sys

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoint = '''
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
        const precisionId = \\_\\;

        // Check if exists
        try {
          const { data: existing } = await axios.get(\\/rest/v1/shared_pois?id=eq.\\, {
            headers: { apikey: supabaseServiceKey, Authorization: \Bearer \\ }
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
            const wikiRes = await fetch(\https://\.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=\|\&gsradius=1000&gslimit=5&format=json&origin=*\);
            if (wikiRes.ok) {
              const wikiData = await wikiRes.json();
              const pages = wikiData.query?.geosearch || [];
              let bestPage = pages.find((page: any) => page.title.toLowerCase() === name.toLowerCase()) || pages[0];
              if (bestPage) {
                const summaryRes = await fetch(\https://\.wikipedia.org/api/rest_v1/page/summary/\\);
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
            const wikiCommonsUrl = \https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=\&format=json&origin=*\;
            const cRes = await fetch(wikiCommonsUrl);
            if (cRes.ok) {
              const cData = await cRes.json();
              const fileName = cData.query?.search?.[0]?.title;
              if (fileName && fileName.startsWith("File:")) {
                thumbnail = \https://commons.wikimedia.org/w/index.php?title=Special:FilePath/\&width=800\;
              }
            }
          } catch(e) {}
        }

        if (!thumbnail) {
           const cleanSearch = name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ',');
           thumbnail = \https://source.unsplash.com/featured/800x600/?\,landmark\;
        }

        // Groq Enrich
        let jsonResponse = { description_short: extract || "", description_long: "", audio_script: "", is_gem: false };
        try {
          const curatorPrompt = \Sei un curatore turistico d'eccellenza. Ricevi Nome e Coordinate (Lat: \, Lon: \).
Lingua: \.
Restituisci JSON con: 'description_short' (2 frasi), 'description_long' (min 1500 char), 'audio_script' (90 sec), 'is_gem' (boolean).
Nome: "\"
Wikipedia: "\"\;
          
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

          await axios.post(\\/rest/v1/shared_pois\, updatePayload, {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: \Bearer \\,
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
            await axios.post(\\/rest/v1/system_errors\, {
              source: "batch-ensure",
              error_message: dbErr.message,
              details: JSON.stringify({ name, lat: targetLat, lon: targetLon })
            }, {
              headers: { apikey: supabaseServiceKey, Authorization: \Bearer \\ }
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

'''

target_str = 'app.post("/api/poi/enrich", rateLimiter, async (req, res) => {'
if target_str in content and 'batch-ensure' not in content:
    content = content.replace(target_str, new_endpoint + target_str)
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Injected batch-ensure")
else:
    print("Could not inject batch-ensure")

