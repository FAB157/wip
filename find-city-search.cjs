const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src';

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('autocomplete') || content.includes('nominatim') || content.includes('citySearch') || content.includes('searchCity')) {
        console.log(`\nFile: ${path.relative(srcDir, fullPath)}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('autocomplete') || line.includes('nominatim') || line.includes('citySearch') || line.includes('searchCity') || line.includes('suggestions')) {
            console.log(`  L${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

scanDir(srcDir);
