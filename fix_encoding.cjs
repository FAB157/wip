const fs = require('fs');

function fixDoubleEncoding(text) {
  try {
    // Attempt to convert the garbled string to latin1 bytes, then decode as utf-8
    const bytes = Buffer.from(text, 'latin1');
    const fixed = bytes.toString('utf8');
    // Verify it doesn't contain the replacement character which means invalid utf8
    if (fixed.includes('')) {
      return null;
    }
    return fixed;
  } catch (e) {
    return null;
  }
}

const content = fs.readFileSync('server.ts', 'utf8');

// Find all matches that look like typical double-encoded utf-8 (start with Ã, â, ð)
const regex = /[Ãâð][\x80-\xFF\w\s]*/g;
let newContent = content;

// Instead of regex, let's just run the whole file through the fixer?
// No, the file might contain legitimate ASCII that shouldn't be touched, but latin1 -> utf8 on pure ASCII is a no-op!
// Wait! If there are ALREADY proper utf8 characters (like if someone manually typed 'à' recently), Buffer.from(..., 'latin1') will truncate them or scramble them.
// Let's just fix the entire string if possible.
const fullFixed = fixDoubleEncoding(content);
if (fullFixed && fullFixed !== content) {
    console.log("Full fix worked! Replacing...");
    fs.writeFileSync('server.ts.fixed', fullFixed, 'utf8');
    console.log("Saved to server.ts.fixed");
} else {
    console.log("Full fix failed (probably mixed encoding).");
    // Fallback manual replacements
    let manualFix = content
        .replace(/Ã¨/g, 'è')
        .replace(/Ã©/g, 'é')
        .replace(/Ã²/g, 'ò')
        .replace(/Ã¹/g, 'ù')
        .replace(/Ã€/g, 'À')
        .replace(/Ã¬/g, 'ì')
        .replace(/âœ¨/g, '✨')
        .replace(/ðŸ“œ/g, '📜')
        .replace(/Ãˆ/g, 'È')
        .replace(/Ã\u00A0/g, 'à') // C3 A0
        .replace(/PIÃ™/g, 'PIÙ')
        .replace(/Ã /g, 'à') // Space instead of nbsp?
        .replace(/Ã\u0080/g, 'À')
        .replace(/Ã\u0081/g, 'Á')
        .replace(/Ã\u0088/g, 'È')
        .replace(/Ã\u0089/g, 'É')
        .replace(/Ã\u008C/g, 'Ì')
        .replace(/Ã\u008D/g, 'Í')
        .replace(/Ã\u0092/g, 'Ò')
        .replace(/Ã\u0093/g, 'Ó')
        .replace(/Ã\u0099/g, 'Ù')
        .replace(/Ã\u009A/g, 'Ú')
        .replace(/Ã\u00A0/g, 'à')
        .replace(/Ã\u00A1/g, 'á')
        .replace(/Ã\u00A8/g, 'è')
        .replace(/Ã\u00A9/g, 'é')
        .replace(/Ã\u00AC/g, 'ì')
        .replace(/Ã\u00AD/g, 'í')
        .replace(/Ã\u00B2/g, 'ò')
        .replace(/Ã\u00B3/g, 'ó')
        .replace(/Ã\u00B9/g, 'ù')
        .replace(/Ã\u00BA/g, 'ú')
        .replace(/Ã\u00BB/g, 'û')
        .replace(/Ã\u00BC/g, 'ü')
        .replace(/â\u0080\u0099/g, "'")
        .replace(/â\u0080\u009C/g, '"')
        .replace(/â\u0080\u009D/g, '"');
    
    fs.writeFileSync('server.ts.fixed', manualFix, 'utf8');
    console.log("Saved manual fixes to server.ts.fixed");
}
