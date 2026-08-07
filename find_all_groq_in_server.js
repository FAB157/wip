import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING SERVER.TS FOR "GROQ" ---');
lines.forEach((line, idx) => {
  if (/groq/i.test(line)) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
