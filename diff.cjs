const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('git diff android/', { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 });
  fs.writeFileSync('diff.txt', output);
  console.log("Diff saved to diff.txt");
} catch (e) {
  console.error("Error:", e);
}
