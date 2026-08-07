const fs = require('fs');

let c = fs.readFileSync('server.ts', 'utf8');

const s1 = c.indexOf("const fallbackInterests = interests || [];");
const idxSpecialRequests = c.indexOf("if (specialRequests) {", s1);
const endIdx = c.indexOf("app.post(\"/api/groq/itinerary-stream\"", idxSpecialRequests);

if (s1 !== -1 && idxSpecialRequests !== -1 && endIdx !== -1) {
  const startChunk = c.substring(0, idxSpecialRequests);
  const endChunk = c.substring(endIdx);
  
  const missingBlock = `if (specialRequests) {
        prompt += \`\\nL'utente ha anche queste RICHIESTE PARTICOLARI a cui devi assolutamente attenerti: "\${specialRequests}". Modifica l'itinerario e i luoghi in base a queste richieste (es. ristoranti particolari, solo certe attrazioni, etc).\`;
      }

      if (includeEvents) {
        console.log(\`[PredictHQ] Fetching events for \${destination}...\`);
        const eventsContext = await fetchPredictHQEvents(destination, mese, radius);
        if (eventsContext) {
          prompt += eventsContext;
        }
      }

      if (includeTours) {
        console.log(\`[Viator] Fetching real tours for itinerary in \${destination}...\`);
        const toursRes = await agentTools.searchViatorExperiences(0, 0, radius, undefined, undefined, destination);
        try {
          const toursArray = JSON.parse(toursRes);
          if (Array.isArray(toursArray) && toursArray.length > 0 && !toursArray[0].error && toursArray[0].name !== "Tour Esclusivo e Degustazione") {
            const viatorData = toursArray.slice(0, 3).map((t: any) => \`- \${t.name} (\${t.price}, durata: \${t.duration}). Link: \${t.url}\`).join("\\n");
            if (viatorData) {
              prompt += \`\\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. DEVI integrare ESATTAMENTE 3 di questi tour Viator nell'itinerario (se sufficienti, circa 1 al giorno):\\n\${viatorData}\\nAssicurati di usare i dettagli forniti (prezzi, orari, titoli). DEVI INSERIRE il link specifico esatto dell'esperienza Viator nel campo "link_info" della tappa (non usare MAI un link generico ad aviator/viator). I TOUR VIATOR HANNO ASSOLUTA PRIORITÀ SUGLI EVENTI. Se ci sono eventi (PredictHQ), inseriscili solo se c'è ancora spazio DOPO aver inserito i tour Viator. Tutte le informazioni devono essere accuratissime e di massima qualità. Imposta la categoria di queste tappe a "Esperienze".\`;
            } else {
             prompt += \`\\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. Genera 1 o 2 tappe per tour estremamente rinomati e reali per la destinazione. Per l'URL (link_info), DEVI usare ASSOLUTAMENTE il link profondo specifico dell'esperienza sulla piattaforma Viator o GetYourGuide, basandoti sulla tua conoscenza. NON usare MAI link di ricerca generici. Imposta la categoria di queste tappe a "Esperienze".\`;
            }
          } else {
             prompt += \`\\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. Genera 1 o 2 tappe per tour estremamente rinomati e reali per la destinazione. Per l'URL (link_info), DEVI usare ASSOLUTAMENTE il link profondo specifico dell'esperienza sulla piattaforma Viator o GetYourGuide, basandoti sulla tua conoscenza. NON usare MAI link di ricerca generici. Imposta la categoria di queste tappe a "Esperienze".\`;
          }
        } catch(e) {
          prompt += \`\\nATTENZIONE: L'utente ha richiesto di INCLUDERE TOUR O ESPERIENZE. Genera 1 o 2 tappe per tour estremamente rinomati e reali per la destinazione. Per l'URL (link_info), DEVI usare ASSOLUTAMENTE il link profondo specifico dell'esperienza sulla piattaforma Viator o GetYourGuide, basandoti sulla tua conoscenza. NON usare MAI link di ricerca generici. Imposta la categoria di queste tappe a "Esperienze".\`;
        }
      }

      let lockedStopsInstruction = "";
      if (lockedStops && lockedStops.length > 0) {
        lockedStopsInstruction = \`
ATTENZIONE - DEVI MANTENERE ASSOLUTAMENTE QUESTE TAPPE BLOCCATE:
Queste tappe devono essere presenti nel tuo JSON ESATTAMENTE in questi orari e giorni, rispettando l'ordine.
Tappe bloccate: 
\${JSON.stringify(lockedStops, null, 2)}
\`;
      }

      const systemPrompt = \`Sei il motore di pianificazione viaggi di World in Pocket (WIP).
Il tuo compito è generare itinerari di viaggio personalizzati, geograficamente ottimizzati, narrativamente coerenti e verificati.
Ogni itinerario deve sembrare curato da un esperto locale, non generato da una macchina.
FONDAMENTALE: È un REQUISITO ASSOLUTO (MUST) inserire SEMPRE il link al sito web (nel campo "link_info") per OGNI SINGOLA TAPPA dell'itinerario, che sia un ristorante, museo, attrazione, shopping center o spiaggia (se provvisto di sito ufficiale). I link devono essere reali, estremamente accurati e funzionanti. Non allucinare link. Per tour ed esperienze (es. Viator/GetYourGuide), DEVI usare il link profondo specifico dell'esperienza, mai la homepage generica.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PARAMETRI DI INPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESTINAZIONE          : \${destination}
DURATA                : \${days} giorni
MESE/PERIODO          : \${mese || 'Generico'}
INIZIO GIORNATA       : \${tInizio}
FINE GIORNATA         : \${tFine}
INTERESSI             : \${(interests || []).join(", ")}
BUDGET                : \${budget}
VIAGGIATORI           : \${viaggiatori}
RITMO                 : \${ritmo}
RICHIESTE PARTICOLARI : \${specialRequests || "Nessuna"}
GUIDA                 : \${guida}
\${lockedStopsInstruction}
\${ragInstruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. IDENTITÀ DELLE GUIDE E CONSIGLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ NICKY: Informale, entusiasta, focalizzata su atmosfera, selfie, caffè nascosti e dettagli visivi. (Es. "Non perdete la maestosa Aula... Catturate l'eleganza per un selfie storico!")
📜 DANTE: Autorevole, preciso, focalizzato su storia, architettura e curiosità culturali. (Es. "Approfondite la sezione dedicata alla dinastia Savoia... un'esperienza ineguagliabile.")

REGOLE PER I CONSIGLI:
✓ Se l'utente non specifica, fornisci ENTRAMBI i consigli (Nicky e Dante) uniti nella stessa stringa, preceduti dalle rispettive emoji.
✓ LUNGHEZZA: Ogni consiglio (sia Nicky che Dante) deve essere un paragrafo di ALMENO 4 o 5 RIGHE CORPOSE (circa 60-80 parole), ricchissimo di dettagli specifici della tappa.
✓ MAI generico. Nessun "Godetevi il panorama". Spiega esattamente COSA guardare, storia profonda, e dove posizionarsi per la foto perfetta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. ADATTAMENTO E VERIFICA DATI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Le richieste particolari hanno priorità assoluta su tutto.
Verifica che ogni attrazione sia aperta nel giorno previsto.
RISTORANTI: Usa i dati di contesto (price_level e status) se disponibili, e assegna un badge di confidenza. Mai coordinate crude nel testo.
LOGICA GEOGRAFICA: Raggruppa le tappe per quartiere. Spostamento >20min a piedi -> suggerisci mezzo pubblico.
PAUSE: Almeno 1 pausa ogni 3 tappe culturali.
COORDINATE GPS: Il campo "coordinate" (lat e lng) DEVE contenere le ESATTE coordinate geografiche reali del luogo. Cerca di inserire i valori reali con massima precisione (es. Colosseo: 41.8902, 12.4922). DIVIETO ASSOLUTO di inserire coordinate inventate, casuali, arrotondate (es. 45.0, 7.0) o fittizie. Usa i dati di contesto se presenti. Se non le sai con precisione, indaga nei tuoi dati di training per trovare il punto esatto sulla mappa. Questo è VITALE per il rendering della mappa dell'utente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. RITMO E TIMING (REGOLE TASSATIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\${ritmoTimingRule}
- COERENZA ORARI: Verifica matematicamente i tempi di visita e di percorrenza. L'orario deve essere logico in base alla tappa precedente + "tempo_necessario" + "spostamento_precedente".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4.1 COERENZA FILTRI E INTERESSI (PRIORITÀ ALTA)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
L'itinerario deve riflettere rigorosamente i filtri selezionati dall'utente:
- Se negli Interessi o Richieste è presente "Shopping": includi ALMENO UNA tappa in un distretto commerciale, boutique o centro commerciale.
- Se negli Interessi o Richieste è presente "Fotografia": includi ALMENO 2-3 tappe in punti panoramici (viewpoints), monumenti iconici o location con alta valenza estetica.
- Qualsiasi altro interesse/richiesta (es. arte, avventura, enogastronomia) DEVE pesare profondamente sulla scelta delle tappe, modificando il 60-70% dell'itinerario per assecondare il tema.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. STRUTTURA BUDGET — TABELLA COSTI (MASSIMO REALISMO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Per ogni giorno genera questa tabella in fondo alla giornata. 
È TASSATIVO che i prezzi siano REALI e AGGIORNATI. Ricerca nella tua memoria il VERO costo del biglietto del museo/attrazione. Ricerca il VERO costo medio del ristorante che hai scelto. Non inventare cifre tonde casuali. Se un museo costa € 18, scrivi € 18, non € 10.
In fondo all'itinerario completo:
TOTALE STIMATO VIAGGIO: € XX - € XX p.p. (range min-max per variazioni reali calcolato matematicamente sui costi inseriti).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. FORMATO JSON E REGOLE DI OUTPUT (IGNORARE QUESTA STRUTTURA È UN ERRORE FATALE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE PER INFO VIAGGIO (TASSATIVE E CRITICHE):
1. DIVIETO ASSOLUTO DI FRASI FATTE E GENERICHE: È severamente VIETATO scrivere ovvietà come "Godersi un caffè in un bar storico", "Acquistare specialità locali", "Visita al Mercato Centrale", "Attenzione ai borseggiatori", "Rispettare le regole dei monumenti", "Passeggiata sulle mura". Se usi una di queste frasi, l'itinerario è considerato un fallimento totale!
2. IPER-SPECIFICITÀ LOCALE E REALE: Forzare l'uso esclusivo di nomi propri, strade reali, locali veri e orari specifici.
3. LUNGHEZZA E DETTAGLIO: Sii conciso ma iper-dettagliato. Le descrizioni e i consigli devono essere di 20-30 parole massimo, senza frasi di riempimento. VAI DRITTO AL PUNTO.
4. LE 4 SEZIONI OBBLIGATORIE (Fornire ALMENO 3 voci per ognuna, strutturate esattamente così):
   - "precauzioni": Regole ferree e mirate (es. ZTL, biglietti dei mezzi specifici della città).
   - "suggerimenti": 'Life-hack' locali veri (es. acquisto di tessere turistiche particolari o biglietti salta-fila nominati).
   - "raccomandazioni": Cibi tipici con il NOME della via o del chiosco (niente "gelato artigianale" generico).
   - "zone_da_evitare": Nomi esatti di piazze, stazioni o quartieri da evitare, specificando la fascia oraria (es. la zona intorno alla stazione di notte).

Struttura JSON ESATTA DA REPLICARE COME FORMATO E LUNGHEZZA (DEVI SOSTITUIRE I DATI CON QUELLI DELLA CITTÀ E DEI POI REALI RICHIESTI DALL'UTENTE):
{
  "titolo": "Titolo evocativo e specifico (non generico)",
  "info_viaggio": {
    "precauzioni": ["Occhio ai borseggiatori sulla linea 64 verso Termini.", "Divieto di bivacco sui gradini di Trinità dei Monti in Piazza di Spagna.", "Sampietrini scivolosi a Trastevere durante le piogge autunnali."],
    "suggerimenti": ["Roma Pass 48h per saltare le code al Colosseo.", "Visita la Fontana di Trevi alle 6:30 del mattino per evitare la folla.", "Colazione con Maritozzo da Regoli vicino Piazza Vittorio."],
    "raccomandazioni": ["Carciofo alla Giudia da 'Nonna Betta' nel Ghetto Ebraico.", "Vista a 360 gradi dalla Terrazza delle Quadrighe al Vittoriano.", "Panino con la trippa al mercato rionale di Testaccio da Mordi e Vai."],
    "zone_da_evitare": ["Evitare Piazza Vittorio Emanuele e i portici di Termini da soli dopo le 23:00."]
  },
  "giorni": [
    {
      "giorno": 1,
      "tappe": [
        {
          "id_tappa": "string",
          "ora": "09:30",
          "titolo_tappa": "Museo Nazionale del Risorgimento",
          "attivita": "Inizia la giornata immergendoti nella magnificenza di Palazzo Carignano, capolavoro del barocco e prima sede del parlamento italiano. Passeggia nelle maestose sale storiche ammirando documenti originali, armi e cimeli dell'Unità d'Italia. All'interno, ammira gli arredi originali e l'imponente Aula della Camera Subalpina intatta dal 1848. Perfetto per gli amanti della storia e della fotografia: ogni sala è un tuffo emozionante nel passato della nazione!",
          "consiglio_guida": "✨ Nicky: Porta la tua macchina fotografica! Il punto migliore per uno scatto è lo scalone monumentale all'ingresso con la luce naturale del mattino. Non perderti i velluti rossi dell'Aula: sono super scenografici! 📜 Dante: Il palazzo fu completato nel 1684 da Guarino Guarini per i Savoia-Carignano. Ogni dettaglio architettonico riflette il genio barocco. Le teche ospitano lettere originali di Cavour e Garibaldi. Prenditi 15 minuti per leggere attentamente i dispacci segreti esposti nella sala finale.",
          "tempo_necessario": "2 ore",
          "spostamento_precedente": "15 min a piedi",
          "tipo": "museo",
          "coordinate": { "lat": 45.068, "lng": 7.686 },
          "link_info": "URL UFFICIALE REALE (MUST: Inserisci SEMPRE il sito ufficiale per ristoranti, musei, shopping, spiagge, tour. Se tour Viator, metti il link specifico)"
        },
        {
          "id_tappa": "string",
          "ora": "13:00",
          "titolo_tappa": "Ristorante Del Cambio",
          "attivita": "Pausa pranzo in uno dei locali più rinomati del centro cittadino. Assapora le specialità locali preparate al momento in un ambiente storico. L'atmosfera è elegante ma informale, con affreschi originali ovunque. Perfetto per ricaricare le energie prima del pomeriggio di esplorazione culinaria e culturale.",
          "consiglio_guida": "✨ Nicky: Ordina il classico 'Vitello Tonnato' rivisitato e un calice di vino locale. Il locale è super instagrammabile: fate una foto con il grande specchio all'ingresso! 📜 Dante: Il ristorante utilizza ricette tradizionali piemontesi tramandate dal 1700. Cavour sedeva sempre al tavolo d'angolo vicino alla finestra. Un assaggio di pura autenticità nel cuore di Torino.",
          "tempo_necessario": "1.5 ore",
          "spostamento_precedente": "10 min a piedi",
          "tipo": "pranzo",
          "coordinate": { "lat": 45.068, "lng": 7.686 }
        },
        {
          "id_tappa": "string",
          "ora": "15:00",
          "titolo_tappa": "Museo Egizio",
          "attivita": "Pomeriggio dedicato all'esplorazione dell'antico Egitto in questo museo di fama mondiale. Ammira la sua impressionante architettura e una selezione di reperti faraonici unica al di fuori del Cairo. Goditi le imponenti statue e i papiri millenari perfettamente conservati.",
          "consiglio_guida": "✨ Nicky: Concentrati sulle gallerie principali al secondo piano e non perdere le installazioni luminose nella Galleria dei Re. 📜 Dante: Progettato e curato con standard museali d'eccellenza, il Museo Egizio è un punto di riferimento inaugurato nel 1824, noto per l'immensa collezione voluta dai Savoia.",
          "tempo_necessario": "2 ore",
          "spostamento_precedente": "5 min a piedi",
          "tipo": "museo",
          "coordinate": { "lat": 45.068, "lng": 7.686 }
        }
      ],
      "tabella_budget": {
        "attrazioni": { "dettaglio": "Museo Risorgimento: €10. Museo Egizio: €15.", "stima_pp": "€ 25" },
        "trasporti": { "dettaglio": "Spostamenti a piedi nel centro, zero mezzi pubblici.", "stima_pp": "€ 0" },
        "colazione": { "dettaglio": "Bicerin tradizionale e brioche in caffetteria storica.", "stima_pp": "€ 5" },
        "pranzo": { "dettaglio": "Ristorante Del Cambio: 'Vitello Tonnato' storico.", "stima_pp": "€ 70" },
        "cena": { "dettaglio": "Agnolotti del Plin in osteria tipica.", "stima_pp": "€ 40" },
        "totale_giorno": "€ 140"
      }
    }
  ],
  "totale_viaggio": "€ 220 - € 250 p.p. (stima per 2 giorni, escluse cene libere e acquisti extra. Il range tiene conto di scelte personali di menu e bevande)."
}

Non aggiungere testo prima o dopo il JSON.\`;

      let result;
      let usedEngine = "none";
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          console.log(\`[DeepSeek Itinerary] Using DeepSeek for itinerary generation... (Attempt \${attempt + 1})\`);
          const response = await callUniversalAi(
            "deepseek",
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt || "" }
            ],
            {
              response_format: { type: "json_object" },
              temperature: 0.7
            },
            "generazione_itinerari",
            supabaseUrl,
            supabaseServiceKey,
            groq
          );
          const parsed = parseSafeJSON(response.data || "{}");
          
          if (parsed && parsed.giorni && Array.isArray(parsed.giorni) && parsed.giorni.length > 0) {
            result = parsed;
            usedEngine = "deepseek";
            console.log("[DeepSeek Itinerary] Generation successful.");
            break; // Success! Break out of retry loop
          } else {
            console.warn(\`[DeepSeek Itinerary] Attempt \${attempt + 1} generated incomplete JSON. Retrying...\`);
            result = null;
          }
        } catch (err: any) {
          console.warn(\`[DeepSeek Itinerary] Attempt \${attempt + 1} failed:\`, err.message);
        }
      }

      if (!result) {
         return res.status(500).json({ error: "I motori AI hanno restituito dati troncati o JSON invalido dopo multipli tentativi. Riprova con meno giorni o riducendo i dettagli." });
      }

      await saveToCache(cacheKey, 'itinerary', result);

      if (usedEngine === "gemini" && quota.userId) {
        await incrementQuotaCount(quota.userId, 'itinerari').catch(e => console.error(e));
      }

      if (usedEngine === "groq" && quota.userId) {
        await incrementQuotaCount(quota.userId, 'itinerari').catch(e => console.error(e));
        // Telemetry is now handled centrally by callGroqWithFallback
      }

      if (result) {
        if (!result.info_viaggio) result.info_viaggio = {};
        result.info_viaggio.includeTours = !!includeTours;
        result.info_viaggio.includeEvents = !!includeEvents;
      }

      res.json(result);
    } catch (e: any) {
      console.error("Groq Itinerary Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  `;

  fs.writeFileSync('server.ts', startChunk + missingBlock + endChunk);
  console.log("SUCCESS!");
} else {
  console.log("Indices not found", s1, idxSpecialRequests, endIdx);
}
