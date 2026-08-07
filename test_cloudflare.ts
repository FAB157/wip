import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

async function testCloudflare() {
  if (!accountId || !token) {
    console.error("Mancano le credenziali Cloudflare");
    return;
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;
  
  try {
    const res = await axios.post(
      url,
      {
        messages: [{ role: "user", content: "Ciao! Dimmi in 5 parole chi sei." }]
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log("SUCCESS:");
    console.log(res.data.result.response);
  } catch (error: any) {
    console.error("ERRORE CLOUDFLARE:");
    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testCloudflare();
