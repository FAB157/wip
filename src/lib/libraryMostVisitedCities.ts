// ─────────────────────────────────────────────────────────────────────────
// LIBRERIA ITINERARI — LE 20 CITTÀ PIÙ VISITATE AL MONDO (23/08/2026)
//
// Richiesta del committente: coprire a fondo la classifica "Most Visited
// Cities in the World" (Bangkok, Parigi, Londra, Dubai, Singapore, Kuala
// Lumpur, New York, Istanbul, Tokyo, Antalya, Seul, Hong Kong, Mecca,
// Barcellona, Phuket, Roma, Pattaya, Taipei, Milano, Praga), con almeno
// 3.000 itinerari, tutte le tipologie (compresa la coppia obbligatoria
// gratis/esperienze), stesse regole del resto del catalogo.
//
// Diciannove delle venti città avevano GIÀ un itinerario di livello città
// nel catalogo principale (ZONE_CITIES o WORLD_ZONES, con tutti gli 8
// angoli): Bangkok, Parigi, Londra, Dubai, Singapore, New York, Istanbul,
// Tokyo, Barcellona, Roma, Milano, Praga in ZONE_CITIES (1-2-3 giorni);
// Kuala Lumpur, Antalya, Seul, Hong Kong, Phuket, Taipei in WORLD_ZONES
// (2-3 giorni). Solo Pattaya mancava del tutto: aggiunta qui sotto in
// MEGACITY_TOP_LEVEL_EXTRA, stessa forma di EXTRA_WORLD_ZONES.
//
// MECCA È VOLUTAMENTE ESCLUSA. Non per dimenticanza: l'ingresso è vietato
// per legge saudita ai non musulmani (lo dice già un commento del catalogo
// principale, riga ~2997, e sacredRoutesCatalog.ts la tratta SOLO come
// pellegrinaggio Hajj/Umrah, mai come meta turistica generica). Generare
// itinerari "classica/famiglie/nascosta/relax-panorami" per una città in
// cui la maggioranza dei lettori non può nemmeno entrare sarebbe sia
// inutile sia in contraddizione con una scelta già presa nel codice.
//
// LA VERA COPERTURA STA NEI QUARTIERI. Un itinerario di 2-3 giorni per
// un'intera megalopoli tocca a malapena i simboli; Bangkok, Tokyo o New
// York hanno decine di quartieri che meritano un itinerario a sé. Qui sotto
// ci sono 11 quartieri REALI e riconoscibili per ciascuna delle 19 città
// (209 righe), ognuno con le SUE coordinate (non quelle del centro
// cittadino: un itinerario "dentro Montmartre" ancorato al Louvre
// produrrebbe tappe fuori zona) e una nota onesta e generica — lo stesso
// registro delle note di ZONE_CITIES, mai un fatto specifico non
// verificabile.
//
// Solo DATI, nessun import: come libraryZonesWorld.ts e
// libraryDescriptorsExtra.ts. Il generatore (megacityDistrictDescriptors,
// in libraryDescriptors.ts) applica le STESSE regole di zoneDescriptors:
// stessi 8 angoli (PORT_ZONE_ANGLES, gratis ed esperienze compresi),
// stessa verifica anti-invenzione, stesso schema JSON. L'unica differenza
// editoriale: 1-2 giorni invece di 1-2-3, perché un quartiere è più
// piccolo di una città intera e un terzo giorno sarebbe riempitivo.
//
// Conti: 19 città × 11 quartieri × 2 durate × 8 angoli = 3.344
//        + Pattaya livello-città (2-3 giorni × 8 angoli) = 16
//        ────────────────────────────────────────────────
//        totale nuovo: 3.360 descrittori
// ─────────────────────────────────────────────────────────────────────────

export interface MegacityDistrict {
  city: string;
  country: string;
  lat: number;
  lon: number;
  district: string;
  note: string;
}

