const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.ts');
let content = fs.readFileSync(serverFile, 'utf8');

const regex = /app\.post\("\/api\/generate-daily-podcast", async \(req, res\) => \{[\s\S]*?\/\/ --- PODCAST GIORNALIERO ITINERARI ---/g;
// Actually I inserted it before another app.post so the end boundary is another `app.post` or EOF.
// Let's replace the whole endpoint by searching its anchor.
const startAnchor = '// --- PODCAST GIORNALIERO ITINERARI ---';
const startIndex = content.indexOf(startAnchor);

if (startIndex !== -1) {
    const nextPost = content.indexOf('app.post', startIndex + 50);
    const endIndex = nextPost !== -1 ? nextPost : content.length;
    
    const newEndpoint = `// --- PODCAST GIORNALIERO ITINERARI ---
app.post("/api/generate-daily-podcast", async (req, res) => {
  try {
    const { destination, dayNum, tappe, language } = req.body;
    if (!destination || !dayNum || !tappe) {
      return res.status(400).json({ error: "Dati mancanti" });
    }

    const langStr = language === 'en' ? 'English' : 'Italian';
    const sysPrompt = \`Sei un presentatore radiofonico e podcaster di viaggi neutrale e professionale. Il tuo nome d'arte è "WIP". Devi generare l'anteprima audio dell'itinerario in lingua \${langStr}.\`;
    
    let userPrompt = \`Crea un podcast di circa 1-2 minuti per il Giorno \${dayNum} a \${destination}.\`;
    if (dayNum === 1) {
      userPrompt += \`\\nInizia il podcast con una prefazione generale e affascinante sulla città di \${destination}.\`;
    }
    userPrompt += \`\\nEcco le tappe previste:\\n\${tappe.map(t => "- " + t.name + (t.description ? ": " + t.description : "")).join("\\n")}\`;
    userPrompt += \`\\nDescrivi l'itinerario prima di eseguirlo, dando consigli molto utili prendendo spunto dalle descrizioni e dalle informazioni dell'itinerario stesso.
    Regole fondamentali:
    - Scrivi SOLO il testo da leggere ad alta voce nella lingua: \${langStr}. 
    - Inizia salutando e presentandoti come "WIP".
    - Nessuna formattazione markdown (niente ** o #), niente emoji, niente note di regia.
    - Il testo deve scorrere in modo perfetto e naturale per la sintesi vocale.\`;

    // Usa DeepSeek, Groq o Together
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.GROQ_API_KEY || process.env.TOGETHER_API_KEY;
    if (!apiKey) {
       return res.status(500).json({ error: "Nessuna chiave API configurata." });
    }

    let podcastText = "";
    try {
      const axios = require('axios');
      if (process.env.DEEPSEEK_API_KEY) {
        const { data } = await axios.post("https://api.deepseek.com/chat/completions", {
          model: "deepseek-chat",
          messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.7
        }, { headers: { Authorization: \`Bearer \${process.env.DEEPSEEK_API_KEY}\` } });
        podcastText = data.choices[0].message.content;
      } else if (process.env.TOGETHER_API_KEY) {
        const { data } = await axios.post("https://api.together.xyz/v1/chat/completions", {
          model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
          messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.7
        }, { headers: { Authorization: \`Bearer \${process.env.TOGETHER_API_KEY}\` } });
        podcastText = data.choices[0].message.content;
      } else {
        const { Groq } = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const resp = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.7
        });
        podcastText = resp.choices[0].message.content;
      }
    } catch (e) {
      console.error("AI Podcast Generation Error:", e.message);
      podcastText = \`Ciao, sono WIP. Siamo pronti per il Giorno \${dayNum} a \${destination}. Oggi visiteremo \${tappe.length} tappe emozionanti. Preparatevi a esplorare!\`;
    }

    podcastText = podcastText.replace(/[#*]/g, '');
    res.json({ text: podcastText });
  } catch (err) {
    console.error("Podcast err:", err);
    res.status(500).json({ error: "Errore generazione podcast" });
  }
});

`;
    content = content.substring(0, startIndex) + newEndpoint + content.substring(endIndex);
    fs.writeFileSync(serverFile, content, 'utf8');
    console.log("Updated WIP podcast endpoint successfully.");
} else {
    console.log("Start anchor not found in server.ts");
}
