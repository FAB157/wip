import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING SERVER.TS FOR END OF ENRICH ROUTE CONTINUED ---');
for (let i = 1980; i < 2010; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
