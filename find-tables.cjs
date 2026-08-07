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
      const regex = /\.from\(['"]([^'"]+)['"]\)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        console.log(`File: ${path.relative(srcDir, fullPath)} -> Table: ${match[1]}`);
      }
    }
  }
}

console.log('Scanning for Supabase table references in src/:');
scanDir(srcDir);
