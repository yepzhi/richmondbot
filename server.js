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

// Global list of discovered working models
let AVAILABLE_GEMINI_MODELS = [];

// Function to discover ALL available Gemini models on startup
async function discoverGeminiModels(apiKey) {
    if (!apiKey) return;
    try {
        console.log('🔍 Discovering available Gemini models...');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (!data.models) {
            console.error('❌ No models found in discovery response:', data);
            return;
        }

        // Filter valid models that support generateContent
        // Prioritize 'flash' and 'pro' models, avoid 'vision' only models if possible
        const validModels = data.models
            .filter(m => m.name.includes('gemini') && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.split('/').pop()); // Store short names

        if (validModels.length > 0) {
            // Sort to prioritize stable models (heuristically)
            AVAILABLE_GEMINI_MODELS = validModels.sort((a, b) => {
                // Prefer 'flash' (fast), then 'pro'
                if (a.includes('flash') && !b.includes('flash')) return -1;
                if (b.includes('flash') && !a.includes('flash')) return 1;
                return 0;
            });
            console.log(`✅ Auto-discovered Gemini Models: ${AVAILABLE_GEMINI_MODELS.join(', ')}`);
        } else {
            console.warn('⚠️ No suitable Gemini chat model found available for this Key.');
        }
    } catch (error) {
        console.error('❌ Model discovery failed:', error.message);
    }
}

// Call discovery on load if Key exists
if (process.env.GEMINI_API_KEY) {
    discoverGeminiModels(process.env.GEMINI_API_KEY);
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

// Google Gemini API call (REST) with Chain Fallback + RAG + History
async function queryGemini(messages, apiKey, language = 'es', relevantContext = null) {
    // If discovery hasn't finished or found nothing, fallback to hardcoded list
    const candidates = AVAILABLE_GEMINI_MODELS.length > 0
        ? AVAILABLE_GEMINI_MODELS
        : ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];

    // Construct Contextual Prompt (RAG)
    // 1. Base identity (Richmond Persona)
    let systemInstruction = `Role: "Richmond Learning Platform Helper" (Educational Partner).
    Personality: Warm, Encouraging, Patient, and Expert 🎓.
    Tone: Conversational and human-like. Avoid being robotic. Use emojis naturally.
    Objective: Guide the student/teacher to the solution while making them feel supported.
    Language: ${language}.
    Constraint: Keep answers concise but friendly (<150 words).`;

    // 2. Add Database Knowledge (Dynamic RAG)
    if (relevantContext) {
        systemInstruction += `\n\nCRITICAL INFO FOUND IN DATABASE:
        User's specific issue matches this official solution: "${relevantContext.answer}".
        
        INSTRUCTION: Use the above "Official Solution" to answer the user, but adapt it to the conversation flow. Do not just copy-paste if it feels robotic.`;
    } else {
        // Fallback context from top FAQs if no specific match
        const contextDB = language === 'es' ? qaSpanish : qaEnglish;
        const generalContext = contextDB.slice(0, 10).map(qa => `${qa.category}: ${qa.answer}`).join(' | ');
        systemInstruction += `\n\nGeneral Knowledge Base: ${generalContext}`;
    }

    // 3. Build Chat History for Prompt
    // API v1beta uses 'contents' array with 'role': 'user'/'model'
    const contents = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    // Prepend System Instruction? Gemini v1beta usually prefers system instruction in the API field or first user message.
    // Let's prepend it to the first message or use system_instruction field if using SDK.
    // REST API supports 'systemInstruction' field in newer models, but purely prompting is safer for compatibility.
    // We will inject it into the very first turn or as a separate system-like user prompt.
    // Strategy: Add a "developer" role message first? No, Gemini supports 'user' and 'model'.
    // Best practice for simple REST: Prepend to first user message.
    if (contents.length > 0) {
        contents[0].parts[0].text = `[SYSTEM INSTRUCTION: ${systemInstruction}]\n\n` + contents[0].parts[0].text;
    }

    async function callRest(modelName) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: contents })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`HTTP ${response.status}: ${err}`);
        }

        const data = await response.json();
        if (!data.candidates || !data.candidates[0]) throw new Error('No candidates returned');
        return data.candidates[0].content.parts[0].text;
    }

    // Try models one by one
    for (const model of candidates) {
        try {
            console.log(`🤖 Trying Gemini Model: ${model}...`);
            const ans = await callRest(model);
            console.log(`✅ Success with ${model}`);
            return ans;
        } catch (error) {
            console.warn(`⚠️ Model ${model} failed: ${error.message.split('\n')[0]}`);
        }
    }


    console.error("❌ All available Gemini models failed.");
    return null;
}

