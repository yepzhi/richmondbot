---
title: Richmondbot
emoji: 🤖
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# Richmond Bot 🤖

Un chatbot de soporte inteligente para Richmond Learning Platform con sistema híbrido de respuestas.

## 🌟 Características

- 🌐 **Bilingüe**: Responde en Español e Inglés automáticamente
- 🚀 **Sistema Híbrido**: Offline Q&A + Hugging Face API
- 📱 **Responsive**: Funciona en móvil, tablet y desktop
- 🔄 **Restart Chat**: Botón para reiniciar la conversación
- ⚡ **Rápido**: Respuestas instantáneas con Q&A offline

## 🛠️ Setup

### Variables de Entorno

- `HF_API_KEY` (Opcional): Tu Hugging Face API Key para respuestas con IA
  - Obtén una GRATIS en: https://huggingface.co/settings/tokens
  - Sin API key, el bot usa solo Q&A offline

### Instalación Local

```bash
npm install
node server.js
```

Abre http://localhost:7860

## 📝 Actualizar Preguntas y Respuestas

Las preguntas y respuestas están en:
- **Español**: `qa-data/spanish.json`
- **Inglés**: `qa-data/english.json`

### Formato para agregar nueva pregunta:

```json
{
  "keywords": ["palabra", "clave"],
  "question": "¿Pregunta?",
  "answer": "Respuesta clara y concisa.",
  "links": ["https://link.com"],
  "category": "categoria"
}
```

## 🚀 Deployment en Hugging Face Spaces

Este bot está diseñado para correr en Hugging Face Spaces usando Docker.

1. Configura el secret `HF_API_KEY` en Settings (opcional)
2. El Space se actualiza automáticamente desde GitHub

## 👨‍💻 Desarrollado por

[@yepzhi](https://github.com/yepzhi)
