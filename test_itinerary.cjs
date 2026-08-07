const http = require('https');

const data = JSON.stringify({
  baseLocation: 'Roma',
  destinations: ['Firenze'],
  days: 3,
  interests: ['Storia']
});

const options = {
  hostname: 'itainta.vercel.app',
  port: 443,
  path: '/api/groq/itinerary',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.log(body);
  });
});

req.write(data);
req.end();
