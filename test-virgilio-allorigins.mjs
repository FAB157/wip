const fetchVirgilio = async () => {
    try {
        const vRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent("https://www.virgilio.it/italia/carrara/eventi/")}`);
        const json = await vRes.json();
        const html = json.contents;
        console.log("Length:", html.length);
        console.log("evento occurrences:", html.split("evento").length);
        
        // Use regex or cheerio equivalent to find some data
        // e.g. looking for event titles, let's just print a small chunk
        const match = html.match(/<article[^>]*>.*?<\/article>/is) || html.match(/<li[^>]*>.*?<\/li>/is);
        console.log(match ? match[0].slice(0, 500) : "No article or li tags");
    } catch(e) {
        console.error(e);
    }
}
fetchVirgilio();
