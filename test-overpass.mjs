import http from 'http';

const postData = JSON.stringify({
  data: '[out:json];node(44.0,10.0,44.1,10.1);out;'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/overpass',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
