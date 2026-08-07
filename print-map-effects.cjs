const fs = require('fs');
const path = require('path');

const mapFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\MapArea.tsx';
const content = fs.readFileSync(mapFile, 'utf8');
const lines = content.split('\n');

console.log('All useEffect hooks in MapArea.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('useEffect(')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    // Print 15 lines after
    for (let i = idx; i <= Math.min(lines.length, idx + 20); i++) {
      console.log(`  L${i}: ${lines[i-1]}`);
    }
    console.log('');
  }
});
