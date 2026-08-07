const fs = require('fs');
const path = require('path');

const profileFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\ProfileScreen.tsx';
const content = fs.readFileSync(profileFile, 'utf8');
const lines = content.split('\n');

console.log('ProfileScreen.tsx lines 720 to 820:');
for (let i = 720; i <= 820; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
