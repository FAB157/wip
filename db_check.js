import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDb() {
  console.log('--- STATISTICHE CATEGORIE ---');
  let categoryCounts = {};
  
  let hasMore = true;
  let from = 0;
  const step = 5000;
  
  let totalPois = 0;
  let totalIsGemTrue = 0;
  let totalCatGemme = 0;
  let gemCategories = {};

  while(hasMore) {
    const { data, error } = await supabase.from('shared_pois').select('category, is_gem').range(from, from + step - 1);
    if (error) {
      console.error(error);
      break;
    }
    if (data.length === 0) {
      hasMore = false;
      break;
    }
    
    totalPois += data.length;
    
    for (const row of data) {
      const cat = row.category || 'NULL';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      
      if (row.is_gem === true) {
        totalIsGemTrue++;
        gemCategories[cat] = (gemCategories[cat] || 0) + 1;
      }
      if (cat === 'gemme') {
        totalCatGemme++;
      }
    }
    
    from += step;
  }
  
  console.log('Totale POI analizzati:', totalPois);
  console.log('\nTop 20 Categorie nel Database:');
  const sortedCats = Object.entries(categoryCounts).sort((a,b) => b[1] - a[1]).slice(0, 20);
  for (const [cat, count] of sortedCats) {
    console.log(`- ${cat}: ${count}`);
  }
  
  console.log('\n--- STATISTICHE GEMME ---');
  console.log('POI con is_gem = true:', totalIsGemTrue);
  console.log('POI con category = "gemme":', totalCatGemme);
  console.log('\nCome sono distribuite le vere Gemme (is_gem=true) nelle varie categorie?');
  const sortedGemCats = Object.entries(gemCategories).sort((a,b) => b[1] - a[1]);
  for (const [cat, count] of sortedGemCats) {
    console.log(`- ${cat}: ${count}`);
  }
}
checkDb();
