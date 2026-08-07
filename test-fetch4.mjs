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
  let count2 = 0;
  let count3 = 0;
  articles.forEach((articleHtml, idx) => {
    const titleMatch2 = articleHtml.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/i);
    const titleMatch3 = articleHtml.match(/<h3[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h3>/i);
    if (titleMatch2) count2++;
    if (titleMatch3) count3++;
  });
  console.log("h2 format:", count2);
  console.log("h3 format:", count3);
}
test();
