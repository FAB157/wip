(async () => {
    try {
        const res = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', {
            headers: {
                'Authorization': `Bearer AXWM4JCDCENXGCFQBXUS`,
                'Accept': 'application/json'
            }
        });
        const data = await res.json();
        console.log("Organizations:", JSON.stringify(data, null, 2));

        if (data.organizations && data.organizations.length > 0) {
            const orgId = data.organizations[0].id;
            const evRes = await fetch(`https://www.eventbriteapi.com/v3/organizations/${orgId}/events/`, {
                headers: {
                    'Authorization': `Bearer AXWM4JCDCENXGCFQBXUS`,
                    'Accept': 'application/json'
                }
            });
            const evData = await evRes.json();
            console.log("Events:", JSON.stringify(evData, null, 2));
        }

        // Test search endpoint just in case
        const searchRes = await fetch(`https://www.eventbriteapi.com/v3/events/search/?location.address=rome`, {
            headers: {
                'Authorization': `Bearer AXWM4JCDCENXGCFQBXUS`,
                'Accept': 'application/json'
            }
        });
        const searchData = await searchRes.json();
        console.log("Search:", JSON.stringify(searchData, null, 2));

    } catch (err) {
        console.error(err);
    }
})();
