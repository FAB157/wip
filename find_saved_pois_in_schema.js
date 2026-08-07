import fs from 'fs';

if (fs.existsSync('schema.sql')) {
  const content = fs.readFileSync('schema.sql', 'utf8');
  const lines = content.split('\n');
  console.log('--- SCANNING SCHEMA.SQL FOR "saved_pois" ---');
  let insideTable = false;
  let bracesCount = 0;
  lines.forEach((line, idx) => {
    if (line.includes('CREATE TABLE') && line.includes('saved_pois')) {
      insideTable = true;
    }
    if (insideTable) {
      console.log(`${idx+1}: ${line}`);
      if (line.includes('(')) bracesCount++;
      if (line.includes(')')) bracesCount--;
      if (line.includes(';') && bracesCount <= 0) {
        insideTable = false;
      }
    }
  });
} else {
  console.log('schema.sql does not exist in root.');
}
