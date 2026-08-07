const fs = require('fs');
const path = require('path');

const planFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\PlanScreen.tsx';
const content = fs.readFileSync(planFile, 'utf8');
const lines = content.split('\n');

console.log('PlanScreen.tsx lines around L314:');
for (let i = 300; i <= 340; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
