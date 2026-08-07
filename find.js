import fs from 'fs';
import path from 'path';

function walkSync(dir, filelist = []) {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else {
      filelist.push(dirFile);
    }
  });
  return filelist;
}

const files = walkSync('src/components').filter(f => f.endsWith('.tsx'));
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes("=== 'IT'") || content.includes('=== "IT"')) {
    console.log(f);
  }
}
