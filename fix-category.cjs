const fs = require('fs');
let code = fs.readFileSync('src/components/PoiDetailSheet.tsx', 'utf8');

// Replace all instances of `(poi.category || "Luogo").charAt(0).toUpperCase() + poi.category.slice(1)`
// and similar variations with a safer expression.

code = code.replace(/\(poi\.category\s*\|\|\s*"Luogo"\)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*poi\.category\.slice\(1\)/g, '(poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")');
code = code.replace(/\(poiItem\.category\s*\|\|\s*"Luogo"\)\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*poiItem\.category\.slice\(1\)/g, '(poiItem.category ? (poiItem.category.charAt(0).toUpperCase() + poiItem.category.slice(1)) : "Luogo")');

// Also catch the ones that don't have the || "Luogo" if any remain:
code = code.replace(/poi\.category\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*poi\.category\.slice\(1\)/g, '(poi.category ? (poi.category.charAt(0).toUpperCase() + poi.category.slice(1)) : "Luogo")');
code = code.replace(/poiItem\.category\.charAt\(0\)\.toUpperCase\(\)\s*\+\s*poiItem\.category\.slice\(1\)/g, '(poiItem.category ? (poiItem.category.charAt(0).toUpperCase() + poiItem.category.slice(1)) : "Luogo")');

fs.writeFileSync('src/components/PoiDetailSheet.tsx', code);
console.log('Fixed category slice');
