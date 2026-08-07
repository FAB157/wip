const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const startIndex = content.indexOf('app.post("/api/poi/enrich"');
if (startIndex === -1) {
  console.log("Could not find /api/poi/enrich route");
  process.exit(1);
}

// Find the matching closing bracket for app.post
let braceCount = 0;
let inString = false;
let stringChar = '';
let endIndex = -1;
let started = false;

for (let i = startIndex; i < content.length; i++) {
  const char = content[i];
  
  if (!inString && (char === '"' || char === "'" || char === '\`')) {
    inString = true;
    stringChar = char;
  } else if (inString && char === stringChar && content[i-1] !== '\\') {
    inString = false;
  }
  
  if (!inString) {
    if (char === '{') {
      braceCount++;
      started = true;
    } else if (char === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        // Assume the route ends with "});"
        const potentialEnd = content.indexOf('});', i);
        if (potentialEnd !== -1 && potentialEnd - i < 5) {
          endIndex = potentialEnd + 3;
        } else {
          endIndex = i + 1;
        }
        break;
      }
    }
  }
}

if (endIndex === -1) {
  console.log("Could not find end of route");
  process.exit(1);
}

const newRoute = `app.post("/api/poi/enrich", rateLimiter, async (req, res) => {
    try {
      const { id, name, lat, lon, category, subCategory, wikidata: clientWikidata, wikipedia: clientWikipedia, lang = "it" } = req.body;
      
      const targetLat = parseFloat(lat);
      const targetLon = parseFloat(lon);

      if (isNaN(targetLat) || isNaN(targetLon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      // Reject generic or unnamed parks and parkings
      if (isGenericUtilityName(name)) {
        return res.status(403).json({ error: true, message: "Parcheggi e parchi generici non sono ammessi alla curatela." });
      }

      let extract = "";
      let thumbnail = "";
      let pageUrl = "";
      let sourceUsed = "none";
      let distanceKm = null;
      let address = "";
      let tags = [category];
      let rating = "4.2";
      let numReviews = 45;
      let reviews = [];

      let resolvedWikidata = clientWikidata || "";
      let resolvedWikipedia = clientWikipedia || "";

      // 1. Wikipedia Text Search Fallback
      if (!extract && !resolvedWikipedia && name && name.length > 2) {
        try {
          const searchUrl = \`https://\${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=\${encodeURIComponent(name)}&format=json&origin=*\`;
          const searchRes = await fetch(searchUrl);
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const pageTitle = searchData.query?.search?.[0]?.title;
            if (pageTitle) resolvedWikipedia = pageTitle;
          }
        } catch (e) {}
      }

      // 2. Wikipedia Summary Fetch
      if (!extract && resolvedWikipedia && typeof resolvedWikipedia === "string") {
        try {
          let cleanWikiTitle = resolvedWikipedia;
          let wikiLang = lang || "it";
          if (resolvedWikipedia.includes(":")) {
            const parts = resolvedWikipedia.split(":");
            if (parts[0].length === 2) {
              wikiLang = parts[0];
              cleanWikiTitle = parts.slice(1).join(":");
            }
          }

          const wikiUrl = \`https://\${wikiLang}.wikipedia.org/api/rest_v1/page/summary/\${encodeURIComponent(cleanWikiTitle.replace(/ /g, "_"))}\`;
          const wRes = await fetch(wikiUrl, { headers: { "User-Agent": "ItaliaInTascaGuide/1.0" } });
          if (wRes.ok) {
            const wData = await wRes.json();
            if (wData.extract && wData.title !== "Not found.") {
              let srcLat = null, srcLon = null;
              if (wData.coordinates) {
                srcLat = wData.coordinates.lat;
                srcLon = wData.coordinates.lon;
              }

              if (srcLat !== null && srcLon !== null) {
                distanceKm = haversineDistance(targetLat, targetLon, srcLat, srcLon);
              }

              if (distanceKm === null || distanceKm < 1.5) {
                extract = wData.extract;
                if (wData.originalimage?.source || wData.thumbnail?.source) {
                  thumbnail = wData.originalimage?.source || wData.thumbnail?.source || thumbnail;
                }
                pageUrl = wData.content_urls?.desktop?.page || "";
                sourceUsed = "wikipedia";
              }
            }
          }
        } catch (e) {}
      }

      // 3. Unsplash Photo Fetch (High Priority)
      const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || process.env.VITE_UNSPLASH_ACCESS_KEY;
      if (!thumbnail && unsplashKey) {
        try {
          const unsplashUrl = \`https://api.unsplash.com/search/photos?query=\${encodeURIComponent(name + " " + category)}\&per_page=1&orientation=landscape\`;
          const unsRes = await fetch(unsplashUrl, { headers: { Authorization: \`Client-ID \${unsplashKey}\` }, timeout: 3500 });
          if (unsRes.ok) {
            const unsData = await unsRes.json();
            if (unsData.results && unsData.results.length > 0) {
              thumbnail = unsData.results[0].urls.regular;
            }
          }
        } catch(e) {}
      }

      // 4. DEEPSEEK UNIVERSAL AI SYNTHESIS (replaces Gemini Manager-POI)
      let roleInstruction = "";
      if (['locali', 'utilita', 'famiglie'].includes(category)) {
        roleInstruction = \`Sei un assistente informativo locale preciso e affidabile. Ricevi Nome e Categoria ("\${category}").
Scrivi una descrizione fattuale e utile su cosa offre questo luogo (max 150 parole).
La lingua deve essere: \${lang}. Rispondi in JSON valido con 'description' (testo), 'is_gem' (false), 'error' (false).\`;
      } else {
        roleInstruction = \`Sei un curatore turistico e storico d'eccellenza. Ricevi Nome e Categoria ("\${category}").
Scrivi una descrizione accademica, immersiva e storicamente accurata (max 150 parole).
La lingua deve essere: \${lang}. Rispondi in JSON valido con 'description' (testo), 'is_gem' (true/false), 'error' (false).\`;
      }

      const curatorPrompt = \`\${roleInstruction}
INFORMAZIONI SUL LUOGO DA CURARE:
Nome: "\${name}"
Wikipedia: "\${extract || "Nessuna fonte trovata"}"\`;

      let jsonResponse = { description: extract || "", is_gem: false, error: false };
      
      try {
        const messages = [
            { role: "system", content: "You are an AI that outputs ONLY valid JSON." },
            { role: "user", content: curatorPrompt }
        ];
        
        const aiResponse = await callUniversalAi("deepseek", messages, { response_format: { type: "json_object" } }, "poi_enrichment", supabaseUrl, supabaseServiceKey, null);
        
        // Try to parse Deepseek response
        const aiText = aiResponse.data ? aiResponse.data.trim() : "{}";
        const cleanText = aiText.replace(/^\\s*\`\`\`json/i, "").replace(/\`\`\`\\s*$/, "");
        jsonResponse = JSON.parse(cleanText);
      } catch (aiErr) {
        console.warn("[DeepSeek Enrich] AI Failed, falling back to basic extract.");
        if (extract) jsonResponse.description = extract;
      }

      if (jsonResponse.error === true) {
        return res.status(403).json({ error: true, message: "Luogo rifiutato." });
      }

      const finalDescription = jsonResponse.description || extract;

      // 5. CACHE FIRST - Save to Database immediately
      const precisionId = id || \`\${targetLat.toFixed(4).replace('.', '_')}_\${targetLon.toFixed(4).replace('.', '_')}\`;
      
      // Premium placeholder fallback if still no photo
      if (!thumbnail) {
        thumbnail = "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800";
      }

      try {
        await axios.post(\`\${supabaseUrl}/rest/v1/shared_pois\`, {
          id: precisionId,
          lat: targetLat,
          lon: targetLon,
          name,
          category,
          description_ai: finalDescription,
          description_short: finalDescription,
          description_long: finalDescription,
          image_url: thumbnail,
          photo_url: thumbnail,
          status: 'verified',
          is_gem: !!jsonResponse.is_gem,
          created_at: new Date().toISOString()
        }, {
          headers: {
            apikey: supabaseServiceKey,
            Authorization: \`Bearer \${supabaseServiceKey}\`,
            Prefer: 'resolution=merge-duplicates'
          }
        });
      } catch (dbErr) {}

      res.json({
        extract: finalDescription,
        description_short: finalDescription,
        description_long: finalDescription,
        thumbnail,
        pageUrl,
        is_gem: !!jsonResponse.is_gem,
        source: "deepseek-curator",
        distanceKm: distanceKm !== null ? parseFloat(distanceKm.toFixed(3)) : null,
        address,
        tags,
        rating,
        numReviews,
        reviews
      });
    } catch (e) {
      console.error("[/api/poi/enrich] Error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });`;

content = content.substring(0, startIndex) + newRoute + content.substring(endIndex);
fs.writeFileSync('server.ts', content, 'utf8');
console.log('Patch complete for /api/poi/enrich');
