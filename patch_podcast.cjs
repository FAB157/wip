const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.ts');
let content = fs.readFileSync(serverFile, 'utf8');

const anchorPos = content.indexOf('app.post(');

if (anchorPos === -1) {
    console.log("Could not find any app.post.");
    process.exit(1);
}

const newEndpoint = `
// --- PODCAST GIORNALIERO ITINERARI ---
app.post("/api/generate-daily-podcast", async (req, res) => {
  try {
    const { destination, dayNum, tappe } = req.body;
    if (!destination || !dayNum || !tappe) {
      return res.status(400).json({ error: "Dati mancanti" });
    }

    const sysPrompt = "Sei un presentatore radiofonico e podcaster di viaggi neutrale, amichevole e professionale. Il tuo compito è leggere il programma della giornata.";
    let userPrompt = \`Crea un podcast di circa 1 minuto per il Giorno \${dayNum} a \${destination}.\`;
    if (dayNum === 1) {
      userPrompt += \`\nInizia con una brevissima e affascinante prefazione generale sulla città di \${destination}.\`;
    }
    userPrompt += \`\nEcco le tappe previste:\\n\${tappe.map(t => "- " + t.name + (t.description ? ": " + t.description : "")).join("\\n")}\`;
    userPrompt += \`\nDescrivi l'itinerario in modo discorsivo. Aggiungi consigli pratici (es. cosa mangiare, come muoversi) prendendo spunto dalle tappe stesse.
    Regole fondamentali:
    - Scrivi SOLO il testo da leggere ad alta voce. Nessuna formattazione markdown, niente emoji.
    - Usa un tono entusiasta e accogliente.\`;

    // Usa DeepSeek, Groq o Together
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.GROQ_API_KEY || process.env.TOGETHER_API_KEY;
    if (!apiKey) {
       return res.status(500).json({ error: "Nessuna chiave API configurata." });
    }

    let podcastText = "Benvenuti alla giornata " + dayNum + " del vostro itinerario a " + destination + ". Preparatevi per una giornata fantastica!";
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
    }

    podcastText = podcastText.replace(/[#*]/g, '');
    res.json({ text: podcastText });
  } catch (err) {
    console.error("Podcast err:", err);
    res.status(500).json({ error: "Errore generazione podcast" });
  }
});

`;

content = content.substring(0, anchorPos) + newEndpoint + content.substring(anchorPos);
fs.writeFileSync(serverFile, content, 'utf8');
console.log("Endpoint added successfully before first app.post");
