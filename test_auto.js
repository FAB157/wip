const http = require('http');
const fs = require('fs');
http.get('http://localhost:3001/api/autocomplete?input=Roma', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => fs.writeFileSync('auto_out.json', data));
}).on('error', err => fs.writeFileSync('auto_out.json', err.message));
