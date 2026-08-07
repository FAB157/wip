const fs = require('fs');
const path = require('path');
function search(dir, str) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      search(full, str);
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.toLowerCase().includes(str)) {
        console.log(`Found in: ${full}`);
      }
    }
  }
}
search('src/components', 'raggio');
search('src/components', 'esplorazion');
