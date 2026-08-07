import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.error("❌ Manca UNSPLASH_ACCESS_KEY in .env");
    return;
  }
  
  try {
    const url = `https://api.unsplash.com/search/photos?query=Colonnata&client_id=${key}&per_page=1`;
    console.log("Contattando Unsplash API...");
    const res = await axios.get(url, { timeout: 5000 });
    
    if (res.data && res.data.results) {
      console.log(`✅ Unsplash OK! Trovate ${res.data.total} foto per 'Colonnata'.`);
      if (res.data.results.length > 0) {
        console.log(`📸 Prima foto: ${res.data.results[0].urls.regular}`);
      }
    } else {
      console.log("⚠️ Risposta strana da Unsplash:", res.data);
    }
  } catch (e: any) {
    console.error("❌ Errore Unsplash:", e.response ? JSON.stringify(e.response.data) : e.message);
  }
}
run();
