const fs = require('fs');
const path = require('path');

const appFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\App.tsx';
const content = fs.readFileSync(appFile, 'utf8');
const lines = content.split('\n');

console.log('App.tsx lines around L217:');
for (let i = 210; i <= 235; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}

console.log('\nApp.tsx lines around L353:');
for (let i = 345; i <= 365; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
