import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING REPLACE & SUGGEST IN SERVER.TS ---');
for (let i = 407; i < 485; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
