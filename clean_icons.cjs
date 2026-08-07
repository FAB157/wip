const fs = require('fs');
const path = require('path');

const resPath = 'c:\\progetti\\itainta\\android\\app\\src\\main\\res';
const mipmapFoldersToRemoveFrom = ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi'];

mipmapFoldersToRemoveFrom.forEach(folder => {
  const folderPath = path.join(resPath, folder);
  try {
    fs.unlinkSync(path.join(folderPath, 'ic_launcher.png'));
  } catch(e) {}
  try {
    fs.unlinkSync(path.join(folderPath, 'ic_launcher_round.png'));
  } catch(e) {}
  try {
    fs.unlinkSync(path.join(folderPath, 'ic_launcher_foreground.png'));
  } catch(e) {}
});

console.log('Cleaned up lower dpi icons to avoid AAPT2 crash.');
