const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'AppGuide.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Splittiamo in linee
let lines = content.split(/\r?\n/);

// Teniamo solo fino alla riga 263 (indice 263, che è la riga 264)
let newLines = lines.slice(0, 264);

// Aggiungiamo i tag di chiusura mancanti
newLines.push('            </div>');
newLines.push('          </div>');
newLines.push('        </AccordionItem>');
newLines.push('      </div>');
newLines.push('    </div>');
newLines.push('  );');
newLines.push('}');

// Riscriviamo il file
fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
console.log('AppGuide.tsx corretto con successo!');
