const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Deterministic ISO country coder based on bounding box
function getCountryCode(lat, lon) {
  // Safe default bounding box mapping
  // Italy: roughly 35.4 to 47.1 latitude, 6.6 to 18.5 longitude
  if (lat >= 35.4 && lat <= 47.1 && lon >= 6.6 && lon <= 18.5) return 'IT';
  // Switzerland: 45.8 to 47.8 lat, 5.9 to 10.5 lon
  if (lat >= 45.8 && lat <= 47.8 && lon >= 5.9 && lon <= 10.5) return 'CH';
  // Austria: 46.3 to 49.0 lat, 9.5 to 17.2 lon
  if (lat >= 46.3 && lat <= 49.0 && lon >= 9.5 && lon <= 17.2) return 'AT';
  return 'IT'; // Default fallback
}

// Bounding box for Carrara/Tuscany, Italy as default testing ground
const DEFAULT_BBOX = "44.05,10.05,44.12,10.15";

async function fetchAndProcess(bbox = DEFAULT_BBOX) {
  console.log(`Starting OSM extraction for bbox: ${bbox}...`);
  
  const query = `
    [out:json][timeout:60];
    (
      node(${bbox})[historic];
      way(${bbox})[historic];
      
      node(${bbox})[tourism];
      way(${bbox})[tourism];
      
      node(${bbox})[amenity];
      way(${bbox})[amenity];
      
      node(${bbox})[leisure];
      way(${bbox})[leisure];
      
      node(${bbox})[place=square];
      
      node(${bbox})[craft];
      way(${bbox})[craft];
      
      node(${bbox})[shop];
      way(${bbox})[shop];
      
      node(${bbox})[railway=station];
      node(${bbox})[railway=subway_entrance];
      node(${bbox})[aeroway=aerodrome];
      node(${bbox})[highway=motorway_junction];
    );
    out center;
  `;

  const url = "https://overpass-api.de/api/interpreter";
  console.log("Sending query to Overpass API...");
  
  let response;
  try {
    response = await axios.get(`${url}?data=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "ItaintaGeodataPipeline/1.0" }
    });
  } catch (err) {
    console.error("Overpass query failed:", err.message);
    return;
  }

  const elements = response.data?.elements || [];
  console.log(`Successfully fetched ${elements.length} elements from OpenStreetMap!`);

  const processed = [];
  
  for (const el of elements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon) continue;

    const name = tags.name || tags["name:it"] || tags.alt_name || tags.official_name || "";
    
    // EXCLUSION: reject unwanted building/commercial nodes universally
    if (tags.office || tags.building === "commercial" || tags.building === "industrial") continue;

    let macro = "";
    let sotto = "";

    // ──────────────────────────────────────────────
    // 1. MACRO: MONUMENTI (Filter strict: requires name)
    // ──────────────────────────────────────────────
    if (tags.historic || tags.amenity === "place_of_worship" || tags.tourism === "museum" || tags.tourism === "viewpoint" || tags.place === "square" || tags.tourism === "artwork") {
      if (!name) continue; // strict gate
      macro = "monumenti";
      if (tags.amenity === "place_of_worship") sotto = "chiesa";
      else if (tags.tourism === "museum") sotto = "museo";
      else if (tags.tourism === "viewpoint") sotto = "panorama";
      else if (tags.place === "square") sotto = "piazza";
      else if (tags.tourism === "artwork") sotto = "arte";
      else sotto = "monumento";
    }
    // ──────────────────────────────────────────────
    // 2. MACRO: LOCALI (No name requirement)
    // ──────────────────────────────────────────────
    else if (tags.amenity === "restaurant" || tags.amenity === "fast_food" || tags.amenity === "bar" || tags.amenity === "cafe" || tags.amenity === "pub" || tags.amenity === "ice_cream" || tags.cuisine === "ice_cream") {
      macro = "locali";
      if (tags.amenity === "ice_cream" || tags.cuisine === "ice_cream") sotto = "gelateria";
      else if (tags.amenity === "restaurant" || tags.amenity === "fast_food") sotto = "ristorante";
      else sotto = "bar_caffe";

      // Culinary parsing
      const cuisine = (tags.cuisine || "").toLowerCase();
      const diet = (tags["diet:gluten_free"] || tags["diet:gluten_free:only"] || "").toLowerCase();

      if (cuisine.includes("pizza")) sotto = "pizza";
      else if (cuisine.includes("sushi")) sotto = "sushi";
      else if (cuisine.includes("meat") || cuisine.includes("steak")) sotto = "carne";
      else if (cuisine.includes("seafood") || cuisine.includes("fish")) sotto = "pesce";
      else if (cuisine.includes("vegetarian") || tags["diet:vegetarian"] === "yes") sotto = "vegetariano";
    }
    // ──────────────────────────────────────────────
    // 3. MACRO: FAMIGLIE (Filter strict: requires name)
    // ──────────────────────────────────────────────
    else if (tags.leisure === "playground" || tags.tourism === "theme_park" || tags.tourism === "aquarium" || tags.tourism === "zoo") {
      if (!name) continue; // strict gate
      macro = "famiglie";
      if (tags.leisure === "playground") sotto = "parco_giochi";
      else if (tags.tourism === "theme_park") sotto = "divertimento";
      else if (tags.tourism === "aquarium") sotto = "acquario";
      else if (tags.tourism === "zoo") sotto = "zoo";
    }
    // ──────────────────────────────────────────────
    // 4. MACRO: ESPERIENZE LOCALI (Filter strict: requires name)
    // ──────────────────────────────────────────────
    else if (tags.craft || tags.amenity === "marketplace" || tags.shop === "deli" || tags.shop === "cheese" || tags.shop === "wine") {
      if (!name) continue; // strict gate
      macro = "esperienze_locali";
      if (tags.craft) sotto = "artigianato";
      else if (tags.amenity === "marketplace") sotto = "mercato";
      else sotto = "gastronomia";
    }
    // ──────────────────────────────────────────────
    // 5. MACRO: UTILITA (No name requirement)
    // ──────────────────────────────────────────────
    else if (tags.amenity === "drinking_water" || tags.amenity === "toilets" || tags.amenity === "pharmacy" || tags.amenity === "hospital" || tags.amenity === "taxi" || tags.railway === "station" || tags.railway === "subway_entrance" || tags.aeroway === "aerodrome" || tags.highway === "motorway_junction") {
      macro = "utilita";
      if (tags.amenity === "drinking_water") sotto = "fontanella";
      else if (tags.amenity === "toilets") sotto = "bagni";
      else if (tags.amenity === "pharmacy") sotto = "farmacia";
      else if (tags.amenity === "hospital") sotto = "ospedale";
      else if (tags.amenity === "taxi") sotto = "taxi";
      else if (tags.railway === "station") sotto = "stazione_fs";
      else if (tags.railway === "subway_entrance") sotto = "metro";
      else if (tags.aeroway === "aerodrome") sotto = "aeroporto";
      else if (tags.highway === "motorway_junction") sotto = "autostrada";
    }

    if (!macro) continue; // skip unmapped types

    // Gemma Logic
    const wikidata = tags.wikidata || "";
    const isGemma = !!(wikidata && wikidata.startsWith('Q'));

    // Buid description fallback
    let description = tags.description || "";
    if (!description && tags.opening_hours) description += `Orari: ${tags.opening_hours}. `;
    if (!description && tags.phone) description += `Tel: ${tags.phone}. `;
    if (!description && tags.website) description += `Web: ${tags.website}. `;

    processed.push({
      osm_id: el.id,
      lat,
      lon,
      name,
      amenity: tags.amenity || "",
      historic: tags.historic || "",
      railway: tags.railway || "",
      aeroway: tags.aeroway || "",
      highway: tags.highway || "",
      tourism: tags.tourism || "",
      leisure: tags.leisure || "",
      religion: tags.religion || "",
      place: tags.place || "",
      craft: tags.craft || "",
      shop: tags.shop || "",
      cuisine: tags.cuisine || "",
      diet_gluten_free: tags["diet:gluten_free"] || "",
      diet_gluten_free_only: tags["diet:gluten_free:only"] || "",
      diet_vegetarian: tags["diet:vegetarian"] || "",
      opening_hours: tags.opening_hours || "",
      phone: tags.phone || "",
      website: tags.website || "",
      wikipedia: tags.wikipedia || "",
      wikidata: tags.wikidata || "",
      wikimedia_commons: tags.wikimedia_commons || "",
      image: tags.image || "",
      country_code: getCountryCode(lat, lon),
      macro_categoria: macro,
      sotto_categoria: sotto,
      is_gemma: isGemma,
      descrizione_ai: description || null,
      audio_guide_url: null
    });
  }

  console.log(`Normalized and classified ${processed.length} valid Puniti di Interesse!`);

  // Write CSV File
  const headers = [
    "osm_id", "lat", "lon", "name", "amenity", "historic", "railway", "aeroway", "highway", "tourism", "leisure", "religion", "place", "craft", "shop", "cuisine", "diet_gluten_free", "diet_gluten_free_only", "diet_vegetarian", "opening_hours", "phone", "website", "wikipedia", "wikidata", "wikimedia_commons", "image", "country_code", "macro_categoria", "sotto_categoria", "is_gemma", "descrizione_ai", "audio_guide_url"
  ];

  const escapeCSV = (str) => {
    if (str === null || str === undefined) return "";
    const cleanStr = String(str).replace(/"/g, '""');
    return cleanStr.includes(",") || cleanStr.includes('"') || cleanStr.includes("\n") ? `"${cleanStr}"` : cleanStr;
  };

  let csvContent = headers.join(",") + "\n";
  for (const p of processed) {
    const row = headers.map(h => escapeCSV(p[h]));
    csvContent += row.join(",") + "\n";
  }

  const outPath = path.join(__dirname, "punti_interesse_export.csv");
  fs.writeFileSync(outPath, csvContent, "utf-8");
  console.log(`✅ CSV exported successfully to: ${outPath}`);
  console.log(`🎉 Process finished. Columns verified: ${headers.length}/32.`);
}

fetchAndProcess();
