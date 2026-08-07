const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('arricchi') || l.includes('enrich')) {
    console.log(i + 1, l);
  }
});
