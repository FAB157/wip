import axios from 'axios';

// ==========================================
// OPEN-METEO API (Free, No Auth required)
// ==========================================
export async function getWeatherOpenMeteo(lat: number, lng: number): Promise<string> {
  try {
    const res = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=temperature_2m,precipitation_probability`);
    const current = res.data?.current_weather;
    if (!current) return "Meteo non disponibile";
    return JSON.stringify({
      temperature: current.temperature,
      windspeed: current.windspeed,
      weathercode: current.weathercode,
      note: "Controlla il weathercode WMO per sapere se piove (es. > 50 significa pioggia)"
    });
  } catch (err: any) {
    console.error("OpenMeteo Error:", err.message);
    return JSON.stringify({ error: "Servizio meteo irraggiungibile" });
  }
}

// ==========================================
// OSRM API (Free routing, No Auth required)
// ==========================================
export async function getRouteOsrm(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<string> {
  try {
    // Coordinate format: lng,lat
    const url = `http://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const res = await axios.get(url);
    const route = res.data?.routes?.[0];
    if (!route) return "Percorso non trovato";
    return JSON.stringify({
      distance_meters: route.distance,
      duration_seconds: route.duration,
      duration_minutes: Math.round(route.duration / 60)
    });
  } catch (err: any) {
    console.error("OSRM Error:", err.message);
    return JSON.stringify({ error: "Routing irraggiungibile" });
  }
}

// ==========================================
// TICKETMASTER API (Free Tier with API Key)
// ==========================================
export async function searchTicketmasterEvents(lat: number, lng: number, keyword: string): Promise<string> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return JSON.stringify({ error: "Ticketmaster API Key mancante" });
  try {
    const latlong = `${lat},${lng}`;
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&latlong=${latlong}&keyword=${encodeURIComponent(keyword)}&radius=50&unit=km&sort=date,asc&size=5`;
    const res = await axios.get(url);
    const events = res.data?._embedded?.events;
    if (!events || events.length === 0) return "Nessun evento Ticketmaster trovato nei paraggi.";
    
    const results = events.map((e: any) => ({
      name: e.name,
      url: e.url,
      date: e.dates?.start?.localDate,
      time: e.dates?.start?.localTime,
      venue: e._embedded?.venues?.[0]?.name
    }));
    return JSON.stringify(results);
  } catch (err: any) {
    console.error("Ticketmaster Error:", err.message);
    return JSON.stringify({ error: "Ticketmaster irraggiungibile" });
  }
}

// (PredictHQ rimosso ago 2026: chiave revocata — conteneva anche una chiave
// hardcoded nel sorgente, eliminata con la funzione)

// ==========================================
// EUROPEANA API (Free Tier with API Key)
// ==========================================
export async function searchEuropeana(keyword: string): Promise<string> {
  const apiKey = process.env.EUROPEANA_API_KEY;
  if (!apiKey) return JSON.stringify({ error: "Europeana API Key mancante" });
  try {
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${apiKey}&query=${encodeURIComponent(keyword)}&rows=5`;
    const res = await axios.get(url);
    const items = res.data?.items;
    if (!items || items.length === 0) return "Nessun risultato culturale da Europeana.";
    
    const results = items.map((i: any) => ({
      title: i.title?.[0],
      creator: i.dcCreator?.[0] || "Ignoto",
      dataProvider: i.dataProvider?.[0],
      link: i.guid
    }));
    return JSON.stringify(results);
  } catch (err: any) {
    console.error("Europeana Error:", err.message);
    return JSON.stringify({ error: "Europeana irraggiungibile" });
  }
}

// ==========================================
// RHYTHM TIMING RULE WRAPPER
// ==========================================
export function getRitmoTimingRule(ritmo: string): string {
  const baseRule = "SINE QUA NON - ASSOLUTAMENTE OBBLIGATORIO: Se i luoghi richiesti dall'utente non sono sufficienti per coprire questo schema, DEVI AGGIUNGERE TU ALTRE TAPPE coerenti e reali. Il Pranzo e la Cena NON contano come tappe culturali.";
  
  if (ritmo === "rilassato") {
    return `L'itinerario DEVE avere ESATTAMENTE 2 o 3 tappe CULTURALI al mattino, poi una tappa Pranzo di 1.5 ore verso le 13:00, poi ESATTAMENTE 2 o 3 tappe CULTURALI al pomeriggio e la Cena sempre DOPO le 19:00. ${baseRule}`;
  } else if (ritmo === "intenso") {
    return `L'itinerario DEVE avere ESATTAMENTE 4 o 5 tappe CULTURALI al mattino, poi una tappa Pranzo di 1.5 ore verso le 13:00, poi ESATTAMENTE 4 o 5 tappe CULTURALI al pomeriggio, la Cena sempre DOPO le 19:00, e ALMENO 1 tappa serale dopo cena. ${baseRule}`;
  }
  return `L'itinerario DEVE avere ESATTAMENTE 3 o 4 tappe CULTURALI al mattino, poi una tappa Pranzo di 1.5 ore verso le 13:00, poi ESATTAMENTE 3 o 4 tappe CULTURALI al pomeriggio e la Cena sempre DOPO le 19:00. ${baseRule}`;
}

