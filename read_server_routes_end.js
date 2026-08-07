import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING END OF ENRICH ROUTE IN SERVER.TS ---');
for (let i = 1930; i < 1980; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
