const fs = require('fs');
const path = require('path');

const appFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\App.tsx';
const content = fs.readFileSync(appFile, 'utf8');
const lines = content.split('\n');

console.log('App.tsx lines 465 to 495:');
for (let i = 465; i <= 495; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