// ==========================================
// VIATOR API — Sandbox endpoint con mappa destinazioni MONDIALE
// ==========================================

// Mappa mondiale delle principali destinazioni ai destinationId di Viator
// Fonte: Viator API taxonomy. Chiave = nome normalizzato (lowercase, senza accenti).
const VIATOR_DESTINATION_MAP: Record<string, number> = {
  // ── ITALIA ──
  "roma": 734, "rome": 734,
  "firenze": 657, "florence": 657,
  "venezia": 773, "venice": 773,
  "milano": 5061, "milan": 5061, // Corretto da 525 (Amsterdam) a 5061 (Milano Lombardy)
  "napoli": 531, "naples": 531,
  "torino": 769, "turin": 769,
  "bologna": 606,
  "palermo": 24757,
  "genova": 658, "genoa": 658,
  "verona": 776, "pisa": 737, "siena": 749,
  "catania": 24769, "bari": 24787,
  "amalfi": 4816, "costiera amalfitana": 4816, "amalfi coast": 4816,
  "cinque terre": 4889,
  "como": 22422, "lago di como": 22422, "lake como": 22422,
  "sorrento": 4820, "positano": 23101,
  "ravenna": 24824, "lucca": 24797, "perugia": 24823, "assisi": 24764,
  "orvieto": 24814, "pompei": 4819, "pompeii": 4819,
  "capri": 4817, "taormina": 24842, "matera": 24800, "lecce": 24795,
  "toscana": 4835, "tuscany": 4835,
  "sicilia": 4833, "sicily": 4833,
  "sardegna": 4832, "sardinia": 4832,
  "puglia": 23097, "apulia": 23097,
  
  // ── EUROPA ──
  "parigi": 479, "paris": 479,
  "londra": 687, "london": 687,
  "barcellona": 562, "barcelona": 562,
  "madrid": 510,
  "amsterdam": 525,
  "berlino": 573, "berlin": 573,
  "monaco": 530, "munich": 530, "munchen": 530,
  "vienna": 780, "wien": 780,
  "praga": 745, "prague": 745, "praha": 745,
  "budapest": 618,
  "lisbona": 538, "lisbon": 538, "lisboa": 538,
  "porto": 4248,
  "dublino": 644, "dublin": 644,
  "edimburgo": 645, "edinburgh": 645,
  "atene": 551, "athens": 551,
  "santorini": 4509, "mykonos": 4513,
  "istanbul": 678,
  "cracovia": 23139, "krakow": 23139,
  "varsavia": 23140, "warsaw": 23140,
  "zurigo": 790, "zurich": 790,
  "ginevra": 660, "geneva": 660,
  "bruxelles": 615, "brussels": 615,
  "bruges": 4891,
  "copenaghen": 634, "copenhagen": 634,
  "stoccolma": 758, "stockholm": 758,
  "oslo": 4246,
  "helsinki": 4239,
  "nizza": 534, "nice": 534,
  "marsiglia": 517, "marseille": 517,
  "lione": 505, "lyon": 505,
  "siviglia": 748, "seville": 748,
  "valencia": 771,
  "granada": 665,
  "malaga": 23111,
  "dubrovnik": 4890,
  "spalato": 23124, "split": 23124,
  "salisburgo": 742, "salzburg": 742,
  "mosca": 527, "moscow": 527,
  "san pietroburgo": 4257, "saint petersburg": 4257,
  "reykjavik": 21944,
  
  // ── AMERICHE ──
  "new york": 712, "nyc": 712,
  "los angeles": 695,
  "san francisco": 651,
  "las vegas": 684,
  "miami": 662,
  "chicago": 623,
  "washington": 656, "washington dc": 656,
  "boston": 610,
  "new orleans": 711,
  "hawaii": 672, "honolulu": 672, "maui": 4254,
  "cancun": 620,
  "citta del messico": 524, "mexico city": 524, "ciudad de mexico": 524,
  "rio de janeiro": 4249,
  "buenos aires": 5476,
  "lima": 4245,
  "bogota": 22208,
  "cartagena": 22205,
  "cusco": 4256,
  "san jose": 22199, // Costa Rica
  "nassau": 4240, // Bahamas
  "punta cana": 22231,
  "montego bay": 4244, // Jamaica
  
  // ── ASIA & OCEANIA ──
  "tokyo": 766,
  "kyoto": 4802,
  "osaka": 4804,
  "bangkok": 563,
  "singapore": 752, "singapura": 752,
  "hong kong": 674,
  "shanghai": 4266,
  "pechino": 568, "beijing": 568,
  "bali": 4799, "ubud": 22024,
  "kuala lumpur": 4241,
  "hanoi": 22178, "ho chi minh": 22188,
  "seoul": 4254,
  "delhi": 634, "new delhi": 634,
  "mumbai": 4260,
  "jaipur": 4231,
  "dubai": 643,
  "abu dhabi": 4210,
  "doha": 22281,
  "sydney": 762,
  "melbourne": 4216,
  "auckland": 4235,
  "queenstown": 4252,
  
  // ── AFRICA & MEDIO ORIENTE ──
  "il cairo": 619, "cairo": 619,
  "marrakech": 4251,
  "fez": 4225,
  "casablanca": 22338,
  "cape town": 21910, "citta del capo": 21910,
  "johannesburg": 22361,
  "nairobi": 23212,
  "gerusalemme": 670, "jerusalem": 670,
  "tel aviv": 22156,
};

