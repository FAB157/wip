const fs = require('fs');
const path = require('path');

const dir = 'src/components';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

const i18nContent = fs.readFileSync('src/lib/i18n.ts', 'utf8');

for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    
    // Look for potential hardcoded text between JSX tags
    // e.g. > Qualcosa <
    let matches = content.match(/>([^<{}]+)</g);
    if (matches) {
        let hardcoded = matches.map(m => m.slice(1, -1).trim()).filter(m => m.length > 2 && /[a-zA-Z]/.test(m));
        
        // Filter out typical non-text
        hardcoded = hardcoded.filter(m => {
            if (m.startsWith('//') || m.startsWith('/*')) return false;
            if (m === 'WIP') return false;
            // Ignore english words that are common tags/code
            if (['km', 'm', 'min', 'WIP', 'PRO', 'Beta'].includes(m)) return false;
            return true;
        });

        if (hardcoded.length > 0) {
            console.log(`\n--- ${file} (JSX Text) ---`);
            hardcoded.forEach(h => console.log(`  "${h}"`));
        }
    }

    // Look for placeholders and titles
    let attrMatches = content.match(/(?:placeholder|title|label)=["']([^"']+)["']/g);
    if (attrMatches) {
        console.log(`\n--- ${file} (Attributes) ---`);
        attrMatches.forEach(m => console.log(`  ${m}`));
    }
}
