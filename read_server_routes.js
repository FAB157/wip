import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log('--- SEARCHING FOR ADMIN OR POI ROUTES IN SERVER.TS ---');
lines.forEach((line, idx) => {
  if (line.includes('app.get("/api/') || line.includes('app.post("/api/')) {
    if (line.includes('admin') || line.includes('poi') || line.includes('quota')) {
      console.log(`Line ${idx+1}: ${line.trim()}`);
    }
  }
});
