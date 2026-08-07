const fs = require('fs');
const readline = require('readline');

async function extractCode() {
  const fileStream = fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\70309c31-7365-4a53-b0ab-8be0da59df4b\\.system_generated\\logs\\transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lastCode = null;

  for await (const line of rl) {
    if (line.includes('replace_file_content') && line.includes('locationService.ts')) {
       const parsed = JSON.parse(line);
       if (parsed.step_index === 4488 || parsed.step_index === 4440) {
           const toolCalls = parsed.tool_calls || [];
           for (const tc of toolCalls) {
               if (tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
                   console.log("Step", parsed.step_index, tc);
               }
           }
       }
    }
  }
}

extractCode();
