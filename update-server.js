const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/callUniversalAi\(\s*"[^"]+",\s*\[[\s\S]*?\],\s*\{[^}]*\},\s*"[^"]+",\s*supabaseUrl(Local)?,\s*supabaseServiceKey(Local)?,\s*groq\s*\)/g, (match) => {
  return match.replace(/\)\s*$/, ', req.body?.userId)');
});

content = content.replace(/streamUniversalAi\(\s*"[^"]+",\s*messages,\s*\{[^}]*\},\s*res,\s*null\s*\)/g, (match) => {
  return match.replace(/\)\s*$/, `, "streaming_enrichment", req.body?.userId)`);
});

fs.writeFileSync('server.ts', content, 'utf8');
console.log('Done');
