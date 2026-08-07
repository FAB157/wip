const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

const replacements = [
  { regex: /bg-\[#f8f5f0\]/g, replacement: 'bg-background' },
  { regex: /bg-\[#1e3a8a\]/g, replacement: 'bg-primary' },
  { regex: /text-\[#1e3a8a\]/g, replacement: 'text-primary' },
  { regex: /border-\[#1e3a8a\]/g, replacement: 'border-primary' },
  { regex: /shadow-\[#1e3a8a\]/g, replacement: 'shadow-primary' },
  { regex: /text-blue-600/g, replacement: 'text-secondary' },
  { regex: /bg-blue-600/g, replacement: 'bg-secondary' },
  { regex: /bg-blue-50/g, replacement: 'bg-surface-variant' },
  { regex: /bg-white/g, replacement: 'bg-surface' },
  { regex: /text-gray-900/g, replacement: 'text-on-surface' },
  { regex: /text-gray-500/g, replacement: 'text-on-surface-variant' },
  { regex: /border-gray-100/g, replacement: 'border-outline-variant' },
  { regex: /border-gray-200/g, replacement: 'border-outline-variant' },
  { regex: /bg-gray-50/g, replacement: 'bg-surface-variant' },
  { regex: /bg-gray-100/g, replacement: 'bg-surface-variant' }
];

let modifiedFiles = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let original = content;

  for (const rule of replacements) {
    content = content.replace(rule.regex, rule.replacement);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Updated', file);
    modifiedFiles++;
  }
}

console.log(`Updated ${modifiedFiles} files.`);
