import puppeteer from 'puppeteer';

(async () => {
  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Capture page errors
    page.on('pageerror', err => {
      console.log('PAGE ERROR:', err.message);
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('CONSOLE ERROR:', msg.text());
      }
    });

    console.log('Navigating to https://itainta.vercel.app ...');
    await page.goto('https://itainta.vercel.app', { waitUntil: 'networkidle2' });
    
    console.log('Page loaded. Checking for content...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText.trim()) {
      console.log('PAGE IS EMPTY (White Page).');
    } else {
      console.log('PAGE HAS CONTENT:', bodyText.substring(0, 100));
    }

    await browser.close();
  } catch (err) {
    console.error('Error in Puppeteer script:', err);
  }
})();
