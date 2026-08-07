const axios = require('axios');
const phqKey = "XpVfpLieYlYH63VwP25TgDqWcbzah_NM2GzUcBUS";
const lat = 41.9028;
const lon = 12.4964;
const radius = 50;
const startStr = "2026-06-23";
const endStr = "2026-07-23";

const url = `https://api.predicthq.com/v1/events?location_around.origin=${lat},${lon}&location_around.scale=${radius}km&active.gte=${startStr}&active.lte=${endStr}&sort=-rank&limit=15`;
console.log("URL:", url);

axios.get(url, {
  headers: { "Authorization": `Bearer ${phqKey}`, "Accept": "application/json" }
}).then(res => {
  console.log("Success PredictHQ. Total results:", res.data?.results?.length);
}).catch(err => {
  console.error("PredictHQ error:", err.response?.status, err.response?.data);
});
