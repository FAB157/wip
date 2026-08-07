const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('/api/autocomplete')) console.log(i + 1, l);
});
