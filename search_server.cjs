const fs = require('fs');

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.toLowerCase().includes('precauzioni') || line.toLowerCase().includes('zone_da_evitare') || line.toLowerCase().includes('suggerimenti')) {
        console.log(`Line ${index + 1}: ${line}`);
    }
});
