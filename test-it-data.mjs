import fetch from "node-fetch";
async function testIt() {
  const res = await fetch("https://www.italia.it/it/ricerca?q=roma", {
      headers: { "User-Agent": "Mozilla/5.0" }
  });
  const t = await res.text();
  console.log("Italia.it length:", t.length);
  const match = t.match(/<script type="application\/json".*?>(.*?)<\/script>/i);
  if (match) console.log("Found JSON state");
}
testIt();
