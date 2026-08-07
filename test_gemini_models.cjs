require('dotenv').config();

async function listGeminiModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        console.log("Models:", data.models.map(m => m.name));
    } catch (err) {
        console.error(err);
    }
}
listGeminiModels();
