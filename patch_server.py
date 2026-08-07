with open('c:\\progetti\\itainta\\server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

stream_func = """
// stream helper
async function streamUniversalAi(
  primaryEngine: "deepseek" | "groq" | "together",
  messages: any[],
  options: any = {},
  res: any,
  groqInstance: any = null
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    if ((primaryEngine === "groq" || primaryEngine === "deepseek") && groqInstance) {
      const finalModel = primaryEngine === "deepseek" ? "llama-3.3-70b-versatile" : (options.model || "llama-3.3-70b-versatile");
      const stream = await groqInstance.chat.completions.create({
        messages,
        model: finalModel,
        stream: true,
        ...options
      });
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\\n\\n`);
        }
      }
    } else {
       res.write(`data: ${JSON.stringify({ error: "Streaming engine not supported" })}\\n\\n`);
    }
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\\n\\n`);
  }
  res.write(`data: [DONE]\\n\\n`);
  res.end();
}
"""

content = content.replace('// --- CENTRAL AI HELPER WITH FALLBACK & TOKEN TRACKING ---', stream_func + '\n// --- CENTRAL AI HELPER WITH FALLBACK & TOKEN TRACKING ---')

endpoint = """
  app.post("/api/poi/enrich_stream", rateLimiter, async (req, res) => {
    try {
      const { name, lat, lon, category, lang = "it" } = req.body;
      const targetLat = parseFloat(lat);
      const targetLon = parseFloat(lon);

      let roleInstruction = "";
      if (['locali', 'utilita', 'famiglie'].includes(category)) {
          roleInstruction = `Sei un assistente informativo locale preciso e affidabile. Ricevi Nome, Categoria ("${category}") e le Coordinate (Lat: ${targetLat}, Lon: ${targetLon}).
Regola fondamentale: basa la tua descrizione SOLO sulle informazioni fornite o su fatti assolutamente reali e accertati per ESATTAMENTE quel punto geografico. NON INVENTARE storie o descrizioni fittizie. Sii fattuale.
La lingua deve essere: ${lang}.
Rispondi producendo ESCLUSIVAMENTE la descrizione lunga testuale (minimo 1500 caratteri) con dettagli approfonditi. NON usare markdown, NON generare JSON, scrivi solo il testo narrativo in modo che sia perfetto per la lettura immediata.`;
      } else {
          roleInstruction = `Sei un curatore turistico e storico d'eccellenza. Ricevi Nome, Categoria ("${category}") e Coordinate (Lat: ${targetLat}, Lon: ${targetLon}).
Regola fondamentale: basa la tua descrizione SOLO su fatti storici assolutamente reali e accertati del monumento a QUELLE coordinate. NON INVENTARE.
La lingua deve essere: ${lang}.
Rispondi producendo ESCLUSIVAMENTE la descrizione lunga testuale, accademica, immersiva e STORICAMENTE SUPER DETTAGLIATA (minimo 1500 caratteri). DEVE contenere anno di fondazione/costruzione, architetto/creatore, stile architettonico, aneddoti storici e motivo d'importanza. NON usare markdown, NON generare JSON, scrivi solo il testo narrativo in modo che sia perfetto per la lettura immediata.`;
      }

      const curatorPrompt = `${roleInstruction}
INFORMAZIONI SUL LUOGO DA CURARE:
Nome: "${name}"
Coordinate: Latitudine ${targetLat}, Longitudine ${targetLon}

ISTRUZIONE CRITICA: Restituisci SOLO il testo della descrizione, nessuna introduzione, nessun JSON.`;

      const messages = [
          { role: "user", content: curatorPrompt }
      ];

      await streamUniversalAi("groq", messages, {}, res, groq);

    } catch (e: any) {
      console.error("[/api/poi/enrich_stream] Error:", e.message);
      if (!res.headersSent) {
         res.write(`data: ${JSON.stringify({ error: e.message })}\\n\\n`);
         res.end();
      }
    }
  });
"""

content = content.replace('// --- ADMIN QUALITY REVIEW QUEUE ---', endpoint + '\n  // --- ADMIN QUALITY REVIEW QUEUE ---')

with open('c:\\progetti\\itainta\\server.ts', 'w', encoding='utf-8') as f:
    f.write(content)
