import fs from 'fs';

const content = fs.readFileSync('src/components/PoiDetailSheet.tsx', 'utf8');
const lines = content.split('\n');

console.log('--- SEARCHING FOR isLoading RENDER IN POIDETAILSHEET.TSX ---');
lines.forEach((line, idx) => {
  if (line.includes('isLoading') && (line.includes('?') || line.includes('&&') || line.includes('div'))) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
    // Print 15 lines around it
    const start = Math.max(0, idx - 5);
    const end = Math.min(lines.length, idx + 15);
    for (let i = start; i < end; i++) {
      console.log(`  ${i+1}: ${lines[i]}`);
    }
  }
});
