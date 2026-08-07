import axios from 'axios';

async function testTts() {
  try {
    console.log("Sending TTS request to localhost:3000...");
    const res = await axios.post('http://localhost:3000/api/tts/smart', {
      text: "Test di connessione.",
      voice: "it-IT-ElsaNeural"
    }, { responseType: 'arraybuffer' });
    console.log("Status:", res.status);
    console.log("Length:", res.data.byteLength);
  } catch (e: any) {
    console.error("Error Message:", e.message);
    if (e.response) {
       console.error("Status:", e.response.status);
       console.error("Data:", Buffer.from(e.response.data).toString());
    }
  }
}

testTts();
