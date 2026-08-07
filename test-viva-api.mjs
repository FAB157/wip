import fetch from "node-fetch";

async function testviva() {
    try {
        const res = await fetch("https://www.vivaticket.com/api/vivaticket/ricerca?q=roma");
        console.log(res.status);
        console.log((await res.text()).substring(0, 300));
    } catch(e) { console.log(e); }
}
testviva();
