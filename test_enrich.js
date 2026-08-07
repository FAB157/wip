const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/poi/enrich',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Body:', data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

const body = JSON.stringify({
  id: 'test-123',
  name: 'Torre di Pisa',
  lat: 43.722952,
  lon: 10.396597,
  category: 'monumenti',
  lang: 'it'
});

req.write(body);
req.end();
