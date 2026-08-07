const fs = require('fs');
const readline = require('readline');

async function analyze() {
  const filePath = 'C:\\Users\\HP\\Desktop\\utilitàwip.csv';
  
  if (!fs.existsSync(filePath)) {
    console.error("File non trovato.");
    return;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let glutenFreeCount = 0;
  let vegetarianCount = 0;
  let wheelchairCount = 0;
  
  let headers = [];

  for await (const line of rl) {
    if (lineCount === 0) {
      headers = line.split('\t');
    } else {
      const cols = line.split('\t');
      
      const gfIdx = headers.indexOf('diet:gluten_free');
      const vegIdx = headers.indexOf('diet:vegetarian');
      const wheelIdx = headers.indexOf('wheelchair');
      
      if (gfIdx !== -1 && cols[gfIdx]) {
        const val = cols[gfIdx].trim().toLowerCase();
        if (val === 'yes' || val === 'only') glutenFreeCount++;
      }
      
      if (vegIdx !== -1 && cols[vegIdx]) {
        const val = cols[vegIdx].trim().toLowerCase();
        if (val === 'yes' || val === 'only') vegetarianCount++;
      }
      
      if (wheelIdx !== -1 && cols[wheelIdx]) {
        const val = cols[wheelIdx].trim().toLowerCase();
        if (val === 'yes') wheelchairCount++;
      }
    }
    lineCount++;
  }

  console.log(JSON.stringify({ glutenFreeCount, vegetarianCount, wheelchairCount }, null, 2));
}

analyze().catch(console.error);
