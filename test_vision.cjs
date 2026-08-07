const axios = require('axios');

async function testServerVision() {
    console.log("Testing Server Vision API fallback (Gemini)...");
    const mockImageBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

    try {
        const response = await axios.post(
            'http://127.0.0.1:3000/api/vision',
            {
                imageBase64: mockImageBase64,
                lat: 41.8902,
                lon: 12.4922
            }
        );
        console.log(`[SUCCESS] Status: ${response.status}`);
        console.log(`[SUCCESS] Result:`, JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error(`[ERROR] Status:`, err.response?.status);
        console.error(`[ERROR] Details:`, err.response?.data || err.message);
    }
}

testServerVision();
