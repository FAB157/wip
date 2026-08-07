const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const out = [];
lines.forEach((l, i) => {
  if (l.includes('/api/autocomplete')) {
    out.push(`Line ${i+1}: ${l}`);
    for(let j=i+1; j<i+20; j++) out.push(`Line ${j+1}: ${lines[j]}`);
  }
});
fs.writeFileSync('auto_result.txt', out.join('\n'));
