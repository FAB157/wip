const fs = require('fs');
const path = require('path');

const profileFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\ProfileScreen.tsx';
const content = fs.readFileSync(profileFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for activeTab === \'impostazioni\' in ProfileScreen.tsx:');
let startLine = -1;
lines.forEach((line, idx) => {
  if (line.includes("activeTab === 'impostazioni'") || line.includes('quotaCounters.audioguide_used')) {
    if (startLine === -1) startLine = idx - 5;
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});

if (startLine !== -1) {
  console.log(`\nRendering code starting around L${startLine}:`);
  for (let i = startLine; i <= startLine + 100; i++) {
    console.log(`${i}: ${lines[i-1]}`);
  }
}
