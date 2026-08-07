import fs from 'fs';
import path from 'path';

function searchFile(dir, pattern) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      searchFile(fullPath, pattern);
    } else if (file.endsWith('.js') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (pattern.test(content)) {
        console.log(`Found pattern in: ${fullPath}`);
      }
    }
  }
}

console.log('Searching for "groq" in supabase directory...');
searchFile('./supabase', /groq/i);
