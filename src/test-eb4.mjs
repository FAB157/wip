import fetch from 'node-fetch';

(async () => {
    try {
        const ebToken = 'AXWM4JCDCENXGCFQBXUS';
        const searchRes = await fetch(`https://www.eventbriteapi.com/v3/events/?location.address=rome`, {
            headers: {
                'Authorization': `Bearer ${ebToken}`,
                'Accept': 'application/json'
            }
        });
        const searchData = await searchRes.json();
        console.log("Search:", JSON.stringify(searchData, null, 2));
    } catch (err) {
        console.error(err);
    }
})();
