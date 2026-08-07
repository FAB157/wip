const fs = require('fs');
const content = fs.readFileSync('src/components/PlanScreen.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('checkUserQuota') || l.includes('limiti_giornalieri') || l.includes('limite')) {
    console.log(i + 1, l.trim());
  }
});
