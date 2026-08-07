const fetchVirgilio = async () => {
    try {
        const vRes = await fetch("https://api.codetabs.com/v1/proxy?quest=https://www.virgilio.it/italia/carrara/eventi/");
        const html = await vRes.text();
        const articles = html.split('<article class="eventi eventBox"').slice(1);
        console.log("Matched events:", articles.length);
        if (articles.length > 0) {
            const articleHtml = articles[0];
            const titleMatch = articleHtml.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/i);
            console.log(titleMatch)
        }
    } catch(e) {
        console.error(e);
    }
}
fetchVirgilio();
