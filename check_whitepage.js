const http = require('https');

http.get('https://itainta.vercel.app', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Extract main JS chunk
    const match = data.match(/<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>/);
    if (match) {
      const url = 'https://itainta.vercel.app' + match[1];
      console.log('Found main chunk:', url);
      http.get(url, (resJs) => {
        let jsData = '';
        resJs.on('data', chunk => jsData += chunk);
        resJs.on('end', () => {
          try {
            // Attempt to evaluate in a mocked environment
            global.window = {};
            global.document = { createElement: () => ({}), head: { appendChild: () => {} }, removeEventListener: () => {}, addEventListener: () => {} };
            global.navigator = {};
            // Just searching for common syntax errors or missing objects isn't enough...
            console.log("JS Size:", jsData.length);
          } catch(e) {
            console.log(e);
          }
        });
      });
    } else {
      console.log('Could not find JS chunk.');
    }
  });
});
