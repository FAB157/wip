const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const targetStr = `      // 3. Unsplash Photo Fetch (High Priority)
      const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || process.env.VITE_UNSPLASH_ACCESS_KEY;
      if (!thumbnail && unsplashKey) {`;

const wikimediaCode = `      // 2.5. Wikimedia Commons Fallback
      if (!thumbnail) {
        try {
          const wikiCommonsUrl = \`https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=\${encodeURIComponent(name)}&format=json&origin=*\`;
          const cRes = await fetch(wikiCommonsUrl);
          if (cRes.ok) {
            const cData = await cRes.json();
            const fileName = cData.query?.search?.[0]?.title;
            if (fileName && fileName.startsWith("File:")) {
              const cleanName = fileName.substring(5);
              thumbnail = \`https://commons.wikimedia.org/w/index.php?title=Special:FilePath/\${encodeURIComponent(cleanName.replace(/ /g, "_"))}&width=800\`;
            }
          }
        } catch(e) {}
      }

      // 3. Unsplash Photo Fetch (High Priority)
      const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || process.env.VITE_UNSPLASH_ACCESS_KEY;
      if (!thumbnail && unsplashKey) {`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, wikimediaCode);
  fs.writeFileSync('server.ts', content, 'utf8');
  console.log("Successfully injected Wikimedia Commons.");
} else {
  console.log("Could not find the target string for injection.");
}
