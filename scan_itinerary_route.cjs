const fs = require('fs');

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

let start = -1;
let end = -1;

lines.forEach((line, idx) => {
  if (line.includes('app.post("/api/groq/itinerary') || line.includes("app.post('/api/groq/itinerary")) {
    start = idx;
  }
  if (start !== -1 && end === -1 && idx > start && line.trim() === '});') {
    end = idx + 1;
  }
});

if (start !== -1) {
  console.log(`Found route starting at line ${start + 1} and ending at line ${end}`);
  for (let i = start; i < Math.min(start + 180, lines.length); i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
} else {
  console.log('Route not found by exact string.');
}
