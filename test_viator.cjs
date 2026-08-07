const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', 'progetti', 'itainta', '.env') });

async function testViator() {
  const apiKey = "ac2a590a-53dc-45f2-919c-26a77dddd89e";
  if (!apiKey) {
    console.error("VIATOR_API_KEY non trovata nel file .env");
    return;
  }

  const startDate = new Date().toISOString().split("T")[0];
  const payload = {
    searchTerm: "Roma",
    searchTypes: [{ searchType: "PRODUCTS" }],
    currency: "EUR"
  };

  try {
    console.log("Inviando richiesta a Viator API con payload:", JSON.stringify(payload, null, 2));
    const res = await axios.post("https://api.sandbox.viator.com/partner/search/freetext", payload, {
      headers: {
        "exp-api-key": apiKey,
        "Accept": "application/json;version=2.0",
        "Accept-Language": "it-IT",
        "Content-Type": "application/json"
      },
      timeout: 8000
    });
    
    console.log("Status code:", res.status);
    console.log("Prodotti trovati:", res.data?.products?.length || 0);
    if (res.data?.products?.length > 0) {
        console.log("Primo prodotto:", res.data.products[0].title);
    }
  } catch (err) {
    console.error("Errore chiamata Viator:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
  }
}

testViator();
