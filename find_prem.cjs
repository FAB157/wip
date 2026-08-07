const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const out = [];
lines.forEach((l, i) => {
  if (l.includes('/api/premium-guide')) {
    out.push(`Line ${i+1}: ${l}`);
  }
});
fs.writeFileSync('temp.txt', out.join('\n'));
