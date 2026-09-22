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

// Mappa mondiale delle principali destinazioni ai destinationId di Viator.
// Chiave = nome normalizzato (minuscolo, senza accenti né punteggiatura).
//
// NON SI SCRIVE A MANO (19/09/2026). La mappa di prima era inventata: 178 voci
// su 186 sbagliate, verificate contro /partner/destinations — «roma» puntava
// alla Slovenia, «pisa» a Londra, «londra» a New York, «praga» all'Oman, e
// metà degli id non esistevano (Milano 5061 → zero prodotti). Da quando esiste
// questa funzione Viator dava tour di un altro paese oppure niente. Il blocco
// qui sotto è generato da `scratch/rigenera-mappa-viator.mjs`, che cerca ogni
// nome nell'elenco UFFICIALE: per aggiungere una città si aggiunge il nome
// allo script e lo si rilancia, mai un numero qui. Chi manca dalla mappa non è
// un problema: lo risolve la ricerca dinamica in resolveDestinationId.
const VIATOR_DESTINATION_MAP: Record<string, number> = {
  // ── ITALIA ──
  "rome": 511, "roma": 511, // Rome (CITY)
  "florence": 519, "firenze": 519, // Florence (CITY)
  "venice": 522, "venezia": 522, // Venice (CITY)
  "milan": 512, "milano": 512, // Milan (CITY)
  "naples": 22381, "napoli": 22381, // Naples (CITY)
  "turin": 802, "torino": 802, // Turin (CITY)
  "bologna": 791, // Bologna (CITY)
  "palermo": 4815, // Palermo (CITY)
  "genoa": 805, "genova": 805, // Genoa (CITY)
  "verona": 945, // Verona (CITY)
  "pisa": 520, // Pisa (CITY)
  "siena": 944, // Siena (CITY)
  "catania": 22664, // Catania (CITY)
  "bari": 4226, // Bari (CITY)
  "amalfi": 33601, // Amalfi (CITY)
  "amalfi coast": 946, "costiera amalfitana": 946, // Amalfi Coast (REGION)
  "cinque terre": 22149, // Cinque Terre (CITY)
  "lake como": 26113, "lago di como": 26113, "como": 26113, // Lake Como (CITY)
  "sorrento": 947, // Sorrento (CITY)
  "positano": 33602, // Positano (CITY)
  "ravenna": 4236, // Ravenna (CITY)
  "lucca": 22436, // Lucca (CITY)
  "perugia": 22034, // Perugia (CITY)
  "assisi": 27667, // Assisi (CITY)
  "orvieto": 22810, // Orvieto (CITY)
  "pompeii": 24336, "pompei": 24336, // Pompeii (CITY)
  "capri": 4223, // Capri (CITY)
  "taormina": 4237, // Taormina (CITY)
  "matera": 22632, // Matera (CITY)
  "lecce": 22769, // Lecce (CITY)
  "tuscany": 206, "toscana": 206, // Tuscany (REGION)
  "sicily": 205, "sicilia": 205, // Sicily (REGION)
  "sardinia": 24293, "sardegna": 24293, // Sardinia (REGION)
  "puglia": 5538, "apulia": 5538, // Puglia (REGION)
  "chianti": 26111, // Chianti (CITY)
  "trieste": 4239, // Trieste (CITY)
  "olbia": 4231, // Olbia (CITY)
  "padua": 23521, "padova": 23521, // Padua (CITY)
  "lake garda": 27338, "lago di garda": 27338, // Lake Garda (CITY)
  "la spezia": 29856, // La Spezia (CITY)
  "cagliari": 4229, // Cagliari (CITY)
  "alghero": 4222, // Alghero (CITY)
  "syracuse": 22435, "siracusa": 22435, // Syracuse (CITY)
  "bergamo": 27538, // Bergamo (CITY)
  "trento": 29399, // Trento (CITY)
  "bolzano": 29398, // Bolzano (CITY)
  "rimini": 30027, // Rimini (CITY)
  "parma": 27234, // Parma (CITY)
  "modena": 25818, // Modena (CITY)
  "ferrara": 27187, // Ferrara (CITY)
  "arezzo": 22631, // Arezzo (CITY)
  "san gimignano": 29096, // San Gimignano (CITY)
  "montepulciano": 27742, // Montepulciano (CITY)
  "tropea": 33165, // Tropea (CITY)
  // ── EUROPA ──
  "paris": 479, "parigi": 479, // Paris (CITY)
  "london": 737, "londra": 737, // London (CITY)
  "barcelona": 562, "barcellona": 562, // Barcelona (CITY)
  "madrid": 566, // Madrid (CITY)
  "amsterdam": 525, // Amsterdam (CITY)
  "berlin": 488, "berlino": 488, // Berlin (CITY)
  "munich": 487, "monaco di baviera": 487, "munchen": 487, // Munich (CITY)
  "vienna": 454, "wien": 454, // Vienna (CITY)
  "prague": 462, "praga": 462, "praha": 462, // Prague (CITY)
  "budapest": 499, // Budapest (CITY)
  "lisbon": 538, "lisbona": 538, "lisboa": 538, // Lisbon (CITY)
  "porto": 26879, "oporto": 26879, // Porto (CITY)
  "dublin": 503, "dublino": 503, // Dublin (CITY)
  "edinburgh": 739, "edimburgo": 739, // Edinburgh (CITY)
  "athens": 496, "atene": 496, // Athens (CITY)
  "santorini": 959, // Santorini (CITY)
  "mykonos": 958, // Mykonos (CITY)
  "istanbul": 585, // Istanbul (CITY)
  "krakow": 529, "cracovia": 529, // Krakow (CITY)
  "warsaw": 528, "varsavia": 528, // Warsaw (CITY)
  "zurich": 577, "zurigo": 577, // Zurich (CITY)
  "geneva": 578, "ginevra": 578, // Geneva (CITY)
  "brussels": 458, "bruxelles": 458, // Brussels (CITY)
  "bruges": 4836, // Bruges (CITY)
  "copenhagen": 463, "copenaghen": 463, // Copenhagen (CITY)
  "stockholm": 907, "stoccolma": 907, // Stockholm (CITY)
  "oslo": 902, // Oslo (CITY)
  "helsinki": 803, // Helsinki (CITY)
  "nice": 478, "nizza": 478, // Nice (CITY)
  "marseille": 485, "marsiglia": 485, // Marseille (CITY)
  "lyon": 829, "lione": 829, // Lyon (CITY)
  "seville": 556, "siviglia": 556, "sevilla": 556, // Seville (CITY)
  "valencia": 811, // Valencia (CITY)
  "granada": 4853, // Granada (CITY)
  "malaga": 956, // Malaga (CITY)
  "dubrovnik": 904, // Dubrovnik (CITY)
  "split": 4185, "spalato": 4185, // Split (CITY)
  "salzburg": 451, "salisburgo": 451, // Salzburg (CITY)
  "reykjavik": 905, // Reykjavik (CITY)
  "monaco": 948, "principato di monaco": 948, "monte carlo": 948, // Monaco (COUNTRY)
  "bordeaux": 468, // Bordeaux (CITY)
  "strasbourg": 5502, "strasburgo": 5502, // Strasbourg (CITY)
  "hamburg": 777, "amburgo": 777, // Hamburg (CITY)
  "cologne": 923, "colonia": 923, "koln": 923, // Cologne (CITY)
  "frankfurt": 489, "francoforte": 489, // Frankfurt (CITY)
  "lucerne": 576, "lucerna": 576, // Lucerne (CITY)
  "interlaken": 5011, // Interlaken (CITY)
  "innsbruck": 5173, // Innsbruck (CITY)
  "bilbao": 4485, // Bilbao (CITY)
  "palma de mallorca": 60462, "palma di maiorca": 60462, // Palma de Mallorca (CITY)
  "tenerife": 5404, // Tenerife (CITY)
  "ibiza": 4217, // Ibiza (CITY)
  "madeira": 5392, // Madeira (REGION)
  "faro": 23402, // Faro (CITY)
  "sintra": 50861, // Sintra (CITY)
  "tallinn": 4147, // Tallinn (CITY)
  "riga": 4480, // Riga (CITY)
  "vilnius": 5479, // Vilnius (CITY)
  "ljubljana": 5257, "lubiana": 5257, // Ljubljana (CITY)
  "zagreb": 5391, "zagabria": 5391, // Zagreb (CITY)
  "belgrade": 22817, "belgrado": 22817, // Belgrade (CITY)
  "bucharest": 22134, "bucarest": 22134, // Bucharest (CITY)
  "sofia": 5630, // Sofia (CITY)
  "valletta": 4142, "la valletta": 4142, // Valletta (CITY)
  "rhodes": 4272, "rodi": 4272, // Rhodes (CITY)
  "corfu": 4279, // Corfu (CITY)
  "heraklion": 961, // Heraklion (CITY)
  "chania": 4251, // Chania (CITY)
  "thessaloniki": 23853, "salonicco": 23853, // Thessaloniki (CITY)
  "bergen": 4318, // Bergen (CITY)
  "tromso": 4362, // Tromso (CITY)
  "rovaniemi": 22130, // Rovaniemi (CITY)
  "gothenburg": 4280, "goteborg": 4280, // Gothenburg (CITY)
  "manchester": 4056, // Manchester (CITY)
  "liverpool": 940, // Liverpool (CITY)
  "bath": 27175, // Bath (CITY)
  "oxford": 5537, // Oxford (CITY)
  "cambridge": 22327, // Cambridge (CITY)
  "glasgow": 740, // Glasgow (CITY)
  "belfast": 738, // Belfast (CITY)
  "cork": 22039, // Cork (CITY)
  "galway": 5156, // Galway (CITY)
  "antwerp": 764, "anversa": 764, // Antwerp (CITY)
  "rotterdam": 4211, // Rotterdam (CITY)
  "luxembourg": 21797, "lussemburgo": 21797, // Luxembourg (COUNTRY)
  // ── AMERICHE ──
  "new york city": 687, "new york": 687, "nyc": 687, // New York City (CITY)
  "los angeles": 645, // Los Angeles (CITY)
  "san francisco": 651, // San Francisco (CITY)
  "las vegas": 684, // Las Vegas (CITY)
  "miami": 662, // Miami (CITY)
  "chicago": 673, // Chicago (CITY)
  "washington dc": 657, "washington": 657, // Washington DC (CITY)
  "boston": 678, // Boston (CITY)
  "new orleans": 675, // New Orleans (CITY)
  "oahu": 672, "honolulu": 672, "hawaii": 672, // Oahu (CITY)
  "maui": 671, // Maui (CITY)
  "orlando": 663, // Orlando (CITY)
  "san diego": 736, // San Diego (CITY)
  "seattle": 704, // Seattle (CITY)
  "toronto": 623, // Toronto (CITY)
  "vancouver": 616, // Vancouver (CITY)
  "montreal": 625, // Montreal (CITY)
  "quebec city": 626, "quebec": 626, // Quebec City (CITY)
  "niagara falls around": 773, "niagara falls": 773, "cascate del niagara": 773, // Niagara Falls & Around (CITY)
  "cancun": 631, // Cancun (CITY)
  "mexico city": 628, "citta del messico": 628, "ciudad de mexico": 628, // Mexico City (CITY)
  "playa del carmen": 5501, // Playa del Carmen (CITY)
  "tulum": 23012, // Tulum (CITY)
  "rio de janeiro": 712, // Rio de Janeiro (CITY)
  "sao paulo": 5112, "san paolo": 5112, // Sao Paulo (CITY)
  "buenos aires": 901, // Buenos Aires (CITY)
  "mendoza": 931, // Mendoza (CITY)
  "bariloche": 938, // Bariloche (CITY)
  "ushuaia": 933, // Ushuaia (CITY)
  "santiago": 713, // Santiago (CITY)
  "lima": 928, // Lima (CITY)
  "cusco": 937, "cuzco": 937, // Cusco (CITY)
  "bogota": 4560, // Bogotá (CITY)
  "cartagena": 4276, // Cartagena (CITY)
  "medellin": 4563, // Medellín (CITY)
  "quito": 735, // Quito (CITY)
  "la paz": 5027, // La Paz (CITY)
  "san jose": 25463, // San Jose (CITY)
  "nassau": 420, // Nassau (CITY)
  "punta cana": 794, // Punta Cana (CITY)
  "montego bay": 432, // Montego Bay (CITY)
  "panama city": 950, "panama": 950, // Panama City (CITY)
  // ── ASIA E OCEANIA ──
  "tokyo": 334, // Tokyo (CITY)
  "kyoto": 332, // Kyoto (CITY)
  "osaka": 333, // Osaka (CITY)
  "hiroshima": 4661, // Hiroshima (CITY)
  "bangkok": 343, // Bangkok (CITY)
  "phuket": 349, // Phuket (CITY)
  "chiang mai": 5267, // Chiang Mai (CITY)
  "singapore": 60449, "singapura": 60449, // Singapore (CITY)
  "shanghai": 325, // Shanghai (CITY)
  "beijing": 321, "pechino": 321, // Beijing (CITY)
  "xian": 326, "xi an": 326, // Xian (CITY)
  "bali": 50944, // Bali (VILLAGE)
  "ubud": 5467, // Ubud (CITY)
  "kuala lumpur": 335, // Kuala Lumpur (CITY)
  "hanoi": 351, // Hanoi (CITY)
  "ho chi minh city": 352, "ho chi minh": 352, "saigon": 352, // Ho Chi Minh City (CITY)
  "hoi an": 5229, // Hoi An (CITY)
  "siem reap": 5480, // Siem Reap (CITY)
  "seoul": 973, // Seoul (CITY)
  "new delhi": 804, "delhi": 804, "nuova delhi": 804, // New Delhi (CITY)
  "mumbai": 953, "bombay": 953, // Mumbai (CITY)
  "jaipur": 4627, // Jaipur (CITY)
  "agra": 4547, // Agra (CITY)
  "kathmandu": 5109, // Kathmandu (CITY)
  "colombo": 4619, // Colombo (CITY)
  "dubai": 828, // Dubai (CITY)
  "abu dhabi": 4474, // Abu Dhabi (CITY)
  "doha": 4453, // Doha (CITY)
  "sydney": 4413, // Sydney (CITY)
  "melbourne": 384, // Melbourne (CITY)
  "cairns the tropical north": 754, "cairns": 754, // Cairns & the Tropical North (CITY)
  "auckland": 391, // Auckland (CITY)
  "queenstown": 407, // Queenstown (CITY)
  // ── AFRICA E MEDIO ORIENTE ──
  "cairo": 782, "il cairo": 782, // Cairo (CITY)
  "luxor": 826, // Luxor (CITY)
  "marrakech": 5408, "marrakesh": 5408, // Marrakech (CITY)
  "fez": 22151, "fes": 22151, // Fez (CITY)
  "casablanca": 4396, // Casablanca (CITY)
  "cape town": 318, "citta del capo": 318, // Cape Town (CITY)
  "johannesburg": 314, // Johannesburg (CITY)
  "nairobi": 5280, // Nairobi (CITY)
  "zanzibar": 5590, // Zanzibar (REGION)
  "jerusalem": 921, "gerusalemme": 921, // Jerusalem (CITY)
  "tel aviv": 920, // Tel Aviv (CITY)
  "amman": 5503, // Amman (CITY)
  "petra": 24520, // Petra (CITY)
  "tunis": 30157, "tunisi": 30157, // Tunis (CITY)
};