// Token Checker Module Removed (External Tool Used)
// const TokenChecker = require('./token_checker'); // Removed
// const tokenChecker = new TokenChecker(); // Removed

// Chat endpoint (Refactored for RAG + Token Check)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || messages.length === 0) return res.status(400).json({ error: 'No messages' });

        const lastMessage = messages[messages.length - 1].content;
        const language = detectLanguage(lastMessage);

        console.log(`📝 User message(${language}): ${lastMessage.substring(0, 50)}...`);

        // 0. TOKEN CHECKER INTENT
        // "Validar token POTATO"
        const tokenIntentRegex = /validar|check|revisar|checar/i;

        if (tokenIntentRegex.test(lastMessage) && (lastMessage.includes('token') || lastMessage.includes('code') || lastMessage.includes('código'))) {
            // Just return a static response pointing to external tool
            const fallbackUrl = "https://huggingface.co/spaces/yepzhi/richmond-token-check";
            const responseText = language === 'es'
                ? `⚠️ ** Validación Automática Deshabilitada **\n\nPor seguridad, la validación de tokens se realiza en una herramienta dedicada.\n\n🔗 ** [Abrir Validador de Tokens](${fallbackUrl}) ** `
                : `⚠️ ** Please use the dedicated tool **\n\nFor security reasons, token validation has been moved.\n\n🔗 ** [Open Token Checker](${fallbackUrl}) ** `;

            return res.json({ content: [{ text: responseText }], source: 'token-link' });
        }

        // 1. Check Offline Knowledge Base (RAG Source)
        const offlineMatch = findBestMatch(lastMessage, language);
        let relevantKnowledge = null;

        if (offlineMatch) {
            console.log(`💡 RAG Context found: ${offlineMatch.question} `);
            relevantKnowledge = offlineMatch;
        }

        // 2. Call AI with Context (Primary Response)
        const apiKey = process.env.GEMINI_API_KEY || process.env.HF_API_KEY;

        if (apiKey) {
            console.log('🤖 Invoking AI with RAG Context...');

            // Call Gemini/AI with the offline context if found
            const aiResponse = await queryGemini(messages, apiKey, language, relevantKnowledge);

            if (aiResponse) {
                console.log('✅ AI response delivered');
                const finalResponse = aiResponse;
                return res.json({ content: [{ text: finalResponse }], source: 'gemini' });
            }
        } else {
            console.log('❌ No API Key found.');
        }

        // 3. Fallback: If AI failed but we had an offline match, use it raw
        if (offlineMatch) {
            console.log('⚠️ AI Failed, using Offline Match raw.');
            const response = offlineMatch.answer + formatLinks(offlineMatch.links);
            return res.json({ content: [{ text: response }], source: 'offline-fallback' });
        }

        // 4. Ultimate Fallback
        console.log('⚠️ No AI and No Offline match.');
        const fallbackMessage = language === 'es'
            ? 'Lo siento, mis servidores están ocupados y no encontré información sobre eso. Por favor contacta a soporte en 📧 rlp-ug.knowledgeowl.com/help'
            : 'Sorry, I usually know that, but my brain is tired. Please contact support at 📧 rlp-ug.knowledgeowl.com/help';

        res.json({ content: [{ text: fallbackMessage }], source: 'fallback' });

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
    console.log(`🚀 Server running on port ${PORT} `);
    console.log(`📊 Q & A Database: ${qaSpanish.length} ES + ${qaEnglish.length} EN`);
});
