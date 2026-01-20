const translations = {
    es: {
        header: {
            subtitle: "Support Assistant",
            restart: "🏠 Reiniciar Chat"
        },
        welcome: {
            title: "Richmond Chatbot<br>University Support 🚀",
            subtitle: "¿Cómo puedo ayudarte hoy?",
            note: "🌐 Este chatbot es bilingüe (Español/English)"
        },
        chips: {
            code_error: "Mi código ya está utilizado, no es válido",
            login_error: "No puedo entrar a la plataforma",
            task_error: "No puedo hacer una tarea",
            material_missing: "Mi material ya no está",
            buy_book: "¿No me aparece la tarea en mi plataforma?",
            buy_license: "¿Dónde compro mi libro ó licencia?",
            check_token: "Check Token / Validar Código"
        },
        faq: {
            btn: "Preguntas Frecuentes (FAQ)",
            cat_registro: "📝 Registro",
            cat_acceso: "🔐 Acceso",
            cat_tareas: "📚 Tareas y Materiales",
            cat_productos: "📖 Productos y Clases",
            cat_perfil: "👤 Perfil",
            cat_app: "📱 App y Soporte",
            cat_tecnico: "⚙️ Técnico",

            // FAQ Items
            q_code_find: "¿Dónde encuentro mi código de acceso?",
            q_register: "¿Cómo me registro en la plataforma?",
            q_code_used: "Mi código dice que ya fue usado",
            q_email_exists: "Dice que mi email ya existe",
            q_login: "¿Cómo inicio sesión?",
            q_forgot_user: "Olvidé mi nombre de usuario",
            q_see_tasks: "¿Dónde veo mis tareas?",
            q_materials: "¿Dónde están mis materiales?",
            q_study: "¿Cómo estudio por mi cuenta?",
            q_wrong_answer: "¿Por qué mi respuesta correcta marca error?",
            q_grades: "¿Dónde veo mis calificaciones?",
            q_notifications: "¿Dónde veo mis notificaciones?",
            q_activate_prod: "¿Cómo activo un nuevo producto?",
            q_join_class: "¿Cómo me uno a una clase?",
            q_wrong_class: "Estoy en la clase incorrecta",
            q_sub_valid: "¿Hasta cuándo es válida mi suscripción?",
            q_data_wrong: "Mis datos personales están mal",
            q_change_email: "¿Cómo puedo cambiar mi email?",
            q_app: "¿Hay una aplicación móvil?",
            q_support: "¿Cómo contacto a soporte?",
            q_submit_error: "No puedo hacer clic en Submit",
            q_msg_teacher: "¿Cómo le envío mensaje a mi profesor?",
            q_browser: "¿Qué navegador debo usar?",
            q_content_open: "Mi libro o contenido no abre",
            q_audio: "No puedo escuchar el audio",
            q_slow: "La plataforma está lenta o no carga"
        },
        input: {
            placeholder: "Escribe tu mensaje..."
        }
    },
    en: {
        header: {
            subtitle: "Support Assistant",
            restart: "🏠 Restart Chat"
        },
        welcome: {
            title: "Richmond Chatbot<br>University Support 🚀",
            subtitle: "How can I help you today?",
            note: "🌐 This chatbot is bilingual (Spanish/English)"
        },
        chips: {
            code_error: "My code is already used / invalid",
            login_error: "I cannot log in to the platform",
            task_error: "I cannot do a task",
            material_missing: "My material is missing",
            buy_book: "I can't see the homework in my platform?",
            buy_license: "Where do I buy my book or license?",
            check_token: "Check Token / Validate Code"
        },
        faq: {
            btn: "Frequently Asked Questions (FAQ)",
            cat_registro: "📝 Registration",
            cat_acceso: "🔐 Access",
            cat_tareas: "📚 Homework & Materials",
            cat_productos: "📖 Products & Classes",
            cat_perfil: "👤 Profile",
            cat_app: "📱 App & Support",
            cat_tecnico: "⚙️ Technical",

            // FAQ Items
            q_code_find: "Where do I find my access code?",
            q_register: "How do I register on the platform?",
            q_code_used: "My code says it has already been used",
            q_email_exists: "It says my email already exists",
            q_login: "How do I log in?",
            q_forgot_user: "I forgot my username",
            q_see_tasks: "Where do I see my assignments?",
            q_materials: "Where are my materials?",
            q_study: "How do I self-study?",
            q_wrong_answer: "Why is my correct answer marked wrong?",
            q_grades: "Where do I see my grades?",
            q_notifications: "Where do I see my notifications?",
            q_activate_prod: "How do I activate a new product?",
            q_join_class: "How do I join a class?",
            q_wrong_class: "I am in the wrong class",
            q_sub_valid: "How long is my subscription valid?",
            q_data_wrong: "My personal details are incorrect",
            q_change_email: "How can I change my email?",
            q_app: "Is there a mobile app?",
            q_support: "How do I contact support?",
            q_submit_error: "I cannot click Submit",
            q_msg_teacher: "How do I message my teacher?",
            q_browser: "Which browser should I use?",
            q_content_open: "My book or content won't open",
            q_audio: "I cannot hear the audio",
            q_slow: "The platform is slow or not loading"
        },
        input: {
            placeholder: "Type your message..."
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const langBtn = document.getElementById('langToggle');
    // Default to Spanish
    let currentLang = localStorage.getItem('richmond_bot_lang') || 'es';

    function updateLanguage(lang) {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const keys = key.split('.');
            let text = translations[lang];

            keys.forEach(k => {
                if (text) text = text[k];
            });

            if (text) {
                // Determine if we should set innerHTML or placeholder or other attributes
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    if (element.hasAttribute('placeholder')) {
                        element.placeholder = text;
                    }
                } else if (element.classList.contains('faq-list-item')) {
                    // For FAQ items, we need to update the onclick text as well
                    element.innerHTML = text;
                    // Update the onclick attribute to send the new text
                    element.setAttribute('onclick', `sendFAQQuestion('${text.replace(/'/g, "\\'")}')`);
                } else {
                    element.innerHTML = text;
                }
            }
        });

        // Update Button State - Show what will happen NEXT
        if (langBtn) {
            if (lang === 'es') {
                // Switch to English
                langBtn.innerHTML = '<span class="lang-flag">🇺🇸</span><span class="lang-text" style="font-weight:700; font-size:12px; margin-left:4px;">ENG</span>';
                langBtn.title = "Switch to English";
            } else {
                // Switch to Spanish
                langBtn.innerHTML = '<span class="lang-flag">🇲🇽</span><span class="lang-text" style="font-weight:700; font-size:12px; margin-left:4px;">ESP</span>';
                langBtn.title = "Cambiar a Español";
            }
        }

        localStorage.setItem('richmond_bot_lang', lang);
        currentLang = lang;

        // Dispatch a custom event in case other scripts need to know
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    }

    // Initial load
    updateLanguage(currentLang);

    // Event Listener
    if (langBtn) {
        langBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const newLang = currentLang === 'es' ? 'en' : 'es';
            updateLanguage(newLang);
        });
    }

    // Global access if needed
    window.updateLanguage = updateLanguage;
});
