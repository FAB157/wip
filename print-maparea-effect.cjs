const fs = require('fs');
const path = require('path');

const mapFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\MapArea.tsx';
const content = fs.readFileSync(mapFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for performFetchPois calls in MapArea.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('performFetchPois')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    for (let i = Math.max(1, idx - 2); i <= Math.min(lines.length, idx + 4); i++) {
      console.log(`  L${i}: ${lines[i-1]}`);
    }
    console.log('');
  }
});
