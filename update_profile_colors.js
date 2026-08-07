const fs = require('fs');
let c = fs.readFileSync('src/components/ProfileScreen.tsx', 'utf8');

// Replace all instances of gray colors and on-surface-variant (antracite) with #1e3a8a or gold equivalents
c = c.replace(/text-on-surface-variant/g, 'text-[#1e3a8a]');
c = c.replace(/text-on-surface/g, 'text-[#1e3a8a]');

c = c.replace(/text-gray-500/g, 'text-[#1e3a8a]/60');
c = c.replace(/text-gray-600/g, 'text-[#1e3a8a]/70');

c = c.replace(/bg-gray-100/g, 'bg-[#fdfbf7]');
c = c.replace(/bg-gray-50/g, 'bg-[#fcfaf8]');
c = c.replace(/bg-gray-200/g, 'bg-amber-50');

c = c.replace(/border-gray-100/g, 'border-amber-100/50');
c = c.replace(/border-gray-200/g, 'border-amber-100/60');
c = c.replace(/border-gray-300/g, 'border-amber-200/50');

c = c.replace(/border-outline-variant\/10/g, 'border-amber-100/50');
c = c.replace(/border-outline-variant\/30/g, 'border-amber-200/50');
c = c.replace(/border-outline-variant\/5/g, 'border-amber-100/40');

fs.writeFileSync('src/components/ProfileScreen.tsx', c);
console.log('Colors replaced in ProfileScreen.tsx');
