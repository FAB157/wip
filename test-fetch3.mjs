import fetch from "node-fetch";

async function test() {
  const vRes = await fetch("https://www.virgilio.it/italia/roma/eventi/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  const text = await vRes.text();
  const articles = text.split('<article class="eventi ').slice(1);
  console.log("Found HTML articles:", articles.length);
  articles.forEach((articleHtml, idx) => {
    const titleMatch = articleHtml.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/i) ||
                       articleHtml.match(/<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h3>/i);
    console.log("Article", idx, "title match:", !!titleMatch);
    if (!titleMatch) {
       console.log(articleHtml.substring(0, 200));
    }
  });
}
test();
