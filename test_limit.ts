import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const res = await axios.get('https://api.unsplash.com/photos', {
      headers: {
        'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
      }
    });
    console.log("Limit:", res.headers['x-ratelimit-limit']);
    console.log("Remaining:", res.headers['x-ratelimit-remaining']);
  } catch (e: any) {
    if (e.response) {
      console.log("Status:", e.response.status);
      console.log("Limit:", e.response.headers['x-ratelimit-limit']);
      console.log("Remaining:", e.response.headers['x-ratelimit-remaining']);
    } else {
      console.error(e.message);
    }
  }
}
run();
