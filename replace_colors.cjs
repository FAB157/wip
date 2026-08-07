const fs = require('fs');
const path = require('path');

const DIR = './src';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content
    .replace(/#1a4d3a/gi, '#1e3a8a')
    .replace(/1a4d3a/gi, '1e3a8a')
    .replace(/#005c55/gi, '#1e3a8a')
    .replace(/005c55/gi, '1e3a8a')
    .replace(/rgba\(\s*26\s*,\s*77\s*,\s*58\s*/g, 'rgba(30, 58, 138')
    .replace(/rgba\(\s*0\s*,\s*92\s*,\s*85\s*/g, 'rgba(30, 58, 138');

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Updated:', filePath);
  }
}

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    let fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      replaceInFile(fullPath);
    }
  });
}

walk(DIR);
console.log('Done.');
