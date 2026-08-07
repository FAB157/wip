const fs = require('fs');
['src/services/locationService.ts', 'src/App.tsx', 'src/services/audioguideService.ts'].forEach(file => {
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (l.match(/geofence|avviso|audio|navigat/i)) {
        console.log(`${file}:${i+1}: ${l.trim()}`);
      }
    });
  }
});
