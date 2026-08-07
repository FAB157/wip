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
  articles.forEach((articleHtml, idx) => {
    const dateMatch = articleHtml.match(/<time[^>]*datetime="([^"]+)"/i);
    let eventDate = new Date().toISOString().split("T")[0];
    if (dateMatch) eventDate = dateMatch[1].split("T")[0];
    console.log("Article", idx, "date:", eventDate);
  });
}
test();
