# Doofinder Sales Copilot

Herramienta interna para que los comerciales de Doofinder guíen al cliente durante la llamada de onboarding e instalación.

## Características

- **Análisis automático de la web del cliente** — detecta plataforma (Shopify, WooCommerce, PrestaShop, Magento…), si Doofinder ya está instalado, versión del módulo, zona (eu1/us1/ap1), CSS selector del buscador, chat de soporte activo (Intercom, Zendesk, etc.), analytics y más.
- **Guía de instalación contextualizada** — pasos específicos por plataforma, con plugin oficial o script manual. Detecta automáticamente si el cliente usa GTM.
- **Checklist de verificación** — para confirmar que todo funciona antes de cerrar la llamada.
- **Asistente de troubleshooting con IA** — powered by Claude. Responde en tiempo real con pasos concretos, con el contexto del cliente ya cargado.
- **Glosario de términos** — para que el comercial pueda responder cualquier duda sin ser técnico.
- **Escalado a soporte (Intercom)** — ficha del cliente auto-rellenada, lista para copiar y pegar en Intercom.

## Instalación

### 1. Clonar y preparar

```bash
cd doofinder-copilot
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y añade tu API key de Anthropic:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

Consigue tu API key en: https://console.anthropic.com/

### 3. Arrancar el servidor

```bash
npm start
```

Abre http://localhost:3000

## Uso

1. **Introduce la URL de la web del cliente** en la barra superior y haz clic en "Analizar web". La herramienta detecta automáticamente la plataforma, si Doofinder está instalado, el CSS selector y las integraciones activas.

2. **Selecciona la plataforma** (manual o confirmando la detectada) para ver la guía de instalación paso a paso.

3. **Sigue la guía de instalación** con el cliente durante la llamada. Los pasos son específicos para cada plataforma.

4. **Verifica el funcionamiento** con la checklist antes de dar la llamada por terminada.

5. Si hay un problema, usa el **Asistente de Troubleshooting** — escribe el problema en lenguaje natural y Claude te da pasos concretos con el contexto del cliente ya cargado.

6. Si nada funciona, ve a **Escalar a soporte** — la ficha del cliente ya estará auto-rellenada con los datos detectados. Copia la info y pégala en Intercom.

## Estructura del proyecto

```
doofinder-copilot/
├── server.js              # Servidor Express
├── routes/
│   ├── analyze.js         # Análisis de webs (scraping + detección)
│   └── chat.js            # Proxy de la API de Anthropic
├── public/
│   └── index.html         # Frontend (SPA completa)
├── .env                   # Variables de entorno (no subir a git)
├── .env.example           # Plantilla de configuración
└── package.json
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | API key de Anthropic (obligatorio) |
| `PORT` | Puerto del servidor (por defecto: 3000) |

## Plataformas soportadas para análisis automático

Con plugin oficial: Shopify, WooCommerce, PrestaShop, Magento, BigCommerce, Shopware, VTEX, JTL

Script manual: WordPress, Wix, Squarespace, OpenCart, Drupal, cualquier plataforma custom

## Herramientas de soporte detectadas automáticamente

Intercom, Zendesk, Freshchat, Tidio, LiveChat, Crisp, HubSpot Chat, Tawk.to

## Notas de seguridad

- La API key nunca se expone al frontend; todas las llamadas a la API de Anthropic pasan por el backend.
- El análisis de webs hace una request GET pública (como haría cualquier navegador).
- No se guarda ningún dato de las sesiones.
