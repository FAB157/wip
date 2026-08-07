import sys

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\r\n', '\n')

bad_snippet = '''      console.log("[Premium Guide] Enrichment done. Calling Groq AI...");

      // ── FASE 3: GENERAZIONE AI ULTRA-DETTAGLIATA ──────────────────────────
2. "curiosita": Array OBBLIGATORIO di 4-5 curiosità sorprendenti e verificate. Inizia ogni voce con "Sapevi che..." oppure "Un fatto poco noto:". Fatti storici, record, misteri, aneddoti reali.
3. "dettaglio_storico_tecnico": MINIMO 180 parole. Analisi approfondita: date esatte, architetti, materiali, stile architettonico, eventi storici chiave, restauri importanti.
4. "consiglio_insider": MINIMO 120 parole. Consiglio ULTRA-SPECIFICO noto solo ai residenti. Include: orario esatto, percorso alternativo, nome della persona o del locale, dettaglio che fa la differenza.
5. "migliori_piatti": Per ristoranti/bar, array di 3 piatti/drink con nome, descrizione e prezzo indicativo.
      try {
        console.log("[Premium Guide] Starting parallel chunked generation...");'''

good_snippet = '''      console.log("[Premium Guide] Enrichment done. Calling Groq AI...");

      // ── FASE 3: GENERAZIONE AI PARALLELIZZATA (CHUNKED) ──────────────────────
      const PERSONA: Record<string, string> = {
        art:      "Sei un rinomato critico d'arte e storico dell'architettura. La tua prosa è colta, elegante e ricca di riferimenti a movimenti artistici, tecniche costruttive e protagonisti della storia dell'arte.",
        family:   "Sei un genitore esperto di viaggi family. Bilanci dettagli pratici, attività adatte ai bambini di varie età, orari ottimali e consigli salvavita per le famiglie.",
        shopping: "Sei un trendsetter e esperto di design, moda e artigianato locale. Conosci ogni bottega artigianale, ogni mercato autentico, ogni indirizzo esclusivo.",
        food:     "Sei un buongustaio e critico gastronomico di fama nazionale. Conosci ogni ricetta storica, ogni trattoria nascosta, ogni prodotto tipico con le sue origini e varianti regionali.",
        essential:"Sei un logista esperto che ottimizza itinerari. Preciso, pragmatico, forni tutti i dati pratici con accuratezza assoluta."
      };

      const baseSystemPrompt = `Sei l'autore principale della prestigiosa collana "WIP Premium Smart Guide" di World in Pocket. ${PERSONA[style] || PERSONA.essential}

Devi creare una GUIDA TURISTICA PROFESSIONALE di altissima qualità sulla destinazione "${destination}", identica nelle caratteristiche editoriali alle migliori guide cartacee (Lonely Planet, National Geographic Traveler).

REGOLE ASSOLUTE – VIOLAZIONE = FALLIMENTO TOTALE:
1. "descrizione_lunga": MINIMO 5 paragrafi corposi (450-600 parole totali). Usa narrazione immersiva, cinematografica, sensoriale. Includi storia del luogo, architettura, contesto culturale, atmosfera, aneddoti verificati.
2. "curiosita": Array OBBLIGATORIO di 4-5 curiosità sorprendenti e verificate. Inizia ogni voce con "Sapevi che..." oppure "Un fatto poco noto:". Fatti storici, record, misteri, aneddoti reali.
3. "dettaglio_storico_tecnico": MINIMO 180 parole. Analisi approfondita: date esatte, architetti, materiali, stile architettonico, eventi storici chiave, restauri importanti.
4. "consiglio_insider": MINIMO 120 parole. Consiglio ULTRA-SPECIFICO noto solo ai residenti. Include: orario esatto, percorso alternativo, nome della persona o del locale, dettaglio che fa la differenza.
5. "migliori_piatti": Per ristoranti/bar, array di 3 piatti/drink con nome, descrizione e prezzo indicativo.
6. "tema_giorno": Frase poetica che sintetizza il filo narrativo della giornata.
7. DIVIETO ASSOLUTO: "goditi il panorama", "immergiti nell'atmosfera", "non dimenticare di", "ti consigliamo", frasi generiche.
8. Tutti i dati (indirizzi, orari, prezzi) devono essere REALI e SPECIFICI per "${destination}".
9. Usa il contesto Wikipedia/Wikivoyage/Foursquare/TripAdvisor fornito per dati fattuali verificati.

Restituisci SOLO JSON valido, senza markdown, senza testo esterno.`;

      let generatedContent: any = {
         guida_titolo: `${destination} - La Guida Definitiva`,
         sottotitolo: `Un viaggio straordinario a ${destination}`,
         introduzione: "",
         citta_intro: {},
         stile: style,
         giorni: []
      };

      try {
        console.log("[Premium Guide] Starting parallel chunked generation...");'''

# Convert weird dash character
content = content.replace("── FASE 3: GENERAZIONE AI ULTRA-DETTAGLIATA ──────────────────────────", "── FASE 3: GENERAZIONE AI ULTRA-DETTAGLIATA ──")
bad_snippet = bad_snippet.replace("── FASE 3: GENERAZIONE AI ULTRA-DETTAGLIATA ──────────────────────────", "── FASE 3: GENERAZIONE AI ULTRA-DETTAGLIATA ──")

# Be flexible with bad_snippet matching by searching via regex
import re
pattern = r'console\.log\("\[Premium Guide\] Enrichment done\. Calling Groq AI\.\.\."\);.*?try \{\s*console\.log\("\[Premium Guide\] Starting parallel chunked generation\.\.\."\);'
content = re.sub(pattern, good_snippet, content, flags=re.DOTALL)

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed PERSONA')