export const MEGACITY_DISTRICTS: MegacityDistrict[] = [
  // ── BANGKOK, Thailandia ──────────────────────────────────────────────
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7539, lon: 100.4914, district: 'Rattanakosin', note: 'l\'isola storica fra i canali: Palazzo Reale, Wat Phra Kaew, Wat Pho' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7398, lon: 100.5088, district: 'Chinatown Yaowarat', note: 'street food serale, gioiellerie, il tempio del Buddha d\'oro' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7383, lon: 100.5602, district: 'Sukhumvit', note: 'grattacieli, BTS, ristoranti internazionali, vita notturna' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7998, lon: 100.5501, district: 'Chatuchak', note: 'il grande mercato del weekend, migliaia di bancarelle' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7367, lon: 100.4884, district: 'Thonburi', note: 'il lato opposto del fiume: canali (klong), Wat Arun, vita di quartiere' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7248, lon: 100.5292, district: 'Silom-Sathorn', note: 'quartiere finanziario di giorno, vita notturna la sera' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7590, lon: 100.4977, district: 'Khao San-Banglamphu', note: 'la via degli zaini in spalla, atmosfera backpacker' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7797, lon: 100.5446, district: 'Ari', note: 'quartiere di tendenza, caffè indipendenti, street art' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7280, lon: 100.5140, district: 'Charoen Krung', note: 'la via più antica della città, gallerie e boutique hotel' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7300, lon: 100.5810, district: 'Ekkamai-Thonglor', note: 'locali alla moda, design, vita notturna elegante' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.7385, lon: 100.5090, district: 'Talad Noi', note: 'vicoli sul fiume, murales, officine meccaniche riconvertite' },

  // ── PARIGI, Francia ──────────────────────────────────────────────────
  { city: 'Parigi', country: 'Francia', lat: 48.8867, lon: 2.3431, district: 'Montmartre', note: 'la collina di artisti, il Sacré-Cœur, l\'ultimo vigneto urbano' },
  { city: 'Parigi', country: 'Francia', lat: 48.8589, lon: 2.3622, district: 'Le Marais', note: 'palazzi storici, gallerie, boutique, il quartiere ebraico' },
  { city: 'Parigi', country: 'Francia', lat: 48.8496, lon: 2.3447, district: 'Quartier Latin', note: 'la Sorbona, il Panthéon, librerie e vita studentesca' },
  { city: 'Parigi', country: 'Francia', lat: 48.8539, lon: 2.3336, district: 'Saint-Germain-des-Prés', note: 'i caffè letterari storici, gallerie d\'arte, editori' },
  { city: 'Parigi', country: 'Francia', lat: 48.8698, lon: 2.3078, district: 'Champs-Élysées', note: 'la moda, l\'Arco di Trionfo, il triangolo d\'oro' },
  { city: 'Parigi', country: 'Francia', lat: 48.8554, lon: 2.3472, district: 'Île de la Cité e Île Saint-Louis', note: 'Notre-Dame, la Sainte-Chapelle, le due isole sulla Senna' },
  { city: 'Parigi', country: 'Francia', lat: 48.8709, lon: 2.3654, district: 'Canal Saint-Martin', note: 'vita di quartiere lungo l\'acqua, locali indipendenti' },
  { city: 'Parigi', country: 'Francia', lat: 48.8722, lon: 2.3833, district: 'Belleville', note: 'quartiere multiculturale, street art, vista sulla città dal parco' },
  { city: 'Parigi', country: 'Francia', lat: 48.8630, lon: 2.2870, district: 'Passy-Trocadéro', note: 'la vista più celebre sulla Torre Eiffel, musei eleganti' },
  { city: 'Parigi', country: 'Francia', lat: 48.8532, lon: 2.3692, district: 'Bastille', note: 'storia rivoluzionaria, mercato coperto, vita serale' },
  { city: 'Parigi', country: 'Francia', lat: 48.8843, lon: 2.3220, district: 'Batignolles', note: 'quartiere residenziale tranquillo, mercato biologico' },

  // ── LONDRA, Regno Unito ──────────────────────────────────────────────
  { city: 'Londra', country: 'Regno Unito', lat: 51.4994, lon: -0.1245, district: 'Westminster', note: 'il Big Ben, l\'Abbazia, Downing Street, il potere in poche vie' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5117, lon: -0.1240, district: 'Covent Garden', note: 'mercato coperto, teatri, artisti di strada' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5416, lon: -0.1447, district: 'Camden', note: 'mercati, musica dal vivo, subculture da decenni' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5090, lon: -0.1966, district: 'Notting Hill', note: 'case colorate, il mercato di Portobello Road' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5255, lon: -0.0778, district: 'Shoreditch', note: 'street art, locali indipendenti, distretto tech' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5061, lon: -0.1160, district: 'South Bank', note: 'il lungofiume, il London Eye, la Tate Modern' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.4826, lon: -0.0077, district: 'Greenwich', note: 'il meridiano, l\'osservatorio, il mercato coperto' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5136, lon: -0.1365, district: 'Soho', note: 'vita notturna, teatri, gastronomia internazionale' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5007, lon: -0.1917, district: 'Kensington', note: 'i grandi musei (V&A, Storia Naturale), i parchi reali' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.5217, lon: -0.0716, district: 'Brick Lane-East End', note: 'curry house, mercati vintage, murales' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.4875, lon: -0.1687, district: 'Chelsea', note: 'eleganza residenziale, King\'s Road, gallerie d\'arte' },

  // ── DUBAI, Emirati Arabi Uniti ───────────────────────────────────────
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.2697, lon: 55.3095, district: 'Deira', note: 'il souk storico dell\'oro e delle spezie, il creek con gli abra' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.2637, lon: 55.2972, district: 'Bur Dubai', note: 'il quartiere storico Al Fahidi, moschee, il museo di Dubai' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.1972, lon: 55.2744, district: 'Downtown Dubai', note: 'il Burj Khalifa, il Dubai Mall, le fontane danzanti' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.0805, lon: 55.1403, district: 'Dubai Marina', note: 'grattacieli sull\'acqua, la passeggiata sul canale' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.2285, lon: 55.2593, district: 'Jumeirah', note: 'spiagge, il Burj Al Arab, la moschea di Jumeirah' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.1400, lon: 55.2300, district: 'Al Quoz', note: 'ex distretto industriale riconvertito in gallerie d\'arte' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.1124, lon: 55.1390, district: 'Palm Jumeirah', note: 'l\'isola artificiale a forma di palma, resort e spiagge private' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.2610, lon: 55.3010, district: 'Al Seef', note: 'il lungofiume ristrutturato in stile tradizionale' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.1870, lon: 55.2631, district: 'Business Bay', note: 'grattacieli moderni attorno a un canale artificiale' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.2632, lon: 55.2996, district: 'Al Fahidi Historic District', note: 'case a vento, gallerie, caffè in vicoli stretti' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.2040, lon: 55.2570, district: 'City Walk', note: 'shopping a cielo aperto, architettura contemporanea' },

  // ── SINGAPORE ────────────────────────────────────────────────────────
  { city: 'Singapore', country: 'Singapore', lat: 1.2820, lon: 103.8440, district: 'Chinatown', note: 'templi, hawker centre, botteghe di medicina tradizionale' },
  { city: 'Singapore', country: 'Singapore', lat: 1.3067, lon: 103.8517, district: 'Little India', note: 'colori, spezie, templi indù, mercati serali' },
  { city: 'Singapore', country: 'Singapore', lat: 1.3025, lon: 103.8590, district: 'Kampong Glam', note: 'la moschea del Sultano, Haji Lane e le sue boutique' },
  { city: 'Singapore', country: 'Singapore', lat: 1.2838, lon: 103.8591, district: 'Marina Bay', note: 'lo skyline, i Gardens by the Bay, il Merlion' },
  { city: 'Singapore', country: 'Singapore', lat: 1.3048, lon: 103.8318, district: 'Orchard Road', note: 'lo shopping, i grandi magazzini, la via più nota della città' },
  { city: 'Singapore', country: 'Singapore', lat: 1.2494, lon: 103.8303, district: 'Sentosa', note: 'l\'isola dei resort, spiagge artificiali, parchi a tema' },
  { city: 'Singapore', country: 'Singapore', lat: 1.2847, lon: 103.8280, district: 'Tiong Bahru', note: 'architettura art déco, caffè indipendenti, vita di quartiere' },
  { city: 'Singapore', country: 'Singapore', lat: 1.3037, lon: 103.9036, district: 'Katong-Joo Chiat', note: 'case peranakan colorate, cucina nyonya' },
  { city: 'Singapore', country: 'Singapore', lat: 1.2884, lon: 103.8464, district: 'Clarke Quay-Boat Quay', note: 'il lungofiume, locali serali, magazzini ristrutturati' },
  { city: 'Singapore', country: 'Singapore', lat: 1.3006, lon: 103.8555, district: 'Bugis', note: 'mercato coperto, moschea, vita studentesca' },
  { city: 'Singapore', country: 'Singapore', lat: 1.3115, lon: 103.7963, district: 'Holland Village', note: 'vita da espatriati, ristoranti internazionali' },

  // ── KUALA LUMPUR, Malesia ────────────────────────────────────────────
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1579, lon: 101.7116, district: 'KLCC', note: 'le torri Petronas, il parco ai loro piedi, lo shopping' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1466, lon: 101.7108, district: 'Bukit Bintang', note: 'shopping, vita notturna, street food' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1436, lon: 101.6970, district: 'Petaling Street', note: 'la Chinatown della città, mercato coperto, tempio taoista' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1290, lon: 101.6860, district: 'Brickfields', note: 'la Little India della città, templi indù colorati' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1630, lon: 101.7010, district: 'Kampung Baru', note: 'villaggio malese tradizionale nel cuore del centro moderno' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1290, lon: 101.6720, district: 'Bangsar', note: 'locali alla moda, mercato notturno del weekend' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.2379, lon: 101.6840, district: 'Batu Caves', note: 'le grotte-tempio indù appena fuori dal centro' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1478, lon: 101.6933, district: 'Merdeka Square', note: 'la piazza storica dell\'indipendenza, edifici coloniali' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1730, lon: 101.7020, district: 'Titiwangsa', note: 'il lago, il parco, vista sulle torri gemelle' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1720, lon: 101.6510, district: 'Mont Kiara', note: 'quartiere residenziale internazionale, verde' },
  { city: 'Kuala Lumpur', country: 'Malesia', lat: 3.1050, lon: 101.6800, district: 'Old Klang Road', note: 'street food notturno, chioschi storici' },

  // ── NEW YORK, Stati Uniti ────────────────────────────────────────────
  { city: 'New York', country: 'Stati Uniti', lat: 40.7233, lon: -74.0030, district: 'SoHo', note: 'architettura in ghisa, boutique, gallerie d\'arte' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7336, lon: -74.0027, district: 'Greenwich Village', note: 'jazz club storici, atmosfera bohémien, piazze raccolte' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7158, lon: -73.9970, district: 'Chinatown Manhattan', note: 'mercati, ristoranti, il tempio buddista' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.8116, lon: -73.9465, district: 'Harlem', note: 'jazz, gospel, cultura afroamericana, brownstone storici' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7081, lon: -73.9571, district: 'Williamsburg', note: 'quartiere hipster di Brooklyn, street art, vista su Manhattan' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7736, lon: -73.9566, district: 'Upper East Side', note: 'i grandi musei (Met, Guggenheim), Central Park' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7465, lon: -74.0014, district: 'Chelsea Manhattan', note: 'gallerie d\'arte, la passeggiata sopraelevata della High Line' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7654, lon: -73.8318, district: 'Flushing', note: 'il quartiere asiatico del Queens, cucina cinese autentica' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7033, lon: -73.9894, district: 'DUMBO', note: 'vista sul ponte di Brooklyn, gallerie, ex magazzini' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7075, lon: -74.0113, district: 'Financial District', note: 'Wall Street, il traghetto per la Statua della Libertà' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.7265, lon: -73.9815, district: 'East Village', note: 'musica indipendente, locali storici, vita notturna' },

  // ── ISTANBUL, Turchia ────────────────────────────────────────────────
  { city: 'Istanbul', country: 'Turchia', lat: 41.0054, lon: 28.9768, district: 'Sultanahmet', note: 'Santa Sofia, la Moschea Blu, l\'antico Ippodromo' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0370, lon: 28.9770, district: 'Beyoğlu-İstiklal', note: 'la via pedonale principale, il tram storico rosso' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0256, lon: 28.9755, district: 'Karaköy', note: 'gallerie, caffè, la torre di Galata' },
  { city: 'Istanbul', country: 'Turchia', lat: 40.9908, lon: 29.0290, district: 'Kadıköy', note: 'il lato asiatico, mercato, vita notturna alternativa' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0290, lon: 28.9490, district: 'Balat', note: 'case colorate sulla collina, l\'antico quartiere ebraico' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0230, lon: 29.0150, district: 'Üsküdar', note: 'moschee affacciate sul Bosforo, lato asiatico' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0470, lon: 29.0270, district: 'Ortaköy', note: 'la moschea sul mare, il mercatino artigianale del weekend' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0298, lon: 28.9490, district: 'Fener', note: 'il patriarcato greco-ortodosso, case in stile liberty' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0106, lon: 28.9681, district: 'Grand Bazaar-Beyazıt', note: 'il bazar coperto più antico, migliaia di botteghe' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0170, lon: 28.9700, district: 'Eminönü', note: 'il molo dei traghetti, il Bazar Egizio delle spezie' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.0480, lon: 28.9940, district: 'Nişantaşı', note: 'shopping di lusso, vita mondana, caffè eleganti' },

  // ── TOKYO, Giappone ──────────────────────────────────────────────────
  { city: 'Tokyo', country: 'Giappone', lat: 35.6595, lon: 139.7005, district: 'Shibuya', note: 'l\'incrocio pedonale più famoso al mondo, moda giovanile' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.6938, lon: 139.7036, district: 'Shinjuku', note: 'grattacieli, vita notturna, i vicoli di Kabukichō' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.7148, lon: 139.7967, district: 'Asakusa', note: 'il tempio Sensō-ji, atmosfera del vecchio Tokyo' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.7022, lon: 139.7742, district: 'Akihabara', note: 'elettronica, manga, cultura otaku' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.6717, lon: 139.7650, district: 'Ginza', note: 'shopping di lusso, gallerie d\'arte, boutique storiche' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.6702, lon: 139.7027, district: 'Harajuku', note: 'moda alternativa, Takeshita Street, vicoli di design' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.7141, lon: 139.7744, district: 'Ueno', note: 'il grande parco, i musei, il mercato di Ameyoko' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.6627, lon: 139.7314, district: 'Roppongi', note: 'arte contemporanea, torri panoramiche, vita notturna' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.7280, lon: 139.7670, district: 'Yanaka', note: 'quartiere antico scampato ai bombardamenti, gattare vicoli' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.6270, lon: 139.7770, district: 'Odaiba', note: 'isola artificiale nella baia, musei tecnologici' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.7030, lon: 139.5800, district: 'Kichijōji', note: 'il parco Inokashira, atmosfera locale lontana dal centro' },

  // ── ANTALYA, Turchia ─────────────────────────────────────────────────
  { city: 'Antalya', country: 'Turchia', lat: 36.8850, lon: 30.7050, district: 'Kaleiçi', note: 'la città vecchia dentro le mura, il porticciolo storico' },
  { city: 'Antalya', country: 'Turchia', lat: 36.8600, lon: 30.6300, district: 'Konyaaltı', note: 'spiaggia di ciottoli, lungomare, montagne sullo sfondo' },
  { city: 'Antalya', country: 'Turchia', lat: 36.8380, lon: 30.7970, district: 'Lara', note: 'spiagge sabbiose, la cascata che cade nel mare, resort' },
  { city: 'Antalya', country: 'Turchia', lat: 36.9160, lon: 30.7550, district: 'Düden Şelalesi', note: 'le cascate superiori, il parco naturale attorno' },
  { city: 'Antalya', country: 'Turchia', lat: 36.8840, lon: 30.7010, district: 'Yat Limanı', note: 'la marina turistica sotto le mura della città vecchia' },
  { city: 'Antalya', country: 'Turchia', lat: 36.8870, lon: 30.7030, district: 'Bazar di Kaleüstü', note: 'i vicoli del mercato nel cuore della città vecchia' },
  { city: 'Antalya', country: 'Turchia', lat: 36.8830, lon: 30.7080, district: 'Karaalioğlu Parkı', note: 'parco panoramico affacciato sul mare' },
  { city: 'Antalya', country: 'Turchia', lat: 36.8860, lon: 30.7060, district: 'Porta di Adriano', note: 'la porta trionfale romana e la piazza attorno' },
  { city: 'Antalya', country: 'Turchia', lat: 36.9630, lon: 30.8500, district: 'Perge', note: 'la città romana in rovina poco fuori Antalya' },
  { city: 'Antalya', country: 'Turchia', lat: 36.9370, lon: 31.1720, district: 'Aspendos', note: 'il teatro romano meglio conservato del Mediterraneo' },
  { city: 'Antalya', country: 'Turchia', lat: 36.9700, lon: 30.4700, district: 'Termessos', note: 'città antica arroccata in montagna, mai conquistata da Alessandro' },

  // ── SEUL, Corea del Sud ──────────────────────────────────────────────
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5636, lon: 126.9850, district: 'Myeongdong', note: 'shopping, cosmetica coreana, street food' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5826, lon: 126.9830, district: 'Bukchon Hanok Village', note: 'case tradizionali hanok fra i palazzi Joseon' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.4979, lon: 127.0276, district: 'Gangnam', note: 'moda, K-pop, vita notturna elegante' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5563, lon: 126.9220, district: 'Hongdae', note: 'musica dal vivo, street art, vita universitaria' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5740, lon: 126.9850, district: 'Insadong', note: 'antiquariato, case da tè tradizionali, artigianato' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5347, lon: 126.9947, district: 'Itaewon', note: 'quartiere internazionale, vita notturna' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5663, lon: 127.0092, district: 'Dongdaemun', note: 'mercati tessili aperti 24 ore, design plaza futurista' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5590, lon: 126.9770, district: 'Namdaemun', note: 'il mercato più antico della città' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5730, lon: 126.9910, district: 'Ikseon-dong', note: 'case hanok riconvertite in caffè e boutique' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5219, lon: 126.9245, district: 'Yeouido', note: 'isola sul fiume Han, grattacieli, il parlamento' },
  { city: 'Seul', country: 'Corea del Sud', lat: 37.5446, lon: 127.0559, district: 'Seongsu-dong', note: 'ex distretto industriale, design e caffè indipendenti' },

  // ── HONG KONG, Cina ──────────────────────────────────────────────────
  { city: 'Hong Kong', country: 'Cina', lat: 22.2793, lon: 114.1628, district: 'Central', note: 'grattacieli, la funicolare per Victoria Peak, mercati serali' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.2976, lon: 114.1722, district: 'Tsim Sha Tsui', note: 'lungomare, museo, vista sullo skyline della baia' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.3193, lon: 114.1694, district: 'Mong Kok', note: 'mercati di fiori, uccelli e giocattoli, densità estrema' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.2870, lon: 114.1500, district: 'Sheung Wan', note: 'erboristerie tradizionali, gallerie d\'arte' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.2789, lon: 114.1725, district: 'Wan Chai', note: 'vita notturna, mercati mattutini' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.2190, lon: 114.2110, district: 'Stanley', note: 'mercato, lungomare, atmosfera coloniale' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.2560, lon: 113.9460, district: 'Lantau Island', note: 'il grande Buddha, monastero, funivia panoramica' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.3290, lon: 114.1920, district: 'Kowloon City', note: 'quartiere multietnico, cucina thailandese' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.3810, lon: 114.2730, district: 'Sai Kung', note: 'villaggio di pescatori, isole nei dintorni' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.2470, lon: 114.1560, district: 'Aberdeen', note: 'il villaggio galleggiante, giri in sampan' },
  { city: 'Hong Kong', country: 'Cina', lat: 22.2360, lon: 114.1930, district: 'Repulse Bay', note: 'spiaggia elegante, templi affacciati sul mare' },

  // ── BARCELLONA, Spagna ───────────────────────────────────────────────
  { city: 'Barcellona', country: 'Spagna', lat: 41.3833, lon: 2.1770, district: 'Barri Gòtic', note: 'cattedrale, vicoli medievali, piazze nascoste' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.4036, lon: 2.1527, district: 'Gràcia', note: 'piazze di quartiere, vita locale, feste di strada' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.4036, lon: 2.1744, district: 'Eixample-Sagrada Família', note: 'la griglia modernista, l\'architettura di Gaudí' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.3850, lon: 2.1810, district: 'El Born', note: 'Santa Maria del Mar, boutique, storia medievale' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.3800, lon: 2.1890, district: 'Barceloneta', note: 'la spiaggia storica, ristoranti di pesce' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.3730, lon: 2.1630, district: 'Poble Sec', note: 'vita locale, Montjuïc alle spalle' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.3800, lon: 2.1680, district: 'El Raval', note: 'multiculturale, arte contemporanea (MACBA)' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.3760, lon: 2.1610, district: 'Sant Antoni', note: 'il mercato storico ristrutturato, vita locale' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.4145, lon: 2.1527, district: 'Park Güell', note: 'il parco panoramico di Gaudí sulla collina' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.3640, lon: 2.1670, district: 'Montjuïc', note: 'la collina con museo, giardini, castello, vista sul porto' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.4030, lon: 2.2040, district: 'Poblenou', note: 'ex distretto industriale, spiaggia, quartiere tech' },

  // ── PHUKET, Thailandia ───────────────────────────────────────────────
  { city: 'Phuket', country: 'Thailandia', lat: 7.8804, lon: 98.3923, district: 'Phuket Town', note: 'case sino-portoghesi, street art, mercati notturni' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.8965, lon: 98.2965, district: 'Patong', note: 'la spiaggia principale, vita notturna intensa' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.8200, lon: 98.2960, district: 'Kata-Karon', note: 'spiagge più tranquille, surf stagionale' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.7760, lon: 98.3220, district: 'Rawai', note: 'villaggio di pescatori, mercato del pesce' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.9530, lon: 98.2820, district: 'Kamala', note: 'spiaggia elegante, tramonti tranquilli' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.8280, lon: 98.3110, district: 'Big Buddha', note: 'la grande statua panoramica sulla collina' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.8420, lon: 98.3390, district: 'Chalong', note: 'tempio buddista, punto di partenza per le isole in barca' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.9930, lon: 98.2930, district: 'Bang Tao', note: 'resort di lusso, spiaggia lunga e ordinata' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.7690, lon: 98.3010, district: 'Nai Harn', note: 'spiaggia e laguna, tramonto fra i più fotografati dell\'isola' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.8850, lon: 98.3890, district: 'Old Town sino-portoghese', note: 'l\'architettura coloniale del centro storico' },
  { city: 'Phuket', country: 'Thailandia', lat: 7.7630, lon: 98.2960, district: 'Capo Promthep', note: 'il punto panoramico all\'estremità sud dell\'isola' },

  // ── ROMA, Italia ─────────────────────────────────────────────────────
  { city: 'Roma', country: 'Italia', lat: 41.8890, lon: 12.4700, district: 'Trastevere', note: 'vicoli, vita notturna, chiese medievali' },
  { city: 'Roma', country: 'Italia', lat: 41.8950, lon: 12.4880, district: 'Monti', note: 'il rione più antico, botteghe artigiane' },
  { city: 'Roma', country: 'Italia', lat: 41.8760, lon: 12.4750, district: 'Testaccio', note: 'mercato, l\'ex mattatoio, cucina romana verace' },
  { city: 'Roma', country: 'Italia', lat: 41.9080, lon: 12.4640, district: 'Prati', note: 'eleganza borghese, vicino al Vaticano' },
  { city: 'Roma', country: 'Italia', lat: 41.8880, lon: 12.5350, district: 'Pigneto', note: 'street art, locali alternativi, ex quartiere operaio' },
  { city: 'Roma', country: 'Italia', lat: 41.8850, lon: 12.4970, district: 'Celio-San Giovanni', note: 'basiliche, le Terme di Caracalla' },
  { city: 'Roma', country: 'Italia', lat: 41.8950, lon: 12.5020, district: 'Esquilino', note: 'multiculturale, Santa Maria Maggiore' },
  { city: 'Roma', country: 'Italia', lat: 41.8620, lon: 12.4880, district: 'Garbatella', note: 'quartiere giardino anni \'20, atmosfera di paese' },
  { city: 'Roma', country: 'Italia', lat: 41.8990, lon: 12.5180, district: 'San Lorenzo', note: 'vita universitaria, murales, locali serali' },
  { city: 'Roma', country: 'Italia', lat: 41.8720, lon: 12.4800, district: 'Ostiense', note: 'ex industriale, street art, la Piramide Cestia' },
  { city: 'Roma', country: 'Italia', lat: 41.8830, lon: 12.4800, district: 'Aventino', note: 'collina silenziosa, il buco della serratura, l\'aranceto' },

  // ── PATTAYA, Thailandia ──────────────────────────────────────────────
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9280, lon: 100.8770, district: 'Pattaya Beach', note: 'il lungomare principale della città' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.8930, lon: 100.8800, district: 'Jomtien', note: 'spiaggia più tranquilla, adatta alle famiglie' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9210, lon: 100.8730, district: 'Walking Street', note: 'vita notturna, locali, musica dal vivo' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9550, lon: 100.8850, district: 'Naklua', note: 'villaggio di pescatori, mercato del pesce' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9130, lon: 100.8760, district: 'Pratamnak Hill', note: 'collina fra Pattaya e Jomtien, spiagge appartate' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9660, lon: 100.8790, district: 'Sanctuary of Truth', note: 'il tempio interamente in legno intagliato' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9070, lon: 100.8890, district: 'Wat Phra Yai-Big Buddha Hill', note: 'punto panoramico con il grande Buddha' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9130, lon: 100.8630, district: 'Bali Hai Pier', note: 'l\'imbarco per le isole vicine, come Koh Larn' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9330, lon: 100.8830, district: 'Central Pattaya', note: 'shopping, centri commerciali, mercati' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.7660, lon: 100.9330, district: 'Nong Nooch', note: 'il giardino tropicale poco fuori città' },
  { city: 'Pattaya', country: 'Thailandia', lat: 12.9520, lon: 100.8820, district: 'North Pattaya', note: 'quartiere residenziale-turistico, ristorazione internazionale' },

  // ── TAIPEI, Taiwan ───────────────────────────────────────────────────
  { city: 'Taipei', country: 'Taiwan', lat: 25.0420, lon: 121.5070, district: 'Ximending', note: 'moda giovanile, vita notturna, murales' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.0330, lon: 121.5290, district: 'Da\'an-Yongkang Street', note: 'gastronomia, atmosfera locale' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.0570, lon: 121.5100, district: 'Dihua Street', note: 'l\'antico mercato delle spezie e delle erbe' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.0330, lon: 121.5650, district: 'Xinyi', note: 'la torre Taipei 101, grandi magazzini, vita notturna' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.0880, lon: 121.5240, district: 'Shilin', note: 'il mercato notturno più famoso della città' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.1370, lon: 121.5010, district: 'Beitou', note: 'sorgenti termali, atmosfera in stile giapponese' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.1090, lon: 121.8450, district: 'Jiufen', note: 'vicoli in collina, case da tè tradizionali, poco fuori città' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.0370, lon: 121.4990, district: 'Wanhua-Longshan Temple', note: 'il tempio più antico della città' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.0500, lon: 121.5770, district: 'Raohe Street Market', note: 'mercato notturno storico' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.1080, lon: 121.5330, district: 'Tianmu', note: 'quartiere residenziale con comunità internazionale, verde' },
  { city: 'Taipei', country: 'Taiwan', lat: 25.0440, lon: 121.5610, district: 'Songshan Cultural Park', note: 'archeologia industriale riconvertita in spazi culturali' },

  // ── MILANO, Italia ───────────────────────────────────────────────────
  { city: 'Milano', country: 'Italia', lat: 45.4510, lon: 9.1730, district: 'Navigli', note: 'canali, aperitivo, vita serale' },
  { city: 'Milano', country: 'Italia', lat: 45.4720, lon: 9.1880, district: 'Brera', note: 'la pinacoteca, vicoli boutique' },
  { city: 'Milano', country: 'Italia', lat: 45.4870, lon: 9.1900, district: 'Isola', note: 'grattacieli verdi, design contemporaneo' },
  { city: 'Milano', country: 'Italia', lat: 45.4530, lon: 9.1990, district: 'Porta Romana', note: 'ex industriale, fondazioni d\'arte' },
  { city: 'Milano', country: 'Italia', lat: 45.4780, lon: 9.2280, district: 'Città Studi', note: 'vita universitaria, quartiere residenziale' },
  { city: 'Milano', country: 'Italia', lat: 45.4690, lon: 9.1950, district: 'Quadrilatero della moda', note: 'le vie dello shopping di lusso' },
  { city: 'Milano', country: 'Italia', lat: 45.4740, lon: 9.1740, district: 'Sempione', note: 'il parco, l\'Arco della Pace, il Castello Sforzesco' },
  { city: 'Milano', country: 'Italia', lat: 45.4890, lon: 9.2110, district: 'NoLo', note: 'quartiere multiculturale in trasformazione' },
  { city: 'Milano', country: 'Italia', lat: 45.4770, lon: 9.2040, district: 'Porta Venezia', note: 'liberty, giardini pubblici, vita di quartiere' },
  { city: 'Milano', country: 'Italia', lat: 45.4530, lon: 9.1810, district: 'Ticinese', note: 'basiliche paleocristiane, vita serale' },
  { city: 'Milano', country: 'Italia', lat: 45.4780, lon: 9.1560, district: 'CityLife', note: 'grattacieli d\'autore, parco contemporaneo' },

  // ── PRAGA, Cechia ────────────────────────────────────────────────────
  { city: 'Praga', country: 'Cechia', lat: 50.0870, lon: 14.4050, district: 'Malá Strana', note: 'il quartiere sotto il castello, giardini barocchi' },
  { city: 'Praga', country: 'Cechia', lat: 50.0870, lon: 14.4210, district: 'Staré Město', note: 'la Città Vecchia, l\'orologio astronomico' },
  { city: 'Praga', country: 'Cechia', lat: 50.0910, lon: 14.4180, district: 'Josefov', note: 'l\'antico ghetto ebraico, sinagoghe storiche' },
  { city: 'Praga', country: 'Cechia', lat: 50.0750, lon: 14.4460, district: 'Vinohrady', note: 'eleganza liberty, vita locale' },
  { city: 'Praga', country: 'Cechia', lat: 50.0850, lon: 14.4520, district: 'Žižkov', note: 'la torre della televisione, vita alternativa' },
  { city: 'Praga', country: 'Cechia', lat: 50.0980, lon: 14.4130, district: 'Letná', note: 'parco panoramico, birrerie all\'aperto' },
  { city: 'Praga', country: 'Cechia', lat: 50.0910, lon: 14.4010, district: 'Hradčany', note: 'il castello, la cattedrale di San Vito' },
  { city: 'Praga', country: 'Cechia', lat: 50.0930, lon: 14.4460, district: 'Karlín', note: 'ex industriale, ristrutturato, gastronomia' },
  { city: 'Praga', country: 'Cechia', lat: 50.0710, lon: 14.4010, district: 'Smíchov', note: 'vita locale, birrifici storici' },
  { city: 'Praga', country: 'Cechia', lat: 50.0650, lon: 14.4180, district: 'Vyšehrad', note: 'fortezza sulla Moldava, il cimitero degli artisti' },
  { city: 'Praga', country: 'Cechia', lat: 50.0810, lon: 14.4280, district: 'Piazza Venceslao', note: 'il cuore commerciale moderno della città' },
];

/**
 * Pattaya è l'unica delle 20 città senza alcun itinerario di livello
 * città nel catalogo principale (le altre 19 sono già in ZONE_CITIES o
 * WORLD_ZONES). Stessa forma di ExtraZone (libraryDescriptorsExtra.ts):
 * si fonde in worldZoneDescriptors() insieme a EXTRA_WORLD_ZONES.
 */
export const MEGACITY_TOP_LEVEL_EXTRA: { c: string; k: string; lat: number; lon: number; t: 1 | 2 | 3; n: string }[] = [
  { c: 'Pattaya', k: 'Thailandia', lat: 12.9236, lon: 100.8825, t: 1, n: 'spiagge, vita notturna e gite in barca alle isole vicine; base comoda anche per un\'escursione a Bangkok' },
];
