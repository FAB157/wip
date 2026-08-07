const fs = require('fs');
const path = require('path');

const appFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\App.tsx';
const content = fs.readFileSync(appFile, 'utf8');
const lines = content.split('\n');

console.log('App.tsx lines 440 to 630:');
for (let i = 440; i <= 630; i++) {
  if (lines[i-1] !== undefined) {
    console.log(`${i}: ${lines[i-1]}`);
  }
}