// Host valutato AL MOMENTO DELLA CHIAMATA, non all'import: nel bundle di
// produzione (dist/server.cjs) questo modulo viene inizializzato PRIMA che
// server.ts esegua dotenv.config(), quindi una costante qui leggerebbe sempre
// un process.env vuoto e finirebbe sulla sandbox — che con una chiave di
// produzione risponde 401 "Invalid API Key" (visto sul droplet il 18/08/2026).
//
// VALORE TOLLERANTE E RIPIEGO SUL 401 (19/09/2026). Il confronto secco
// `=== 'true'` bastava a spegnere Viator: misurato in produzione, 0 esperienze
// a Milano, Roma e Parigi in 260 ms, mentre la stessa chiave in locale ne dà
// migliaia. Un «True», un «1» o un a-capo in coda al valore su Vercel (capita
// con `echo true | vercel env add`) mandavano tutto sulla sandbox, che alla
// chiave vera risponde 401 — e ogni chiamante trasforma l'errore in lista
// vuota, quindi nessuno se ne accorgeva. Ora il valore si legge con
// tolleranza, e se l'host scelto risponde 401/403 si prova l'altro UNA volta:
// quello che funziona resta in memoria per le chiamate successive.
const VIATOR_HOST_PROD = "api.viator.com";
const VIATOR_HOST_SANDBOX = "api.sandbox.viator.com";
let viatorHostProvato: string | null = null;
const viatorApiHost = () => {
  if (viatorHostProvato) return viatorHostProvato;
  const v = String(process.env.VIATOR_PRODUCTION ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'si', 'on'].includes(v) ? VIATOR_HOST_PROD : VIATOR_HOST_SANDBOX;
};
async function viatorPost(path: string, payload: any, config: any): Promise<any> {
  const primo = viatorApiHost();
  try {
    return await axios.post(`https://${primo}${path}`, payload, config);
  } catch (err: any) {
    const stato = err?.response?.status;
    if (stato !== 401 && stato !== 403) throw err;
    const altro = primo === VIATOR_HOST_PROD ? VIATOR_HOST_SANDBOX : VIATOR_HOST_PROD;
    const res = await axios.post(`https://${altro}${path}`, payload, config);
    if (viatorHostProvato !== altro) {
      console.warn(`[Viator] ${primo} ha risposto ${stato}, ${altro} funziona: uso ${altro}. Controllare VIATOR_PRODUCTION nelle variabili d'ambiente.`);
      viatorHostProvato = altro;
    }
    return res;
  }
}

