const fs = require('fs');
const lines = fs.readFileSync('c:/progetti/itainta/src/components/MapArea.tsx', 'utf8').split('\n');
lines.forEach((line, i) => {
  if (line.toLowerCase().includes('.from') || line.toLowerCase().includes('rpc')) {
    console.log(`${i+1}: ${line}`);
  }
});
