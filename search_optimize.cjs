const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('optimize-itinerary') || l.includes('optimize')) {
    console.log(i + 1, l.trim());
  }
});
