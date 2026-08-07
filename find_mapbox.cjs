const fs = require('fs');
const path = require('path');

const projectDir = 'c:\\progetti\\itainta';

function searchDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git' && file !== '.vercel') {
        searchDirectory(fullPath);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.html') || file.endsWith('.css')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.toLowerCase().includes('mapbox')) {
          console.log(`Found 'mapbox' in: ${fullPath}`);
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes('mapbox')) {
              console.log(`  Line ${idx+1}: ${line.trim()}`);
            }
          });
        }
      }
    }
  }
}

try {
  console.log('--- SEARCHING FOR MAPBOX OCCURRENCES ---');
  searchDirectory(projectDir);
  console.log('--- SEARCH COMPLETED ---');
} catch (e) {
  console.error(e);
}
