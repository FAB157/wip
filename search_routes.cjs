const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
const results = [];
lines.forEach((l, i) => {
  if (l.match(/app\.(post|get|put|delete|all|use)\s*\(/)) {
    results.push((i + 1) + ': ' + l.trim());
  }
});
fs.writeFileSync('routes_output.txt', results.join('\n'));
console.log('done');
