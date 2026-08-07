import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- SCANNING APP.TSX FOR SAVED POIS / ITINERARY PERSISTENCE ---');
lines.forEach((line, idx) => {
  if (line.includes('toggleSavedPoi') || line.includes('savedPois') || line.includes('setItinerary') || line.includes('save') || line.includes('localStorage')) {
    if (line.includes('function') || line.includes('const') || line.includes('effect') || line.includes('await') || line.includes('from(')) {
      console.log(`L${idx+1}: ${line.trim()}`);
      // Print 10 lines around it
      const start = Math.max(0, idx - 4);
      const end = Math.min(lines.length, idx + 10);
      for (let i = start; i < end; i++) {
        console.log(`  ${i+1}: ${lines[i]}`);
      }
    }
  }
});
