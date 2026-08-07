const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\70309c31-7365-4a53-b0ab-8be0da59df4b\\.system_generated\\logs\\transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lastCode = null;

  for await (const line of rl) {
    if (line.includes('replace_file_content') && line.includes('locationService.ts')) {
       // Just find lines containing the old code
       const parsed = JSON.parse(line);
       console.log("Found replace_file_content at step:", parsed.step_index);
    }
  }
}

processLineByLine();
