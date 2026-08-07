const fs = require('fs');
let out = '';
['src/services/locationService.ts', 'src/App.tsx', 'src/services/audioguideService.ts'].forEach(file => {
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (l.match(/geofence|avviso|audio|navigat/i)) {
        out += `${file}:${i+1}: ${l.trim()}\n`;
      }
    });
  }
});
fs.writeFileSync('grep_output_utf8.txt', out, 'utf8');
