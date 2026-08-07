import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING /api/groq/itinerary IN SERVER.TS ---');
for (let i = 294; i < 415; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
