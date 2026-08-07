const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'AdminEditor.tsx',
  'AdminCounters.tsx',
  'AdminDiagnostics.tsx',
  'AdminApiStats.tsx',
  'AdminEnrichedPois.tsx',
  'CameraScreen.tsx'
];

const basePath = path.join(__dirname, 'src', 'components');

const replacements = [
  { search: /bg-\[#1e3a8a\]/g, replace: 'bg-primary' },
  { search: /text-\[#1e3a8a\]/g, replace: 'text-primary' },
  { search: /border-\[#1e3a8a\]/g, replace: 'border-primary' },
  { search: /ring-\[#1e3a8a\]/g, replace: 'ring-primary' },
  { search: /bg-\[#fcfbf9\]/g, replace: 'bg-surface-variant' },
  { search: /bg-\[#f8f5f0\]/g, replace: 'bg-surface' },
  { search: /bg-white/g, replace: 'bg-surface' },
  { search: /text-white/g, replace: 'text-secondary' }, // Inside primary buttons
  { search: /border-gray-50/g, replace: 'border-outline-variant' },
  { search: /border-gray-100/g, replace: 'border-outline-variant' },
  { search: /border-gray-200/g, replace: 'border-outline-variant' },
  { search: /bg-gray-50/g, replace: 'bg-surface-variant' },
  { search: /hover:bg-gray-100/g, replace: 'hover:bg-outline-variant' },
  { search: /text-gray-400/g, replace: 'text-on-surface-variant' },
  { search: /text-gray-500/g, replace: 'text-on-surface-variant' },
  { search: /text-gray-600/g, replace: 'text-on-surface-variant' },
  { search: /text-gray-700/g, replace: 'text-on-surface' },
  { search: /text-gray-800/g, replace: 'text-on-surface' },
  { search: /text-gray-900/g, replace: 'text-on-surface' }
];

for (const filename of filesToUpdate) {
  const filePath = path.join(basePath, filename);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = content;
    
    for (const r of replacements) {
      updated = updated.replace(r.search, r.replace);
    }
    
    if (content !== updated) {
      fs.writeFileSync(filePath, updated);
      console.log(`Updated ${filename}`);
    } else {
      console.log(`No changes for ${filename}`);
    }
  } else {
    console.log(`File not found: ${filename}`);
  }
}
