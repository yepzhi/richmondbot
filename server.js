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

// Google Gemini API call
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function queryGemini(messages, apiKey, language = 'es') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const lastMessage = messages[messages.length - 1].content;

    // Load context
    const contextDB = language === 'es' ? qaSpanish : qaEnglish;
    const contextText = contextDB.map(qa => `${qa.category}: ${qa.answer}`).slice(0, 30).join('\n');

    // Prompt construction
    const prompt = `
    Role: You are an expert Technical Support Agent for the "Richmond Learning Platform".
    Objective: Help students, teachers, and parents solve technical issues.
    Context: ${contextText}
    Instructions: Use context if possible. If not, give general advice. Be concise (<150 words). Answer in ${language === 'es' ? 'Spanish' : 'English'}. Use a friendly tone with emojis 🚀.
    User Query: ${lastMessage}`;

    // List of models to try in order of preference
    const modelCandidates = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-pro",
        "gemini-1.0-pro"
    ];

    for (const modelName of modelCandidates) {
        try {
            console.log(`🤖 Attempting Gemini model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.warn(`⚠️ Model ${modelName} failed: ${error.message.split(':')[0]}`);
            // Continue to next model
        }
    }

    console.error("❌ All Gemini models failed.");
    return null;
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        const lastMessage = messages[messages.length - 1];

        if (!lastMessage || lastMessage.role !== 'user') {
            return res.status(400).json({ error: 'Invalid message format' });
        }

        const userMessage = lastMessage.content;
        const language = detectLanguage(userMessage);

        console.log(`📝 User message (${language}): ${userMessage.substring(0, 50)}...`);

        // 1. Try offline Q&A first (faster & free-est)
        const offlineMatch = findBestMatch(userMessage, language);

        if (offlineMatch) {
            console.log(`✅ Offline match found: ${offlineMatch.question}`);
            const response = offlineMatch.answer + formatLinks(offlineMatch.links);
            return res.json({
                content: [{ text: response }],
                source: 'offline'
            });
        }

        // 2. Try Gemini API
        // Checks for GEMINI_API_KEY first, then fallbacks to HF_API_KEY (in case user reused the var)
        const apiKey = process.env.GEMINI_API_KEY || process.env.HF_API_KEY;

        if (apiKey) {
            console.log('🤖 Trying Gemini AI...');
            const aiResponse = await queryGemini(messages, apiKey, language);

            if (aiResponse) {
                console.log('✅ Gemini response received');
                return res.json({
                    content: [{ text: aiResponse }],
                    source: 'gemini'
                });
            }
        } else {
            console.log('❌ No API Key found (GEMINI_API_KEY or HF_API_KEY is missing/empty)');
        }

        // Fallback: generic response
        console.log('⚠️ Using fallback response');
        const fallbackMessage = language === 'es'
            ? 'Lo siento, no encontré una respuesta específica. Por favor contacta a soporte en:\n\n📧 rlp-ug.knowledgeowl.com/help\n🌐 richmond.com.mx'
            : 'Sorry, I couldn\'t find a specific answer. Please contact support at:\n\n📧 rlp-ug.knowledgeowl.com/help\n🌐 richmond.com.mx';

        res.json({
            content: [{ text: fallbackMessage }],
            source: 'fallback'
        });

    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: `Internal Error: ${error.message}` });
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
