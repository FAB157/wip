const fs = require('fs');
const lines = fs.readFileSync('server.ts', 'utf-8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('ai.models.generateContent') || l.includes('ai.getGenerativeModel') || l.includes('GoogleGenAI')) {
    console.log(`${i}: ${l.trim()}`);
  }
});
