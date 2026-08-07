const fs = require('fs');

let c = fs.readFileSync('server.ts', 'utf8');

const startIdx = c.indexOf("      if (specialRequests) {\\n        prompt += `\\nL'utente ha anche queste RICHIESTE");
const endIdx = c.indexOf("      const systemPrompt = `Sei il motore di pianificazione viaggi");

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `      if (specialRequests) {
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

`;
  
  c = c.substring(0, startIdx) + replacement + c.substring(endIdx);
  fs.writeFileSync('server.ts', c);
  console.log("Success");
} else {
  console.log("Indices not found", startIdx, endIdx);
}
