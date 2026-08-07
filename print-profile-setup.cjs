const fs = require('fs');
const path = require('path');

const profileFile = 'C:\\Users\\HP\\Desktop\\ITA IN TAS\\itainta\\src\\components\\ProfileScreen.tsx';
const content = fs.readFileSync(profileFile, 'utf8');
const lines = content.split('\n');

console.log('Searching for fetchQuotaCounters in ProfileScreen.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('fetchQuotaCounters') || line.includes('quotaCounters')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
