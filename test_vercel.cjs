const https = require('https');
const fs = require('fs');
https.get('https://itainta.vercel.app/api/autocomplete?input=Roma', (res) => {
  console.log('Status code:', res.statusCode);
});
