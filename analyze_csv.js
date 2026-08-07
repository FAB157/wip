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
  let validPois = 0;
  let invalidCoords = 0;
  let missingCategory = 0;
  
  const categoryCounts = {};
  const categoryFields = ['amenity', 'shop', 'leisure', 'railway', 'highway', 'tourism', 'craft'];
  let headers = [];

  for await (const line of rl) {
    if (lineCount === 0) {
      headers = line.split('\t');
    } else {
      const cols = line.split('\t');
      if (cols.length < 3) continue;
      
      const lat = parseFloat(cols[1]);
      const lon = parseFloat(cols[2]);
      
      let isValid = true;
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        invalidCoords++;
        isValid = false;
      }
      
      let assignedCategory = null;
      for (const field of categoryFields) {
        const idx = headers.indexOf(field);
        if (idx !== -1 && cols[idx] && cols[idx].trim() !== '') {
          assignedCategory = `${field}:${cols[idx].trim()}`;
          break;
        }
      }
      
      if (!assignedCategory) {
        missingCategory++;
      } else {
        categoryCounts[assignedCategory] = (categoryCounts[assignedCategory] || 0) + 1;
      }
      
      if (isValid) {
        validPois++;
      }
    }
    lineCount++;
  }

  console.log(`=== ANALISI FILE CSV ===`);
  console.log(`Totale righe: ${lineCount}`);
  console.log(`POI validi: ${validPois}`);
  console.log(`POI con coordinate non valide: ${invalidCoords}`);
  console.log(`POI senza categoria definita: ${missingCategory}`);
  console.log(`\n=== CATEGORIE TROVATE ===`);
  
  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1]);
    
  for (const [cat, count] of sortedCategories) {
    console.log(`${cat}: ${count}`);
  }
}

analyze().catch(console.error);
