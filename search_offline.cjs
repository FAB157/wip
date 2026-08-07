const fs = require('fs');
const lines = fs.readFileSync('src/components/PlanScreen.tsx', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('offlineStatus')) {
    console.log(i + 1, l.trim());
  }
});
