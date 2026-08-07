const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('app.post')) {
    console.log(i + 1, l.trim());
  }
});
