async function main() {
  const res = await fetch('https://www.virgilio.it/italia/roma/eventi/', {
      headers: {"User-Agent": "Mozilla/5.0"}
  });
  const text = await res.text();
  console.log("has article eventi:", text.includes('<article class="eventi '));
  console.log("article count:", text.split('<article').length);
}
main();
