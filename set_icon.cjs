const fs = require('fs');
const path = require('path');

const srcIcon = 'C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\44240c5a-ec51-47cd-82b6-ba03738f5bc6\\media__1780649096160.png';
const resPath = 'c:\\progetti\\itainta\\android\\app\\src\\main\\res';

const mipmapFolders = ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];

mipmapFolders.forEach(folder => {
  const folderPath = path.join(resPath, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  // Copy as normal and round icons
  fs.copyFileSync(srcIcon, path.join(folderPath, 'ic_launcher.png'));
  fs.copyFileSync(srcIcon, path.join(folderPath, 'ic_launcher_round.png'));
  fs.copyFileSync(srcIcon, path.join(folderPath, 'ic_launcher_foreground.png'));
});

// Remove existing jpg versions if they exist
try {
  fs.unlinkSync(path.join(resPath, 'mipmap-xxxhdpi', 'ic_launcher.jpg'));
  fs.unlinkSync(path.join(resPath, 'mipmap-xxxhdpi', 'ic_launcher_round.jpg'));
  fs.unlinkSync(path.join(resPath, 'mipmap-xxxhdpi', 'ic_launcher_foreground.jpg'));
} catch (e) {}

// Remove vector foreground so it falls back to mipmap PNG
try {
  fs.unlinkSync(path.join(resPath, 'drawable-v24', 'ic_launcher_foreground.xml'));
} catch (e) {}

console.log('Icons updated manually.');
