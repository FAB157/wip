import axios from 'axios';


async function testPredictHQ() {
  console.log("=== Testing PredictHQ ===");
  const lat = 44.0792;
  const lon = 10.0967; // Carrara
  const radius = 50; // km
  const startStr = new Date().toISOString().split('T')[0];
  const endStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  
  const phqKey = "XpVfpLieYlYH63VwP25TgDqWcbzah_NM2GzUcBUS";
  const url = `https://api.predicthq.com/v1/events?location_around.origin=${lat},${lon}&location_around.scale=${radius}km&active.gte=${startStr}&active.lte=${endStr}&sort=-rank&limit=10`;
  
  try {
    const res = await axios.get(url, {
      headers: { "Authorization": `Bearer ${phqKey}` }
    });
    console.log(`PredictHQ results: ${res.data.results?.length} events found.`);
    if (res.data.results?.length > 0) {
      console.log(res.data.results[0].title);
    } else {
      console.log(res.data);
    }
  } catch (err) {
    console.error("PredictHQ error:", err.message);
    if (err.response) console.error(err.response.data);
  }
}

async function testGetYourGuide() {
  console.log("\n=== Testing GetYourGuide ===");
  const query = "Carrara";
  const url = `https://www.getyourguide.it/s?q=${encodeURIComponent(query)}`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    console.log("GYG fetched successfully, length:", res.data.length);
    // Find Next.js data or Apollo state
    const matches = res.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (matches && matches[1]) {
      console.log("Found __NEXT_DATA__ block");
      const data = JSON.parse(matches[1]);
      console.log("Parsed Next.js data!");
    } else {
      console.log("No Next.js block found, checking for window.__INITIAL_STATE__");
    }
  } catch (err) {
    console.error("GetYourGuide error:", err.message);
  }
}

async function run() {
  await testPredictHQ();
  await testGetYourGuide();
}

run();
