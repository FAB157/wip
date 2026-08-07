import fs from 'fs';

function findLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log(`\n--- USAGES IN ${filePath} ---`);
  lines.forEach((line, idx) => {
    if (/groq/i.test(line)) {
      console.log(`L${idx+1}: ${line.trim()}`);
      // Print 5 lines around it
      const start = Math.max(0, idx - 3);
      const end = Math.min(lines.length, idx + 4);
      for (let i = start; i < end; i++) {
        console.log(`  ${i+1}: ${lines[i]}`);
      }
    }
  });
}

findLines('server.ts');
findLines('src/components/PlanScreen.tsx');
