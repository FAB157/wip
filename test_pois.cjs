const http = require('https');
const options = {
  hostname: 'itainta.vercel.app',
  port: 443,
  path: '/api/pois',
  method: 'GET'
};
const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
});
req.end();
