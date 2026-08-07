const fs = require('fs');
let code = fs.readFileSync('src/services/locationService.ts', 'utf8');

// The file might be corrupted. I will manually locate the TRIGGER 2 block and replace it.

const startMarker = "// --- TRIGGER 2: GUIDANCE PLAY RADIUS GEOFENCE ---";
const endMarker = "// Find closest POI for logs & telemetry"; // Wait, end marker is the end of the forEach loop.

// Let's just fix the syntax error or duplicates if any.
// Actually, I'll use regex to find the entire block from TRIGGER 2 to the end of the loop.
const regex = /\/\/ --- TRIGGER 2: GUIDANCE PLAY RADIUS GEOFENCE ---[\s\S]+?catch \(err\) {\s*console\.error\("\[LocationService\] Enrich Geofence failed:", err\);\s*}\s*}\s*}\s*\);/g;

const newBlock = `// --- TRIGGER 2: GUIDANCE PLAY RADIUS GEOFENCE ---
      if (distance <= guidanceRadius && !this.playedGuides.has(alertIdNear)) {
        this.playedGuides.add(alertIdNear);
        
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([300, 100, 300]);
        }

        try {
          await supabase.from('poi_interactions').insert([{ poi_id: point.id, interaction_type: 'listen' }]);
        } catch (e) {}

        try {
          const enrichRes = await fetch("/api/poi/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: point.id,
              name,
              lat: point.lat,
              lon: point.lon,
              category: point.category || "monumenti",
              subCategory: point.subCategory,
              lang: this.language.toLowerCase(),
              mode: this.guideMode
            })
          });
          
          let description = point.description || "";
          let textToSpeak = description;
          let image = point.thumbnail;

          if (enrichRes.ok) {
            const enriched = await enrichRes.json();
            textToSpeak = enriched.extract || enriched.description_short || textToSpeak;
            image = enriched.image_url || image;
            
            point.description = textToSpeak;
            if (image) point.thumbnail = image;
          }

          if (typeof window !== 'undefined') {
            const poiForSheet = {
              ...point,
              name: point.name || point.title,
              image_url: point.image_url || point.thumbnail || point.photo_url
            };
            window.dispatchEvent(new CustomEvent("wip-open-poi-sheet", { detail: poiForSheet }));
          }

          if (activationMode === 'automatic') {
            await new Promise(resolve => setTimeout(resolve, 10000));
            const playSuccess = await this.playAudio(textToSpeak, name);
            if (!playSuccess) {
              window.dispatchEvent(new CustomEvent("wip-geofence-alert", {
                detail: { poi: point, name, distance: Math.round(distance), activationMode, textToSpeak, image }
              }));
            }
          } else {
            window.dispatchEvent(new CustomEvent("wip-geofence-alert", {
              detail: {
                poi: point, name, distance: Math.round(distance), activationMode,
                textToSpeak: \`Sei arrivato a \${name}! Premi play nella scheda per ascoltare la guida.\`,
                image
              }
            }));
            this.playAudio(\`Sei arrivato a \${name}\`);
          }
        } catch (err) {
          console.error("[LocationService] Enrich Geofence failed:", err);
        }
      }
    });`;

code = code.replace(regex, newBlock);
fs.writeFileSync('src/services/locationService.ts', code);
console.log("Fixed trigger 2");
