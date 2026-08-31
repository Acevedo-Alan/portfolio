/*
 * i18n.js
 * Spanish/English copy dictionary for the portfolio, keyed by the
 * data-i18n / data-i18n-list attributes in index.html. Consumed by
 * setLang() in main.js. Exposes a single global: `i18n`.
 *
 * The `theme-to-*` / `lang-*-label` / `skip-link` keys are accessibility-
 * only strings (aria-label / title / skip-link text) — they were added
 * during the a11y pass so the theme toggle's and language toggle's
 * accessible names update correctly when the visitor switches language.
 * They introduce no visible copy change.
 */
const i18n = {
  es: {
    "meta-location-label": "ubicación",
    role: "Full Stack Developer — Java/Spring · React",
    bio: "Estudiante avanzado de Técnico en Desarrollo de Software (3.º año, IES Santa Fe). Desarrollo aplicaciones full stack cubriendo frontend, backend y bases de datos — desde un sistema de certificaciones digitales para el Poder Judicial de Santa Fe hasta <strong>HEXA</strong>, una PWA multijugador en tiempo real diseñada y construida en solitario.",
    "rdam-title": "Sistema de Gestión y Emisión de Certificados Digitales",
    "rdam-tag": "finalista campus 2026",
    "rdam-bullets": [
      "Desarrollo end-to-end seleccionado como <strong>finalista en Campus 2026</strong>, con defensa técnica y demostración funcional ante el cliente.",
      "Backend con autenticación dual JWT + OTP por email (2FA) vía Spring Security 6, y <strong>Row-Level Security</strong> en PostgreSQL para aislamiento de datos por rol y circunscripción judicial.",
      "<strong>FSM</strong> para el ciclo de solicitudes (PENDIENTE → EN_REVISIÓN → APROBADA → PAGADA → EMITIDA) y despliegue con Docker Compose en un solo comando."
    ],
    "domus-title": "Plataforma de Gestión de Salud Familiar",
    "domus-tag": "en desarrollo",
    "domus-org": "Capstone grupal · IES Santa Fe",
    "domus-bullets": [
      "Frontend Developer / UX Designer en app mobile (React Native) para centralizar la <strong>salud familiar del grupo</strong>, con recordatorios e historial médico compartido.",
      "Diseño UX con mockups en Figma; gestión ágil con Jira y Scrum en equipo de tres desarrolladores."
    ],
    "clinica-title": "Sistema de Gestión de Turnos Médicos",
    "clinica-tag": "backend grupal",
    "clinica-org": "Proyecto universitario · IES Santa Fe",
    "clinica-bullets": [
      "Backend en Node.js/Express + MySQL para un <strong>sistema de gestión de turnos médicos</strong>, con autenticación JWT.",
      "Responsable del módulo de coberturas y agenda médica dentro de un equipo de dos desarrolladores."
    ],
    "hexa-desc": "PWA multijugador en tiempo real: los jugadores fotografían objetos de su entorno que coincidan con un color objetivo, con sincronización en vivo entre todos los participantes de una sala.",
    "hexa-bullets": [
      "Arquitectura de tiempo real con <strong>Server-Sent Events</strong> como única fuente de verdad: cada cliente —incluyendo espectadores— permanece consistente con el estado autoritativo del servidor, sin infraestructura WebSocket.",
      "Sesiones firmadas con <strong>HMAC-SHA256</strong> y verificación en tiempo constante, resolviendo la restricción de que EventSource no admite headers de autenticación personalizados.",
      "Pipeline de fotos offline-first (cola en <strong>IndexedDB</strong> + UI optimista) resiliente a conexiones inestables.",
      "Sistema de diseño visual propio (retro 'System 6', SVG a mano, tipografía bitmap) sin dependencias de UI."
    ],
    "lana-desc": "E-commerce SPA en JavaScript vanilla con estética Frutiger Aero (glassmorphism, gradientes aqua). Carruseles, búsqueda en tiempo real, tilt 3D en las cards y detector de marca de tarjeta de crédito.",
    "edu-degree": "Técnico Superior en Desarrollo de Software",
    "edu-year": "Inicio 2024",
    "edu-status": "en curso · 3.º año",
    footer: "portfolio.html · sin dependencias de build",
    "footer-made": "Hecho con",
    "skip-link": "Saltar al contenido principal",
    "theme-to-light": "Cambiar a tema claro",
    "theme-to-dark": "Cambiar a tema oscuro",
    "lang-es-label": "Cambiar a español",
    "lang-en-label": "Cambiar a inglés",
    "box-whoami": "sobre mí",
    "box-whoami-subtitle": "Full Stack Developer",
    "box-stack": "stack",
    "box-stack-subtitle": "Tecnologías y herramientas",
    "box-experiencia": "experiencia",
    "box-experiencia-subtitle": "Historial profesional",
    "box-proyectos": "proyectos",
    "box-proyectos-subtitle": "Trabajos seleccionados",
    "box-educacion": "educación",
    "box-educacion-subtitle": "Formación académica",
    "box-contacto": "contacto",
    "box-contacto-subtitle": "Cómo contactarme",
    "box-console": "terminal interactiva",
    "box-console-subtitle": "Comandos disponibles",
    "term-input-label": "Entrada de comandos de la terminal",
    "term-log-label": "Salida de la terminal",
    "term-welcome": "Escribí <span class=\"cmd-hl\">help</span> para ver los comandos disponibles.",
    "term-help": [
      "help — muestra esta lista de comandos",
      "whoami — ir a la sección Sobre mí",
      "stack — ir a la sección Stack",
      "experiencia — ir a la sección Experiencia",
      "proyectos — ir a la sección Proyectos",
      "educacion — ir a la sección Educación",
      "contacto — ir a la sección Contacto",
      "clear — limpiar la terminal",
      "lang es|en — cambiar el idioma",
      "theme dark|light — cambiar el tema",
      "email — enviarme un correo"
    ],
    "term-goto": "→ desplazando a #%s",
    "term-lang-set": "Idioma cambiado a %s.",
    "term-lang-usage": "uso: lang es|en",
    "term-theme-set": "Tema cambiado a %s.",
    "term-theme-usage": "uso: theme dark|light",
    "term-email-opening": "Abriendo tu cliente de correo hacia acevedo.j.alan@gmail.com…",
    "term-sudo": "Bonito intento. Este usuario no tiene privilegios de root. 😏",
    "term-not-found": "command not found: %s — escribí <span class=\"cmd-hl\">help</span> para ver los comandos disponibles."
  },
  en: {
    "meta-location-label": "location",
    role: "Full Stack Developer — Java/Spring · React",
    bio: "Advanced student pursuing a Software Development degree (3rd year, IES Santa Fe). I build full stack applications across frontend, backend and databases — from a digital certification system for the Santa Fe Judiciary to <strong>HEXA</strong>, a real-time multiplayer PWA designed and built solo.",
    "rdam-title": "Digital Certificate Management & Issuance System",
    "rdam-tag": "campus 2026 finalist",
    "rdam-bullets": [
      "End-to-end development selected as a <strong>finalist in Campus 2026</strong>, with a technical defense and live demo for the client.",
      "Backend with dual JWT + email OTP authentication (2FA) via Spring Security 6, and <strong>Row-Level Security</strong> in PostgreSQL for per-role, per-jurisdiction data isolation.",
      "<strong>State machine</strong> for the request lifecycle (PENDING → UNDER_REVIEW → APPROVED → PAID → ISSUED) and one-command Docker Compose deployment."
    ],
    "domus-title": "Family Health Management Platform",
    "domus-tag": "in progress",
    "domus-org": "Group capstone · IES Santa Fe",
    "domus-bullets": [
      "Frontend Developer / UX Designer on a React Native mobile app centralizing the <strong>family's health data</strong>, with reminders and shared medical history.",
      "UX design with Figma mockups; agile management with Jira and Scrum across a three-developer team."
    ],
    "clinica-title": "Medical Appointment Management System",
    "clinica-tag": "group backend",
    "clinica-org": "University project · IES Santa Fe",
    "clinica-bullets": [
      "Node.js/Express + MySQL backend for a <strong>medical appointment management system</strong>, with JWT authentication.",
      "Owned the coverage plans and doctor scheduling module within a two-developer team."
    ],
    "hexa-desc": "Real-time multiplayer PWA: players photograph real-world objects matching a target color, synced live across every participant in a room.",
    "hexa-bullets": [
      "Real-time architecture using <strong>Server-Sent Events</strong> as the single source of truth: every client — including spectators — stays consistent with the server's authoritative state, with zero WebSocket infrastructure.",
      "<strong>HMAC-SHA256</strong> signed sessions with constant-time verification, solving for EventSource's inability to carry custom auth headers.",
      "Offline-first photo pipeline (<strong>IndexedDB</strong> queue + optimistic UI) resilient to unstable connectivity.",
      "Custom visual design system (retro 'System 6', hand-drawn SVG, bitmap type) with zero UI library dependencies."
    ],
    "lana-desc": "Vanilla JavaScript e-commerce SPA with a Frutiger Aero aesthetic (glassmorphism, aqua gradients). Carousels, real-time search, 3D card tilt and a credit-card brand detector.",
    "edu-degree": "Associate Degree in Software Development",
    "edu-year": "Started 2024",
    "edu-status": "in progress · 3rd year",
    footer: "portfolio.html · zero build dependencies",
    "footer-made": "Made with",
    "skip-link": "Skip to main content",
    "theme-to-light": "Switch to light theme",
    "theme-to-dark": "Switch to dark theme",
    "lang-es-label": "Switch to Spanish",
    "lang-en-label": "Switch to English",
    "box-whoami": "about me",
    "box-whoami-subtitle": "Full Stack Developer",
    "box-stack": "stack",
    "box-stack-subtitle": "Technologies & tools",
    "box-experiencia": "experience",
    "box-experiencia-subtitle": "Professional history",
    "box-proyectos": "projects",
    "box-proyectos-subtitle": "Selected work",
    "box-educacion": "education",
    "box-educacion-subtitle": "Academic background",
    "box-contacto": "contact",
    "box-contacto-subtitle": "How to reach me",
    "box-console": "interactive terminal",
    "box-console-subtitle": "Available commands",
    "term-input-label": "Terminal command input",
    "term-log-label": "Terminal output",
    "term-welcome": "Type <span class=\"cmd-hl\">help</span> to see the available commands.",
    "term-help": [
      "help — list available commands",
      "whoami — go to the About me section",
      "stack — go to the Stack section",
      "experiencia — go to the Experience section",
      "proyectos — go to the Projects section",
      "educacion — go to the Education section",
      "contacto — go to the Contact section",
      "clear — clear the terminal",
      "lang es|en — switch the language",
      "theme dark|light — switch the theme",
      "email — send me an email"
    ],
    "term-goto": "→ scrolling to #%s",
    "term-lang-set": "Language switched to %s.",
    "term-lang-usage": "usage: lang es|en",
    "term-theme-set": "Theme switched to %s.",
    "term-theme-usage": "usage: theme dark|light",
    "term-email-opening": "Opening your mail client to acevedo.j.alan@gmail.com…",
    "term-sudo": "Nice try. This user has no root privileges. 😏",
    "term-not-found": "command not found: %s — type <span class=\"cmd-hl\">help</span> to see the available commands."
  }
};