const VIATOR_API_HOST = process.env.VIATOR_PRODUCTION === 'true' ? "api.viator.com" : "api.sandbox.viator.com";

async function resolveDestinationId(cityName: string, apiKey: string): Promise<number | null> {
  if (!cityName) return null;
  const normalized = cityName.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // 1. Cerca match esatto nella mappa locale
  if (VIATOR_DESTINATION_MAP[normalized]) return VIATOR_DESTINATION_MAP[normalized];
  
  // 2. Cerca match parziale
  for (const [key, id] of Object.entries(VIATOR_DESTINATION_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) return id;
  }
  
  // 3. Fallback intelligente: ricerca dinamica tramite API Viator Freetext / Locations
  console.log(`[Viator] Città '${cityName}' non nella mappa statica. Eseguo ricerca dinamica...`);
  try {
    const payload = {
      searchTerm: cityName,
      searchTypes: [{ searchType: "DESTINATIONS" }],
      currency: "EUR",
      // Senza pagination Viator risponde 400 "Missing pagination" anche con
      // una chiave valida: la ricerca dinamica delle destinazioni falliva
      // sempre e si finiva sul fallback freetext dei prodotti.
      pagination: { start: 1, count: 5 }
    };
    const res = await axios.post(`https://${VIATOR_API_HOST}/partner/search/freetext`, payload, {
      headers: {
        "exp-api-key": apiKey,
        "Accept": "application/json;version=2.0",
        "Accept-Language": "it-IT",
        "Content-Type": "application/json"
      },
      timeout: 5000
    });
    
    // Controlla se la ricerca freetext ha trovato destinazioni
    if (res.data && res.data.destinations && res.data.destinations.length > 0) {
      const bestDest = res.data.destinations[0];
      if (bestDest.destinationId) {
         console.log(`[Viator] Ricerca dinamica: '${cityName}' mappata al destinationId ${bestDest.destinationId} (${bestDest.name})`);
         return bestDest.destinationId;
      }
    }
    
    // In alternativa, tentiamo l'API /locations/search (se supportata dal sandbox v2)
    const locRes = await axios.post(`https://${VIATOR_API_HOST}/partner/locations/search`, {
      locations: [{ locationName: cityName }]
    }, {
      headers: {
        "exp-api-key": apiKey,
        "Accept": "application/json;version=2.0",
        "Accept-Language": "it-IT",
        "Content-Type": "application/json"
      },
      timeout: 5000
    });
    if (locRes.data && locRes.data.locations && locRes.data.locations.length > 0) {
      const loc = locRes.data.locations[0];
      if (loc.destinationId) {
        console.log(`[Viator] /locations/search dinamica: '${cityName}' mappata al destinationId ${loc.destinationId}`);
        return loc.destinationId;
      }
    }
  } catch (err: any) {
    console.warn(`[Viator] Ricerca dinamica destinazione per '${cityName}' fallita:`, err.message);
  }
  
  return null;
}

/**
 * Link Viator tracciato secondo il formato ufficiale del programma
 * (?pid=…&mcid=…&medium=link). Ordine di precedenza:
 *  1. l'URL è già tracciato dall'API → si lascia intatto;
 *  2. VIATOR_PARTNER_ID configurato → parametri ufficiali;
 *  3. nessun partner id → vecchio shortlink (attribuzione non garantita).
 */
