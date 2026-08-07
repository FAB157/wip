const fs = require('fs');

const content = fs.readFileSync('src/lib/i18n.ts', 'utf8');

// Find start of TRANSLATIONS
const startIndex = content.indexOf('export const TRANSLATIONS');
if (startIndex === -1) {
    console.log('No TRANSLATIONS found');
    process.exit(1);
}

// Just split by lines after startIndex
const lines = content.slice(startIndex).split('\n');
let currentKey = null;
const translations = {};
const langs = ['IT', 'EN', 'FR', 'ES', 'RU', 'ZH'];
let braceCount = 0;
let insideTranslations = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;
    
    if (line.includes('export const TRANSLATIONS')) {
        insideTranslations = true;
    }
    
    if (!insideTranslations) continue;

    // A very simple brace counter to know when TRANSLATIONS ends
    for (let char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
    }
    
    // Check for key opening e.g. "explore: {" or "'some-key': {"
    let keyMatch = line.match(/^['"]?([a-zA-Z0-9_]+)['"]?:\s*\{/);
    if (keyMatch) {
        currentKey = keyMatch[1];
        translations[currentKey] = {};
        continue;
    }
    
    // Check for language e.g. "IT: 'Esplora',"
    if (currentKey) {
        let langMatch = line.match(/^([A-Z]{2}):\s*["']([^"']*)["']/);
        if (langMatch) {
            translations[currentKey][langMatch[1]] = langMatch[2];
        }
        
        if (line === '},' || line === '}') {
            currentKey = null;
        }
    }

    if (braceCount === 0 && insideTranslations && i > 0) {
        break; // End of TRANSLATIONS object
    }
}

let missingCount = 0;
console.log('--- Checking Missing Translations ---');
for (const key in translations) {
    for (const lang of langs) {
        if (!translations[key][lang] || translations[key][lang].trim() === '') {
            console.log(`Key "${key}" is missing translation for "${lang}"`);
            missingCount++;
        }
    }
}

if (missingCount === 0) {
    console.log('All keys have all 6 translations!');
} else {
    console.log(`Found ${missingCount} missing translations.`);
}
console.log(`Total keys found: ${Object.keys(translations).length}`);
