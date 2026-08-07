const fs = require('fs');
const path = require('path');

const src = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\44240c5a-ec51-47cd-82b6-ba03738f5bc6\\media__1780649096160.png';
const destDir = path.join('c:\\progetti\\itainta', 'assets');
const dest = path.join(destDir, 'icon.png');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
}
fs.copyFileSync(src, dest);
console.log('Icon copied successfully.');
