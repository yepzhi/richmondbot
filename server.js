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
    const spanishWords = ['código', 'cómo', 'dónde', 'qué', 'cuál', 'mi', 'no', 'sí', 'ayuda', 'registro'];
    const lowerText = text.toLowerCase();
    const spanishMatches = spanishWords.filter(word => lowerText.includes(word)).length;
    return spanishMatches > 0 ? 'es' : 'en';
}

// Calculate similarity score
function calculateSimilarity(text, keywords) {
    const lowerText = text.toLowerCase();
    let score = 0;

    keywords.forEach(keyword => {
        if (lowerText.includes(keyword.toLowerCase())) {
            score += 1;
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

async function queryGemini(messages, apiKey) {
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const lastMessage = messages[messages.length - 1].content;

        // Context prompt
        const prompt = `You are a helpful support assistant for Richmond Learning Platform. 
        Answer concisely (max 150 words).
        If the user asks in Spanish, answer in Spanish.
        If the user asks in English, answer in English.
        
        User Query: ${lastMessage}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('❌ Gemini API error:', error.message);
        return null; // Force fallback
    }
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
            const aiResponse = await queryGemini(messages, apiKey);

            if (aiResponse) {
                console.log('✅ Gemini response received');
                return res.json({
                    content: [{ text: aiResponse }],
                    source: 'gemini'
                });
            }
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
