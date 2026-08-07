const axios = require('axios');

const serverUrl = 'https://itainta.vercel.app';

async function test() {
  console.log('Testing Express server POI enrichment...');
  try {
    const res = await axios.post(`${serverUrl}/api/poi/enrich`, {
      name: 'Duomo di Massa',
      lat: 44.0378,
      lon: 10.1424,
      category: 'chiese',
      mode: 'standard',
      lang: 'it'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Status (success):', res.status);
    console.log('Data returned from server:', JSON.stringify(res.data).substring(0, 500));
  } catch (err) {
    console.log('Error:', err.status, err.message, err.response?.data);
  }
}

test();