function buildViatorAffiliateUrl(rawUrl: string, affiliatePrefix: string): string {
  if (/[?&]pid=/i.test(rawUrl)) return rawUrl;

  const partnerId = process.env.VIATOR_PARTNER_ID || process.env.VITE_VIATOR_PARTNER_ID;
  if (partnerId) {
    const mcid = process.env.VIATOR_MCID || "42383";
    const sep = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${sep}pid=${encodeURIComponent(partnerId)}&mcid=${encodeURIComponent(mcid)}&medium=link`;
  }

  return `${affiliatePrefix}${encodeURIComponent(rawUrl)}`;
}

function formatViatorProduct(p: any, affiliatePrefix: string) {
  const rawUrl = p.productUrl || `https://www.viator.com/tours/id/${p.productCode}`;
  const affiliateUrl = buildViatorAffiliateUrl(rawUrl, affiliatePrefix);
  return {
    name: p.title || p.name,
    description: p.description || p.shortDescription || "Esperienza imperdibile",
    url: affiliateUrl,
    imageUrl: p.images?.[0]?.variants?.[0]?.url || "https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb?auto=format&fit=crop&q=80&w=400",
    duration: p.duration?.fixedDurationInMinutes ? `${p.duration.fixedDurationInMinutes} min` : "Durata variabile",
    price: p.pricing?.summary?.fromPrice ? `Da ${p.pricing.summary.fromPrice} EUR` : "Prezzo su richiesta",
    rating: p.reviews?.combinedAverageRating || "Nuovo"
  };
}

export async function searchViatorExperiences(lat: number, lng: number, radiusKm: number = 100, startDate?: string, endDate?: string, cityName?: string): Promise<string> {
  const apiKey = process.env.VIATOR_API_KEY || process.env.VITE_VIATOR_API_KEY;
  if (!apiKey) {
    console.error("[Viator] VIATOR_API_KEY non trovata nel .env!");
    return JSON.stringify([]);
  }
  
  try {
    const affiliatePrefix = "https://vi.me/vNn2S?url=";
    
    // Fallback date a 30 giorni se non specificate
    if (!startDate) startDate = new Date().toISOString().split("T")[0];
    if (!endDate) endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // ── Risolvi il destinationId dinamicamente ──
    let destinationId = await resolveDestinationId(cityName || "", apiKey);
    
    // Se non troviamo il destinationId, possiamo provare una ricerca prodotti "Freetext"
    if (!destinationId) {
      console.log(`[Viator] Città '${cityName}' non trovata dinamicamente. Fallback a ricerca Freetext su PRODUCTS.`);
      const freePayload = {
        searchTerm: cityName || "Italia",
        searchTypes: [{ searchType: "PRODUCTS" }],
        currency: "EUR",
        pagination: { start: 1, count: 8 }
      };
      const freeRes = await axios.post(`https://${VIATOR_API_HOST}/partner/search/freetext`, freePayload, {
        headers: {
          "exp-api-key": apiKey,
          "Accept": "application/json;version=2.0",
          "Accept-Language": "it-IT",
          "Content-Type": "application/json"
        },
        timeout: 10000
      });
      const prods = freeRes.data?.products || [];
      if (prods.length === 0) return JSON.stringify([]);
      console.log(`[Viator] ✅ Trovati ${prods.length} prodotti tramite Freetext per '${cityName}'`);
      return JSON.stringify(prods.slice(0, 8).map((p: any) => formatViatorProduct(p, affiliatePrefix)));
    }

    console.log(`[Viator] Ricerca prodotti per '${cityName}' → destinationId: ${destinationId}`);
    
    const prodPayload = {
      filtering: {
        destination: destinationId.toString(),
        startDate: startDate,
        endDate: endDate
      },
      sorting: {
        sort: "TRAVELER_RATING"
      },
      pagination: {
        start: 1,
        count: 8
      },
      currency: "EUR"
    };
    
    const prodRes = await axios.post(`https://${VIATOR_API_HOST}/partner/products/search`, prodPayload, {
      headers: {
        "exp-api-key": apiKey,
        "Accept": "application/json;version=2.0",
        "Accept-Language": "it-IT",
        "Content-Type": "application/json"
      },
      timeout: 10000
    });
    
    const products = prodRes.data?.products;
    if (!products || products.length === 0) {
      console.log(`[Viator] Nessun prodotto trovato per destinationId ${destinationId}`);
      return JSON.stringify([]);
    }

    console.log(`[Viator] ✅ Trovati ${products.length} prodotti (totale: ${prodRes.data.totalCount || '?'}) per '${cityName}'`);
    
    const results = products.map((p: any) => formatViatorProduct(p, affiliatePrefix));
    return JSON.stringify(results);

  } catch (err: any) {
    const status = err.response?.status;
    const errData = err.response?.data;
    console.error(`[Viator] API Error (HTTP ${status}):`, err.message, errData ? JSON.stringify(errData).substring(0, 500) : '');
    
    // Fallback finale: restituisci array vuoto
    console.warn("[Viator] Tutti i tentativi falliti, restituisco array vuoto.");
    return JSON.stringify([]);
  }
}

