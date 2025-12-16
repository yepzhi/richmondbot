const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 7860;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Load Q&A databases
let qaSpanish = [];
let qaEnglish = [];

try {
    qaSpanish = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-data', 'spanish.json'), 'utf8'));
    qaEnglish = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-data', 'english.json'), 'utf8'));
    console.log(`✅ Loaded ${qaSpanish.length} Spanish Q&A and ${qaEnglish.length} English Q&A`);
} catch (error) {
    console.error('❌ Error loading Q&A databases:', error.message);
}

// Detect language
function detectLanguage(text) {
    const spanishWords = ['código', 'cómo', 'dónde', 'qué', 'cuál', 'mi', 'no', 'sí', 'ayuda', 'registro', 'hola', 'buenas'];
    const lowerText = text.toLowerCase();
    const spanishMatches = spanishWords.filter(word => lowerText.includes(word)).length;
    return spanishMatches > 0 ? 'es' : 'en';
}

// Calculate similarity score
// Helper to normalize text (remove accents and casing)
function normalizeText(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Levenshtein distance for fuzzy matching
function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// Calculate similarity score with Fuzzy Matching
function calculateSimilarity(text, keywords) {
    const normalizedText = normalizeText(text);
    const textWords = normalizedText.split(/\s+/); // Split user text into token words
    let score = 0;

    keywords.forEach(keyword => {
        const normKeyword = normalizeText(keyword);

        // Exact match check (substring)
        if (normalizedText.includes(normKeyword)) {
            score += 2; // High priority for exact phrase matches
            return;
        }

        // Fuzzy match check (word by word)
        // Only check single-word keywords for fuzzy matching to avoid complexity
        if (!normKeyword.includes(' ')) {
            for (const word of textWords) {
                // Allow 1 typo for words > 3 chars, 2 typos for words > 6 chars
                const dist = getLevenshteinDistance(word, normKeyword);
                const allowedErrors = normKeyword.length > 6 ? 2 : (normKeyword.length > 3 ? 1 : 0);

                if (dist <= allowedErrors && dist > 0) { // dist > 0 because exact match is handled above
                    score += 1;
                }
            }
        }
    });

    return score;
}

// Find best Q&A match
function findBestMatch(userMessage, language) {
    const db = language === 'es' ? qaSpanish : qaEnglish;
    let bestMatch = null;
    let highestScore = 0;

    for (const qa of db) {
        const score = calculateSimilarity(userMessage, qa.keywords);
        if (score > highestScore) {
            highestScore = score;
            bestMatch = qa;
        }
    }

    // Return match only if score is good enough
    return highestScore >= 1 ? bestMatch : null;
}

// Format links for response
function formatLinks(links) {
    if (!links || links.length === 0) return '';
    return '\n\n📎 Enlaces útiles:\n' + links.map(link => `• ${link}`).join('\n');
}

// Open Source AI (DeepSeek / Phi-3) via Hugging Face
async function queryOpenSource(messages, apiKey, language = 'es') {
    const lastMessage = messages[messages.length - 1].content;

    // Load context
    const contextDB = language === 'es' ? qaSpanish : qaEnglish;

    // Simplificar contexto para modelos más pequeños (Top 15 Q&A)
    const contextText = contextDB.slice(0, 15).map(qa => `- ${qa.category}: ${qa.answer}`).join('\n');

    // Prompt optimizado para modelos Chat/Instruct (Formato ChatML o similar)
    const systemInstruction = `You are a helpful Support Agent for "Richmond Learning Platform".
    CONTEXT:
    ${contextText}
    
    INSTRUCTIONS:
    - Answer user question based on CONTEXT.
    - If answer not in context, give general friendly advice.
    - Answer in ${language === 'es' ? 'Spanish' : 'English'}.
    - Be concise and friendly 🚀.`;

    const fullPrompt = `<|system|>\n${systemInstruction}\n<|user|>\n${lastMessage}\n<|assistant|>\n`;

    // Helper function for HF API
    async function callHF(modelId) {
        const response = await fetch(
            `https://router.huggingface.co/models/${modelId}`,
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: fullPrompt,
                    parameters: {
                        max_new_tokens: 300,
                        temperature: 0.7,
                        return_full_text: false
                    }
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Status ${response.status}`);
        }

        const result = await response.json();
        // HF returns array or object depending on pipeline
        let text = Array.isArray(result) ? result[0].generated_text : result.generated_text;

        // Cleanup artifacts
        if (text && text.includes('<|assistant|>')) {
            text = text.split('<|assistant|>').pop();
        }
        return text ? text.trim() : null;
    }

    // Try DeepSeek first, then Phi-3 (Fallback)
    const models = [
        'deepseek-ai/deepseek-coder-6.7b-instruct', // Good for tech support
        'microsoft/Phi-3-mini-4k-instruct'         // Very reliable fallback
    ];

    for (const model of models) {
        try {
            console.log(`🤖 Trying AI Model: ${model}...`);
            const ans = await callHF(model);
            if (ans) return ans;
        } catch (e) {
            console.warn(`⚠️ Model ${model} failed: ${e.message}`);
        }
    }

    return null;
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || messages.length === 0) return res.status(400).json({ error: 'No messages' });

        const lastMessage = messages[messages.length - 1].content;
        const language = detectLanguage(lastMessage);

        console.log(`📝 User message (${language}): ${lastMessage.substring(0, 50)}...`);

        // 1. Offline Match (Priority)
        const offlineMatch = findBestMatch(lastMessage, language);
        if (offlineMatch) {
            console.log(`✅ Offline match: ${offlineMatch.question}`);
            const response = offlineMatch.answer + formatLinks(offlineMatch.links);
            return res.json({ content: [{ text: response }], source: 'offline' });
        }

        // 2. Open Source AI (DeepSeek / Phi-3)
        // Use HF_API_KEY primarily
        const apiKey = process.env.HF_API_KEY || process.env.GEMINI_API_KEY;

        if (apiKey) {
            const aiResponse = await queryOpenSource(messages, apiKey, language);
            if (aiResponse) {
                console.log('✅ AI response received');
                return res.json({ content: [{ text: aiResponse }], source: 'ai' });
            }
        }

        // 3. Fallback
        const fallback = language === 'es'
            ? "No tengo esa información ahora, pero puedes contactar a soporte en 📧 rlp-ug.knowledgeowl.com/help"
            : "I don't have that info right now, please contact support at 📧 rlp-ug.knowledgeowl.com/help";

        res.json({ content: [{ text: fallback }], source: 'fallback' });

    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/', (req, res) => {
    res.status(200).send('RichmondBot Backend is Active 🟢');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Q&A Database: ${qaSpanish.length} ES + ${qaEnglish.length} EN`);
});
