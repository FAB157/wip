const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testGeminiDirect() {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const mockImageBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

    const models = ["gemini-flash-latest"];

    for (const modelName of models) {
        console.log(`Testing model: ${modelName}`);
        try {
            const geminiResponse = await ai.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: "What is this?" },
                            { inlineData: { mimeType: "image/jpeg", data: mockImageBase64 } }
                        ]
                    }
                ]
            });
            console.log(`[SUCCESS] ${modelName}`);
        } catch (err) {
            console.error(`[ERROR] ${modelName}:`, err.message);
        }
    }
}

testGeminiDirect();
