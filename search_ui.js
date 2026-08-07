import fs from 'fs';

const files = [
  'src/components/PlanScreen.tsx',
  'src/components/PoiDetailSheet.tsx',
  'src/components/ProfileScreen.tsx',
  'src/components/UserProfileSummary.tsx'
];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes("language === 'IT'") || line.includes('language === "IT"')) {
      console.log(`[${file}:${i + 1}] ${line.trim()}`);
    }
  });
}
