const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.HF_API_KEY;
    if (!apiKey) {
        console.error("❌ No API Key found in environment variables.");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        // This is a direct inspection, but the SDK helper might differ.
        // Let's try to get a model and assume it works, OR inspect the error.
        // Sadly, listModels isn't directly exposed in the high-level genAI object in some versions.
        // But we can try to just run a dummy generation on a model we SUSPECT exists, getting a specific error.
        // HOWEVER, the error message literally said "Call ListModels".
        // Let's try the fetch method if the SDK doesn't expose it easily.

        console.log("Checking available models...");
        // Actually, the best way with the SDK is usually iterating if supported or just guessing common ones.
        // Let's try 'gemini-1.0-pro' which is the newest stable name.

        const possibleModels = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash-001",
            "gemini-1.0-pro",
            "gemini-pro",
            "gemini-pro-vision",
            "gemini-1.0-pro-latest"
        ];

        for (const modelName of possibleModels) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello");
                console.log(`✅ Model found and working: ${modelName}`);
                return; // Found one!
            } catch (e) {
                console.log(`❌ ${modelName} failed: ${e.message.split(':')[0]}`);
            }
        }

    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
