const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
for (let i = 0; i < 200; i++) {
  if (lines[i] && lines[i].includes('await ') && !lines[i].includes('async')) {
    console.log(i + 1, lines[i]);
  }
}
