const fs = require('fs');
const path = require('path');

const mapFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\MapArea.tsx';
const content = fs.readFileSync(mapFile, 'utf8');
const lines = content.split('\n');

console.log('MapArea.tsx lines 1060 to 1100:');
for (let i = 1060; i <= 1100; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
