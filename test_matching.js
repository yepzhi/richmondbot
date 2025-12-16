const fs = require('fs');

// Mock data loading
const qaSpanish = JSON.parse(fs.readFileSync('./qa-data/spanish.json', 'utf8'));
const qaEnglish = JSON.parse(fs.readFileSync('./qa-data/english.json', 'utf8'));

// Helper to normalize text (remove accents and casing)
function normalizeText(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Calculate similarity score (The logic currently in server.js)
function calculateSimilarity(text, keywords) {
    const normalizedText = normalizeText(text);
    let score = 0;

    // Debug log
    // console.log(`Comparing "${normalizedText}" against keywords:`, keywords);

    keywords.forEach(keyword => {
        const normKeyword = normalizeText(keyword);
        if (normalizedText.includes(normKeyword)) {
            // console.log(`   MATCH: "${normKeyword}" found in text`);
            score += 1;
        }
    });

    return score;
}

// Detect language
function detectLanguage(text) {
    const spanishWords = ['código', 'cómo', 'dónde', 'qué', 'cuál', 'mi', 'no', 'sí', 'ayuda', 'registro', 'hola', 'buenas'];
    const lowerText = text.toLowerCase();
    const spanishMatches = spanishWords.filter(word => lowerText.includes(word)).length;
    return spanishMatches > 0 ? 'es' : 'en';
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

    return { match: highestScore >= 1 ? bestMatch : null, score: highestScore };
}

// TEST CASES
const testPhrases = [
    "Porque no puedo accesar",
    "acess",
    "hola",
    "mi codigo no sirve"
];

console.log("--- RUNNING MANAL TESTS ---");
testPhrases.forEach(phrase => {
    const lang = detectLanguage(phrase);
    const result = findBestMatch(phrase, lang);
    console.log(`Input: "${phrase}" [${lang}]`);
    console.log(`   Score: ${result.score}`);
    console.log(`   Matched Category: ${result.match ? result.match.category : 'NONE'}`);
    console.log("---------------------------");
});
