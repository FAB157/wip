const fs = require('fs');
const path = require('path');

const appFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\App.tsx';
const content = fs.readFileSync(appFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for EventsScreen in App.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('EventsScreen')) {
    console.log(`L${idx+1}: ${line.trim()}`);
    for (let i = Math.max(1, idx - 2); i <= Math.min(lines.length, idx + 4); i++) {
      console.log(`  L${i}: ${lines[i-1]}`);
    }
    console.log('');
  }
});
