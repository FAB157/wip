const fs = require('fs');
const path = require('path');

const mapFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\MapArea.tsx';
const content = fs.readFileSync(mapFile, 'utf8');
const lines = content.split('\n');

console.log('MapArea.tsx lines 480 to 520:');
for (let i = 480; i <= 520; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
