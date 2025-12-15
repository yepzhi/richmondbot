const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
// HARDCODED PORT 7860 to absolutely ensure HF compatibility
const PORT = 7860;

// ... existing code ...


// ... existing code ...


// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files from current directory
app.use(express.static('.'));

const systemPrompt = `Eres un asistente de soporte para Richmond Learning Platform (RLP). Debes responder en ESPAÑOL si la pregunta está en español, o en INGLÉS si está en inglés. Sé conciso, amable y útil.

INFORMACIÓN CLAVE SOBRE RICHMOND LEARNING PLATFORM:

1. CÓDIGOS DE ACCESO (Access Code/Token):
- Es un código alfanumérico de 12-20 caracteres (ej: RP4E5F678923 o XX00-0X0X-00XX-0XX0)
- Se encuentra en la portada interna del libro Richmond o en una tarjeta incluida
- También puede venir en CD-ROM o por email si es producto digital
- Se necesita para registrarse en richmondlp.com/register
- Si un estudiante no encuentra su código, debe preguntar a su profesor
- Los profesores obtienen códigos contactando a su representante Richmond local

2. REGISTRO Y ACCESO:
- Registro en: www.richmondlp.com/register
- Login en: www.richmondlp.com
- Proceso: Ingresar Access Code → Llenar datos personales → Ingresar Class Code (opcional) → Confirmar email
- Si no llega el email de confirmación: revisar spam o usar "Resend confirmation email"
- Si olvidó contraseña: usar opción "Forgotten password" en el login
- Algunos estudiantes pueden tener cuenta creada por su institución (verificar con profesor)

3. PROBLEMAS COMUNES DE ACCESO:
- "Este código ya fue usado": El Access Code solo se puede usar una vez
- "Este email ya existe": Ya hay una cuenta con ese correo, recuperar contraseña
- "No puedo hacer clic en Submit": Verificar conexión a internet, actualizar navegador, o contactar soporte
- Problemas de login: Verificar usuario/contraseña, limpiar caché del navegador

4. TAREAS Y MATERIALES:
- Las tareas aparecen en "My Assignments" o "My tasks"
- Los materiales se ven en "Class Materials" o "My study materials"
- Si no aparecen materiales: verificar que el producto esté activado en "My Products"
- Si falta material: puede ser que la suscripción haya expirado o el profesor lo haya ocultado
- Para agregar nuevo producto: ir a "My Products" → "Add Access Code"

5. VALIDEZ DE SUSCRIPCIÓN:
- La duración depende del producto comprado
- Verificar en "My Products" la fecha de expiración
- Si expiró, necesita comprar nueva licencia

6. COMPRA DE LIBROS Y LICENCIAS:
- Los libros físicos se compran en librerías locales (El Sótano, Gandhi, Mercado Libre, etc.)
- Las licencias digitales se compran a través de:
  * La institución educativa (verificar con profesor/administrador)
  * Representante Richmond local en tu país
  * Sitio web: richmond.com.mx (contactar oficina de ventas local)
- Cada libro físico incluye un Access Code para la plataforma digital

7. APP MÓVIL:
- App: RLP+ (disponible en iOS y Android)
- Descargar de App Store o Google Play
- Usar mismo usuario/contraseña de la versión web
- Permite descargar contenido para usar offline

8. SOPORTE:
- Centro de ayuda: rlp-ug.knowledgeowl.com/help
- Contacto: a través de richmond.com.mx
- También puede contactar a su profesor o administrador de la institución

Cuando respondas:
- Si la pregunta es sobre código: menciona [LINK:registro] y [LINK:ayuda]
- Si es sobre login/acceso: menciona [LINK:login] y [LINK:ayuda]
- Si es sobre materiales: menciona [LINK:productos] y [LINK:ayuda]
- Si es sobre compra: menciona [LINK:contacto]
- Si necesita app: menciona [LINK:app]
- Ofrece siempre contactar soporte si el problema persiste

Mantén respuestas bajo 150 palabras. Responde en el mismo idioma de la pregunta.`;

// Initialize Gemini Client
// Note: Client expects GEMINI_API_KEY in env or passed to constructor.
// Using getGenerativeModel with systemInstruction.

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, apiKey: clientApiKey } = req.body;

        // Prioritize server-side env key, allow client-side key for testing/demo if server key missing
        const apiKey = process.env.GEMINI_API_KEY || clientApiKey;

        if (!apiKey) {
            console.error("Missing GEMINI_API_KEY");
            return res.status(500).json({ error: 'Server misconfiguration: No API Key' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemPrompt
        });

        // Convert messages to Gemini format (user vs model)
        // Frontend sends: [{role: "user", content: "hi"}, {role: "assistant", content: "hello"}]
        // Gemini expects: [{role: "user", parts: [{text: "hi"}]}, {role: "model", parts: [{text: "hello"}]}]

        const history = (messages || []).slice(0, -1).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'user') {
            return res.status(400).json({ error: 'Invalid message format: Last message must be from user' });
        }

        const chat = model.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 1000,
            },
        });

        const result = await chat.sendMessage(lastMessage.content);
        const response = await result.response;
        const text = response.text();

        // mimic anthropic response structure to minimize frontend breakage, or just send text
        // Let's send a standard format
        res.json({
            content: [{ text: text }]
        });

    } catch (error) {
        console.error('Server Error:', error);

        // Check for specific Gemini/Google errors
        if (error.message && error.message.includes('429')) {
            return res.status(429).json({ error: 'Too Many Requests' });
        }
        if (error.message && error.message.includes('503')) {
            return res.status(503).json({ error: 'Service Unavailable' });
        }

        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Health Check Endpoint (Critical for HF Spaces)
app.get('/', (req, res) => {
    res.status(200).send('RichmondBot Backend is Active 🟢');
});




// ... existing code ...

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} at 0.0.0.0`);
});
