const fs = require('fs');
const path = require('path');

const appFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\App.tsx';
const content = fs.readFileSync(appFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for BottomNav render in App.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('<BottomNav') || line.includes('activeTab')) {
    if (line.includes('<BottomNav')) {
      console.log(`L${idx+1}: ${line.trim()}`);
      for (let i = Math.max(1, idx - 5); i <= Math.min(lines.length, idx + 10); i++) {
        console.log(`  L${i}: ${lines[i-1]}`);
      }
      console.log('');
    }
  }
});
