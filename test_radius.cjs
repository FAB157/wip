const http = require('https');

const data = JSON.stringify({
  baseLocation: 'Roma',
  radius: '10',
  days: 3,
  interests: ['Storia']
});

const options = {
  hostname: 'itainta.vercel.app',
  port: 443,
  path: '/api/groq/itinerary-radius',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.time('request');
const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.timeEnd('request');
    console.log(body);
  });
});

req.on('error', error => {
  console.timeEnd('request');
  console.error(error);
});

req.write(data);
req.end();
