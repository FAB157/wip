const fs = require('fs');
const path = require('path');

const eventsFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\EventsScreen.tsx';
const content = fs.readFileSync(eventsFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for BottomNav or navbar in EventsScreen.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('BottomNav') || line.includes('nav') || line.includes('flex justify') || line.includes('fixed') || line.includes('absolute')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
