const fs = require('fs');
const path = require('path');

const mapFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\MapArea.tsx';
const content = fs.readFileSync(mapFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for Supabase queries in MapArea.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('supabase') || line.includes('.from(')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
