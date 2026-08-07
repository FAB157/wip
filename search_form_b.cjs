const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'src', 'components', 'PlanScreen.tsx');
const lines = fs.readFileSync(p, 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes("plannerMode === 'form_b'")) {
    console.log(`${i+1}: ${l}`);
  }
});
