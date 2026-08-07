const https = require('https');
const fs = require('fs');
https.get('https://itainta.vercel.app/api/autocomplete?input=Roma', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => fs.writeFileSync('auto_out.json', data));
}).on('error', err => fs.writeFileSync('auto_out.json', err.message));