async function resolveDestinationId(cityName: string, apiKey: string): Promise<number | null> {
  if (!cityName) return null;
  // Stessa normalizzazione con cui lo script genera le chiavi della mappa.
  const normalized = cityName.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  // 1. Match esatto nella mappa locale
  if (VIATOR_DESTINATION_MAP[normalized]) return VIATOR_DESTINATION_MAP[normalized];

  // 2. Solo la parte prima della virgola (\u00abMilano, citt\u00e0 metropolitana di
  //    Milano, Italia\u00bb \u2192 \u00abmilano\u00bb), sempre a match ESATTO. Il vecchio
  //    \u00abcontiene, in un verso o nell'altro\u00bb era una fabbrica di errori:
  //    \u00abBariloche\u00bb contiene \u00abbari\u00bb, \u00abLimassol\u00bb contiene \u00ablima\u00bb, \u00abPorto Alegre\u00bb
  //    e \u00abPortofino\u00bb contengono \u00abporto\u00bb, e il verso opposto mandava \u00abSan\u00bb su
  //    San Jos\u00e9. Tutto il resto lo risolve la ricerca dinamica qui sotto, che
  //    chiede a Viator invece di indovinare.
  const primaDellaVirgola = cityName.split(",")[0].toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (primaDellaVirgola && VIATOR_DESTINATION_MAP[primaDellaVirgola]) return VIATOR_DESTINATION_MAP[primaDellaVirgola];

  // 3. Fallback intelligente: ricerca dinamica tramite API Viator Freetext / Locations
  console.log(`[Viator] Città '${cityName}' non nella mappa statica. Eseguo ricerca dinamica...`);
  try {
    const payload = {
      searchTerm: cityName,
      // La pagination va DENTRO il searchType (12/09/2026): con quella
      // solo in cima Viator rispondeva ancora 400 «Missing pagination», la
      // ricerca dinamica falliva sempre e si finiva sul fallback freetext
      // dei prodotti, che aveva lo stesso difetto — risultato: zero
      // esperienze Viator ovunque, da quando esiste questa funzione.
      searchTypes: [{ searchType: "DESTINATIONS", pagination: { start: 1, count: 5 } }],
      currency: "EUR",
      pagination: { start: 1, count: 5 }
    };
    const res = await viatorPost(`/partner/search/freetext`, payload, {
      headers: {
        "exp-api-key": apiKey,
        "Accept": "application/json;version=2.0",
        "Accept-Language": "it-IT",
        "Content-Type": "application/json"
      },
      timeout: 5000
    });
    
    // Controlla se la ricerca freetext ha trovato destinazioni
    // La risposta vera è `destinations.results[]` con il campo `id`
    // (verificato il 19/09/2026: «Milan» → {id: 512, name: "Milano"}). Il
    // codice leggeva `destinations[]` e `destinationId`: non trovava MAI
    // niente, e ogni città fuori dalla mappa statica finiva sul freetext dei
    // prodotti, che ignora il luogo. Si leggono entrambe le forme.
    const elencoDest = Array.isArray(res.data?.destinations?.results) ? res.data.destinations.results
      : Array.isArray(res.data?.destinations) ? res.data.destinations : [];
    if (elencoDest.length > 0) {
      const bestDest = elencoDest[0];
      const idDest = Number(bestDest.id ?? bestDest.destinationId);
      if (Number.isFinite(idDest) && idDest > 0) {
         console.log(`[Viator] Ricerca dinamica: '${cityName}' mappata al destinationId ${idDest} (${bestDest.name})`);
         return idDest;
      }
    }
    
    // In alternativa, tentiamo l'API /locations/search (se supportata dal sandbox v2)
    const locRes = await viatorPost(`/partner/locations/search`, {
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
    // Niente foto di ripiego da archivio: la card senza immagine mostra
    // l'emoji della categoria (regola del progetto, 22/08/2026).
    imageUrl: p.images?.[0]?.variants?.[0]?.url || "",
    duration: p.duration?.fixedDurationInMinutes ? `${p.duration.fixedDurationInMinutes} min` : "Durata variabile",
    price: p.pricing?.summary?.fromPrice ? `Da ${p.pricing.summary.fromPrice} EUR` : "Prezzo su richiesta",
    rating: p.reviews?.combinedAverageRating || "Nuovo"
  };
}

/** Accept-Language di Viator per la lingua dell'app (prima era cablato it-IT). */
const VIATOR_LANG: Record<string, string> = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', ru: 'ru-RU', zh: 'zh-CN' };
export const viatorAcceptLanguage = (lang?: string) => VIATOR_LANG[String(lang || 'it').slice(0, 2).toLowerCase()] || 'it-IT';

/**
 * Ricerca libera di prodotti Viator («mercatini di Natale Vienna», «cherry
 * blossom Kyoto»): serve agli Stagionali e alle mostre. Stesso formato di
 * searchViatorExperiences.
 */
export async function searchViatorFreetext(term: string, lang: string = 'it', count: number = 12): Promise<any[]> {
  const apiKey = process.env.VIATOR_API_KEY || process.env.VITE_VIATOR_API_KEY;
  if (!apiKey || !term) return [];
  try {
    const res = await viatorPost(`/partner/search/freetext`, {
      searchTerm: term,
      searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: Math.min(50, Math.max(1, count)) } }],
      currency: "EUR",
      pagination: { start: 1, count: Math.min(50, Math.max(1, count)) }
    }, {
      headers: {
        "exp-api-key": apiKey,
        "Accept": "application/json;version=2.0",
        "Accept-Language": viatorAcceptLanguage(lang),
        "Content-Type": "application/json"
      },
      timeout: 10000
    });
    const prods = res.data?.products?.results || res.data?.products || [];
    return (Array.isArray(prods) ? prods : []).map((p: any) => formatViatorProduct(p, "https://vi.me/vNn2S?url="));
  } catch (err: any) {
    console.warn(`[Viator] freetext '${term}' fallita:`, err.response?.status || err.message);
    return [];
  }
}

