const https = require('https');
https.get('https://itainta.vercel.app/api/autocomplete?input=Roma', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, '\nDATA:', data));
}).on('error', err => console.log('ERROR:', err.message));
