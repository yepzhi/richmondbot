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

// Global variable to store the discovered working model
let ACTIVE_GEMINI_MODEL = null;

// Function to discover available Gemini models on startup
async function discoverGeminiModel(apiKey) {
    if (!apiKey) return;
    try {
        console.log('🔍 Discovering available Gemini models...');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (!data.models) {
            console.error('❌ No models found in discovery response:', data);
            return;
        }

        // Find the first model that supports generateContent
        const validModel = data.models.find(m =>
            m.name.includes('gemini') &&
            m.supportedGenerationMethods.includes('generateContent')
        );

        if (validModel) {
            ACTIVE_GEMINI_MODEL = validModel.name.replace('models/', ''); // remove 'models/' prefix for API calls sometimes, or keep it depending on endpoint. REST usually wants just the name or models/name. Let's try to keep it clean.
            // Actually v1beta/models/NAME:generateContent expects just NAME usually if name is simple, OR full resource name.
            // Let's store the short name if possible, or full.
            // API expects: https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent
            // data.models names are like "models/gemini-pro". We need "gemini-pro".
            ACTIVE_GEMINI_MODEL = validModel.name.split('/').pop();
            console.log(`✅ Auto-discovered Gemini Model: ${ACTIVE_GEMINI_MODEL}`);
        } else {
            console.warn('⚠️ No suitable Gemini chat model found in user availability list.');
        }
    } catch (error) {
        console.error('❌ Model discovery failed:', error.message);
    }
}

// Call discovery on load if Key exists
if (process.env.GEMINI_API_KEY) {
    discoverGeminiModel(process.env.GEMINI_API_KEY);
}

// Google Gemini API call (REST)
async function queryGemini(messages, apiKey, language = 'es') {
    // If we haven't discovered a model yet (and we have a key), try one last hail mary or default
    const modelToUse = ACTIVE_GEMINI_MODEL || 'gemini-pro';

    const lastMessage = messages[messages.length - 1].content;

    // Load context
    const contextDB = language === 'es' ? qaSpanish : qaEnglish;
    const contextText = contextDB.map(qa => `${qa.category}: ${qa.answer}`).slice(0, 30).join('\n');

    const promptText = `
    Role: Technical Support Agent for "Richmond Learning Platform".
    Context: ${contextText}
    Instructions: Answer based on context. Concise (<150 words). Language: ${language}. Friendly 🚀.
    User Query: ${lastMessage}`;

    async function callRest(modelName) {
        // Double check if we need models/ prefix. The URL is .../models/MODEL_NAME:generateContent
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`HTTP ${response.status}: ${err}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    try {
        console.log(`🤖 Querying Gemini REST with model: ${modelToUse}`);
        return await callRest(modelToUse);
    } catch (error) {
        console.error(`❌ Gemini (${modelToUse}) failed: ${error.message}`);
        // If auto-discovery failed or selected a bad one, fallback to hardcoded list
        if (modelToUse === ACTIVE_GEMINI_MODEL) {
            console.log('🔄 Retrying with fallback aliases...');
            const fallbacks = ['gemini-1.5-flash', 'gemini-1.0-pro'];
            for (const fb of fallbacks) {
                try {
                    return await callRest(fb);
                } catch (e) { console.warn(`Fallback ${fb} failed.`); }
            }
        }
        return null;
    }
}

// Hugging Face Inference API call
async function queryHuggingFace(messages, apiKey, language = 'es') {
    const lastMessage = messages[messages.length - 1].content;

    // Load context
    const contextDB = language === 'es' ? qaSpanish : qaEnglish;
    const contextText = contextDB.map(qa => `${qa.category}: ${qa.answer}`).slice(0, 30).join('\n');

    // System instruction
    const systemPrompt = `You are a helpful Technical Support Agent for "Richmond Learning Platform".
    Use the following CONTEXT to answer the user.
    CONTEXT:
    ${contextText}
    
    INSTRUCTIONS:
    - Answer helpfuly and concisely (<150 words).
    - If the answer is in context, use it.
    - If not, give general troubleshooting advice.
    - Answer in ${language === 'es' ? 'Spanish' : 'English'}.
    - Be professional but friendly 🚀.`;

    // Llama 3 Prompt Format
    const fullPrompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>

${lastMessage}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

    try {
        console.log('🤖 Querying Hugging Face Inference API (Phi-3)...');
        // Using Phi-3 Mini, widely available on the Router
        const response = await fetch(
            "https://router.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct",
            {
                headers: {
                    Authorization: `Bearer ${process.env.HF_API_KEY}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: fullPrompt,
                    parameters: {
                        max_new_tokens: 250,
                        temperature: 0.7,
                        return_full_text: false
                    }
                }),
            }
        );

        if (!response.ok) {
            // Silently fail to fallback
            console.warn(`⚠️ HF Router Model unavailable (${response.status}). defaulting to static help.`);
            return null;
        }

        const result = await response.json();
        // HF returns array with generated_text inside
        let generatedText = result[0].generated_text;

        // Cleanup if return_full_text didn't work as expected (sometimes happens)
        if (generatedText.includes('<|start_header_id|>assistant<|end_header_id|>')) {
            generatedText = generatedText.split('<|start_header_id|>assistant<|end_header_id|>')[1];
        }

        return generatedText.trim();

    } catch (error) {
        console.warn('⚠️ AI Logic skipped:', error.message);
        return null;
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

        // 2. Try Gemini API (Restored with Auto-Discovery)
        const apiKey = process.env.GEMINI_API_KEY || process.env.HF_API_KEY;

        if (apiKey) {
            console.log('🤖 Trying Gemini AI (Auto-Discovery Mode)...');
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