export async function searchViatorExperiences(lat: number, lng: number, radiusKm: number = 100, startDate?: string, endDate?: string, cityName?: string, lang: string = 'it', count: number = 20): Promise<string> {
  const apiKey = process.env.VIATOR_API_KEY || process.env.VITE_VIATOR_API_KEY;
  if (!apiKey) {
    console.error("[Viator] VIATOR_API_KEY non trovata nel .env!");
    return JSON.stringify([]);
  }

  try {
    const affiliatePrefix = "https://vi.me/vNn2S?url=";
    const acceptLanguage = viatorAcceptLanguage(lang);
    const quanti = Math.min(50, Math.max(1, count));

    // Fallback date a 30 giorni se non specificate
    if (!startDate) startDate = new Date().toISOString().split("T")[0];
    if (!endDate) endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // ── Risolvi il destinationId dinamicamente ──
    let destinationId = await resolveDestinationId(cityName || "", apiKey);

    // Se non troviamo il destinationId, possiamo provare una ricerca prodotti "Freetext"
    if (!destinationId) {
      console.log(`[Viator] Città '${cityName}' non trovata dinamicamente. Fallback a ricerca Freetext su PRODUCTS.`);
      // La paginazione va DENTRO ogni searchType, non (solo) in cima: senza
      // Viator risponde 400 «Missing pagination» e QUESTA funzione — usata
      // da musei, itinerari e libreria — tornava sempre vuota (verificato
      // il 12/09/2026 su Musei Vaticani, Uffizi, Museo del Marmo).
      // searchViatorFreetext qui sopra lo faceva già giusto.
      const freePayload = {
        searchTerm: cityName || "Italia",
        searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: quanti } }],
        currency: "EUR",
        pagination: { start: 1, count: quanti }
      };
      const freeRes = await viatorPost(`/partner/search/freetext`, freePayload, {
        headers: {
          "exp-api-key": apiKey,
          "Accept": "application/json;version=2.0",
          "Accept-Language": acceptLanguage,
          "Content-Type": "application/json"
        },
        timeout: 10000
      });
      const prods = freeRes.data?.products?.results || freeRes.data?.products || [];
      if (!Array.isArray(prods) || prods.length === 0) return JSON.stringify([]);
      console.log(`[Viator] ✅ Trovati ${prods.length} prodotti tramite Freetext per '${cityName}'`);
      return JSON.stringify(prods.slice(0, quanti).map((p: any) => formatViatorProduct(p, affiliatePrefix)));
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
        // Prima 8: la scheda Eventi ne mostra fino a 20 (piu' scelta per
        // l'utente, piu' commissioni: e' la fonte affiliata principale).
        count: quanti
      },
      currency: "EUR"
    };

    const prodRes = await viatorPost(`/partner/products/search`, prodPayload, {
      headers: {
        "exp-api-key": apiKey,
        "Accept": "application/json;version=2.0",
        "Accept-Language": acceptLanguage,
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

