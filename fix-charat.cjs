const fs = require('fs');
let code = fs.readFileSync('src/components/PoiDetailSheet.tsx', 'utf8');
code = code.replace(/poi\.category\.charAt/g, '(poi.category || "Luogo").charAt');
code = code.replace(/poiItem\.category\.charAt/g, '(poiItem.category || "Luogo").charAt');
fs.writeFileSync('src/components/PoiDetailSheet.tsx', code);
console.log('Fixed CharAt');
