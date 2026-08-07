const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, 'src/components/MapArea.tsx'), 'utf-8').split('\n');
lines.forEach((l, i) => {
  if (l.toLowerCase().includes('autocomplete') || l.toLowerCase().includes('search')) {
    console.log(`${i}: ${l.trim()}`);
  }
});
