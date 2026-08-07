const fs = require('fs');
const path = require('path');

const mapFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\MapArea.tsx';
const content = fs.readFileSync(mapFile, 'utf8');
const lines = content.split('\n');

console.log('MapArea.tsx lines 1145 to 1180:');
for (let i = 1145; i <= 1180; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
