const fs = require('fs');
const path = require('path');

const eventsFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\EventsScreen.tsx';
const content = fs.readFileSync(eventsFile, 'utf8');
const lines = content.split('\n');

console.log('EventsScreen.tsx imports (first 40 lines):');
for (let i = 1; i <= 40; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}

console.log('\nEventsScreen.tsx render function end (last 50 lines):');
for (let i = lines.length - 50; i <= lines.length; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
