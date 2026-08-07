const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://127.0.0.1:3000/api';
const outputLogPath = path.join(__dirname, 'scratch', 'test_results.txt');

// Ensure scratch directory exists
try {
  fs.mkdirSync(path.join(__dirname, 'scratch'), { recursive: true });
} catch (e) {}

let logContent = '=== RUNNING COMPREHENSIVE SUITE OF TEST CALLS ===\n';
function log(msg) {
  console.log(msg);
  logContent += msg + '\n';
}

async function runTests() {
  // 1. Test Geocoding & Wiki POIs
  try {
    log('\n1. Testing Geocoding & Wiki POIs...');
    const geoRes = await axios.get(`${API_BASE}/nominatim/search?q=Rome`);
    log(`  [Nominatim Search] Status: ${geoRes.status}, Found: ${geoRes.data?.length || 0} locations`);
    
    const wikiRes = await axios.get(`${API_BASE}/wiki/pois?lat=41.8902&lon=12.4922`);
    log(`  [Wikipedia Geosearch] Status: ${wikiRes.status}, Keys found: ${Object.keys(wikiRes.data?.query?.pages || {}).length}`);
  } catch (err) {
    log(`  [Error] Wiki/Nominatim: ${err.message || err}`);
  }

  // 2. Test PredictHQ Proxy
  try {
    log('\n2. Testing PredictHQ integration...');
    const startStr = new Date().toISOString().split('T')[0];
    const endStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const res = await axios.get(`${API_BASE}/predicthq?lat=41.8902&lon=12.4922&radius=50&startStr=${startStr}&endStr=${endStr}`);
    log(`  [PredictHQ Proxy] Status: ${res.status}, Events found: ${res.data?.results?.length || 0}`);
  } catch (err) {
    log(`  [Error] PredictHQ: ${err.message}`);
  }

  // 3. Test Viator Proxy
  try {
    log('\n3. Testing Viator integration (Monetized)...');
    const startStr = new Date().toISOString().split('T')[0];
    const endStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const res = await axios.post(`${API_BASE}/viator`, {
      lat: "41.8902",
      lon: "12.4922",
      radius: "50",
      startDate: startStr,
      endDate: endStr,
      cityName: "Rome"
    });
    log(`  [Viator Proxy] Status: ${res.status}, Experiences found: ${res.data?.length || 0}`);
    if (res.data && res.data.length > 0) {
      log(`  [Affiliate Check] Sample URL: ${res.data[0].url}`);
    }
  } catch (err) {
    log(`  [Error] Viator: ${err.message}`);
  }

  // 4. Test Autocomplete & Google Places Proxy
  try {
    log('\n4. Testing Google Places proxies...');
    const autoRes = await axios.get(`${API_BASE}/autocomplete?input=Colosseum`);
    log(`  [Places Autocomplete] Status: ${autoRes.status}, Predictions: ${autoRes.data?.predictions?.length || 0}`);
    
    const localsRes = await axios.get(`${API_BASE}/google-locali?lat=41.8902&lon=12.4922`);
    log(`  [Places Nearby] Status: ${localsRes.status}, Results: ${localsRes.data?.results?.length || 0}`);
  } catch (err) {
    log(`  [Error] Google Places: ${err.message}`);
  }

  // 5. Test TTS Neural Synthesis
  try {
    log('\n5. Testing TTS Neural Synthesis (Azure/Google Wavenet)...');
    const res = await axios.post(`${API_BASE}/tts/smart`, {
      text: "Benvenuti a Roma, la città eterna.",
      voice: "it-IT-DiegoNeural"
    });
    log(`  [Neural TTS] Status: ${res.status}, Type: ${res.headers['content-type']}`);
  } catch (err) {
    log(`  [Error] TTS Synthesis: ${err.message}`);
  }

  // 5b. Test Computer Vision API
  try {
    log('\n5b. Testing Computer Vision API (/api/vision)...');
    // 1x1 pixel black JPEG image base64
    const mockImageBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    const res = await axios.post(`${API_BASE}/vision`, {
      imageBase64: mockImageBase64,
      lat: 41.8902,
      lon: 12.4922
    });
    log(`  [Vision API] Status: ${res.status}, Riconosciuto: ${res.data?.riconosciuto}`);
    if (res.data) {
      log(`  [Vision API Result] Name: ${res.data.nome}, City: ${res.data.citta}`);
    }
  } catch (err) {
    log(`  [Error] Vision API: ${err.message}`);
    if (err.response) {
      log(`  [Error Response] Body: ${JSON.stringify(err.response.data)}`);
    }
  }

  // 6. Test DeepSeek Itinerary Creation (Smoke Test)
  try {
    log('\n6. Testing AI Itinerary Generation (DeepSeek/Groq)...');
    const res = await axios.post(`${API_BASE}/groq/itinerary`, {
      destination: "Rome",
      days: 1,
      startTime: "09:00",
      endTime: "18:00",
      interests: ["arte"],
      budget: "standard",
      viaggiatori: "solo",
      ritmo: "standard",
      guida: "NICKY",
      includeTours: true,
      includeEvents: true
    });
    log(`  [Itinerary Generation] Status: ${res.status}`);
    log(`  [Itinerary Check] Title: ${res.data?.titolo}`);
    log(`  [Itinerary Check] IncludeTours: ${res.data?.info_viaggio?.includeTours}`);
    log(`  [Itinerary Check] IncludeEvents: ${res.data?.info_viaggio?.includeEvents}`);
  } catch (err) {
    log(`  [Error] Itinerary Generation: ${err.message}`);
  }

  fs.writeFileSync(outputLogPath, logContent, 'utf8');
  log(`\nTest results written to ${outputLogPath}`);
}

// Wait for server to boot
setTimeout(() => {
  runTests();
}, 2000);
