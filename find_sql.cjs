const fs = require('fs');
const path = require('path');

function searchInDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      searchInDir(fullPath, query);
    } else if (fullPath.endsWith('.sql')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(query)) {
        console.log('Found in:', fullPath);
      }
    }
  }
}

searchInDir(path.join(__dirname, 'supabase', 'migrations'), 'get_nearby_pois');
