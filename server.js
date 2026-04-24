require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ──────────────────────────────────────────────
// Platform detection signatures
// ──────────────────────────────────────────────
const PLATFORM_SIGNATURES = [
  {
    name: 'Shopify',
    type: 'plugin',
    version_url: (domain) => `${domain}/admin`, // needs auth, so we use meta
    checks: [
      { type: 'meta', name: 'shopify-checkout-api-token' },
      { type: 'meta', property: 'og:site_name', hint: 'shopify' },
      { type: 'script_src', pattern: /cdn\.shopify\.com/i },
      { type: 'script_src', pattern: /shopify\.com\/s\/files/i },
      { type: 'html', pattern: /Shopify\.shop|window\.Shopify/i },
      { type: 'html', pattern: /cdn\.shopify\.com/i },
      { type: 'link_href', pattern: /cdn\.shopify\.com/i },
    ],
    logo: '🛍',
    doofinder_plugin: 'https://apps.shopify.com/doofinder',
    doofinder_docs: 'https://support.doofinder.com/plugins/shopify/installation-guide/pre-requisites-shopify',
  },
  {
    name: 'WooCommerce',
    type: 'plugin',
    checks: [
      { type: 'html', pattern: /woocommerce/i },
      { type: 'html', pattern: /wp-content\/plugins\/woocommerce/i },
      { type: 'script_src', pattern: /woocommerce/i },
      { type: 'link_href', pattern: /woocommerce/i },
      { type: 'html', pattern: /wc-cart|wc_add_to_cart/i },
    ],
    logo: '🔌',
    doofinder_plugin: 'https://wordpress.org/plugins/doofinder-for-woocommerce/',
    doofinder_docs: 'https://support.doofinder.com/plugins/woocommerce/installation-guide/pre-requisites-woocommerce',
  },
  {
    name: 'WordPress',
    type: 'script',
    checks: [
      { type: 'html', pattern: /wp-content\/themes|wp-includes/i },
      { type: 'html', pattern: /wordpress/i },
      { type: 'meta', name: 'generator', hint: 'wordpress' },
    ],
    logo: '📝',
    doofinder_plugin: null,
    doofinder_docs: 'https://support.doofinder.com/getting-started/installing-doofinder',
  },
  {
    name: 'PrestaShop',
    type: 'plugin',
    checks: [
      { type: 'html', pattern: /prestashop/i },
      { type: 'script_src', pattern: /prestashop/i },
      { type: 'link_href', pattern: /prestashop/i },
      { type: 'html', pattern: /id_lang|id_currency/i },
      { type: 'html', pattern: /prestashop\.com/i },
    ],
    logo: '🐙',
    doofinder_plugin: 'https://addons.prestashop.com/es/busqueda-filtros/45820-doofinder-search-discovery.html',
    doofinder_docs: 'https://support.doofinder.com/plugins/prestashop/installation-guide/pre-requisites-prestashop',
  },
  {
    name: 'Magento',
    type: 'plugin',
    checks: [
      { type: 'html', pattern: /Mage\.|magento/i },
      { type: 'script_src', pattern: /mage\/|magento/i },
      { type: 'html', pattern: /skin\/frontend|js\/mage/i },
      { type: 'html', pattern: /requirejs\/require\.js.*mage/i },
    ],
    logo: '🔶',
    doofinder_plugin: 'https://marketplace.magento.com/',
    doofinder_docs: 'https://support.doofinder.com/plugins/magento/installation-guide/pre-requisites-magento',
  },
  {
    name: 'BigCommerce',
    type: 'plugin',
    checks: [
      { type: 'html', pattern: /bigcommerce/i },
      { type: 'script_src', pattern: /bigcommerce\.com/i },
      { type: 'html', pattern: /BCData|BigCommerce/i },
    ],
    logo: '🏪',
    doofinder_plugin: 'https://www.bigcommerce.com/apps/doofinder/',
    doofinder_docs: 'https://support.doofinder.com/plugins/bigcommerce/installation-guide/pre-requisites-bigcommerce',
  },
  {
    name: 'Shopware',
    type: 'plugin',
    checks: [
      { type: 'html', pattern: /shopware/i },
      { type: 'script_src', pattern: /shopware/i },
      { type: 'html', pattern: /sw-plugin-config|shopware/i },
    ],
    logo: '⚡',
    doofinder_plugin: 'https://store.shopware.com/',
    doofinder_docs: 'https://support.doofinder.com/plugins/shopware/installation-guide/pre-requisites-shopware',
  },
  {
    name: 'VTEX',
    type: 'plugin',
    checks: [
      { type: 'html', pattern: /vtex/i },
      { type: 'script_src', pattern: /vtex\.com|vteximg/i },
      { type: 'html', pattern: /vtexContext|vtex\.renderExtensions/i },
    ],
    logo: '🇧🇷',
    doofinder_plugin: null,
    doofinder_docs: 'https://support.doofinder.com/plugins/vtex/installation-guide/pre-requisites-vtex',
  },
  {
    name: 'Wix',
    type: 'script',
    checks: [
      { type: 'html', pattern: /wix\.com|wixstatic\.com/i },
      { type: 'script_src', pattern: /wix\.com|wixstatic/i },
      { type: 'html', pattern: /"wix\.com"/i },
    ],
    logo: '🌐',
    doofinder_plugin: null,
    doofinder_docs: 'https://support.doofinder.com/getting-started/installing-doofinder',
  },
  {
    name: 'Squarespace',
    type: 'script',
    checks: [
      { type: 'html', pattern: /squarespace\.com/i },
      { type: 'script_src', pattern: /squarespace/i },
      { type: 'meta', name: 'generator', hint: 'squarespace' },
    ],
    logo: '◼',
    doofinder_plugin: null,
    doofinder_docs: 'https://support.doofinder.com/getting-started/installing-doofinder',
  },
];

// Chat support tools detection
const SUPPORT_TOOLS = [
  { name: 'Intercom', patterns: [/intercom/i, /widget\.intercom\.io/i] },
  { name: 'Zendesk', patterns: [/zendesk/i, /zopim/i, /zdassets\.com/i] },
  { name: 'Freshdesk / Freshchat', patterns: [/freshdesk/i, /freshchat/i, /freshworks/i] },
  { name: 'HubSpot Live Chat', patterns: [/hubspot/i, /hs-scripts/i] },
  { name: 'Tidio', patterns: [/tidio/i] },
  { name: 'Crisp', patterns: [/crisp\.chat/i] },
  { name: 'LiveChat', patterns: [/livechat/i, /livechatinc\.com/i] },
  { name: 'Drift', patterns: [/drift\.com/i] },
  { name: 'Tawk.to', patterns: [/tawk\.to/i] },
  { name: 'Gorgias', patterns: [/gorgias/i] },
];

function detectPlatformFromHtml(html, headers) {
  const results = [];

  for (const plat of PLATFORM_SIGNATURES) {
    let score = 0;
    const matchedChecks = [];

    for (const check of plat.checks) {
      if (check.type === 'html' && check.pattern.test(html)) {
        score += 2;
        matchedChecks.push(check.pattern.toString());
      } else if (check.type === 'meta') {
        const metaMatch = check.hint
          ? new RegExp(`<meta[^>]*(?:name|property)=["']${check.name || check.property}["'][^>]*content=["'][^"']*${check.hint}[^"']*["']`, 'i').test(html)
          : html.includes(`name="${check.name}"`) || html.includes(`name='${check.name}'`);
        if (metaMatch) { score += 3; matchedChecks.push('meta:' + (check.name || check.property)); }
      } else if (check.type === 'script_src' && check.pattern.test(html)) {
        score += 2;
        matchedChecks.push('script:' + check.pattern.toString());
      } else if (check.type === 'link_href' && check.pattern.test(html)) {
        score += 1;
        matchedChecks.push('link:' + check.pattern.toString());
      }
    }

    if (score > 0) {
      results.push({ ...plat, score, matchedChecks });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.length > 0 ? results[0] : null;
}

function detectSupportTools(html) {
  const found = [];
  for (const tool of SUPPORT_TOOLS) {
    if (tool.patterns.some(p => p.test(html))) {
      found.push(tool.name);
    }
  }
  return found;
}

function detectDoofinderScript(html) {
  const scriptMatch = html.match(/https?:\/\/([a-z0-9]+)-config\.doofinder\.com\/\d+\.x\/([a-zA-Z0-9-]+)\.js/);
  if (scriptMatch) {
    return {
      installed: true,
      zone: scriptMatch[1],
      storeId: scriptMatch[2],
      scriptTag: scriptMatch[0],
    };
  }
  // Check for old-style doofinder
  if (/doofinder/i.test(html)) {
    return { installed: true, zone: 'unknown', storeId: 'unknown', partial: true };
  }
  return { installed: false };
}

function extractMetaInfo($) {
  return {
    title: $('title').first().text().trim() || null,
    description: $('meta[name="description"]').attr('content') || null,
    generator: $('meta[name="generator"]').attr('content') || null,
    language: $('html').attr('lang') || null,
  };
}

function extractVersion($, platform) {
  // Try to find version hints for known platforms
  const html = $.html();
  const versionPatterns = {
    'WooCommerce': [/woocommerce[^"']*ver=([0-9.]+)/i, /woocommerce\/([0-9.]+)/i],
    'PrestaShop': [/prestashop[^"']*version[^"']*([0-9.]+)/i],
    'Magento': [/Mage\.VERSION\s*=\s*['"]([^'"]+)['"]/i],
    'Shopware': [/shopware[^"']*([0-9]+\.[0-9]+\.[0-9]+)/i],
    'WordPress': [/ver=([0-9.]+)[^"']*wp-/i, /WordPress ([0-9.]+)/i],
  };

  if (platform && versionPatterns[platform]) {
    for (const p of versionPatterns[platform]) {
      const m = html.match(p);
      if (m) return m[1];
    }
  }
  return null;
}

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────

// Detect platform from URL
app.post('/api/detect', async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });

  // Normalize URL
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DoofinderSalesCopilot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const html = await response.text();
    const $ = cheerio.load(html);

    const platform = detectPlatformFromHtml(html, Object.fromEntries(response.headers));
    const doofinder = detectDoofinderScript(html);
    const supportTools = detectSupportTools(html);
    const meta = extractMetaInfo($);
    const version = extractVersion($, platform?.name);

    // Final resolved URL (after redirects)
    const finalUrl = response.url;

    res.json({
      success: true,
      url: finalUrl,
      meta,
      platform: platform ? {
        name: platform.name,
        type: platform.type,
        logo: platform.logo,
        score: platform.score,
        doofinder_plugin: platform.doofinder_plugin,
        doofinder_docs: platform.doofinder_docs,
        version,
      } : null,
      doofinder,
      supportTools,
      httpStatus: response.status,
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(408).json({ error: 'Tiempo de espera agotado al acceder a la URL' });
    } else {
      res.status(500).json({ error: `No se pudo acceder a la URL: ${err.message}` });
    }
  }
});

// Chat with AI (troubleshooting)
app.post('/api/chat', async (req, res) => {
  const { messages, context } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const systemPrompt = buildSystemPrompt(context || {});

  try {
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
      if (event.type === 'message_stop') {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }
    }
    res.end();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildSystemPrompt(ctx) {
  const { platform, doofinderInstalled, storeUrl, supportTools, version } = ctx;

  return `Eres el asistente de ventas interno de Doofinder, especializado en ayudar a comerciales a instalar y resolver problemas de Doofinder durante llamadas telefónicas con clientes.

CONTEXTO DEL CLIENTE ACTUAL:
- URL de la tienda: ${storeUrl || 'No especificada'}
- Plataforma detectada: ${platform || 'No detectada'}${version ? ` v${version}` : ''}
- Doofinder ya instalado: ${doofinderInstalled ? 'SÍ (el script ya está en la web)' : 'NO'}
- Herramientas de soporte detectadas: ${supportTools?.length ? supportTools.join(', ') : 'Ninguna'}

CONOCIMIENTO BASE DE DOOFINDER:

Conceptos clave:
- Store: representa el sitio web del cliente en Doofinder. Una cuenta puede tener varias stores.
- Search Engine: motor de búsqueda que indexa el catálogo. Puede haber varios por idioma/catálogo.
- Data Feed: archivo XML/CSV/JSON con todos los productos. Doofinder lo lee para indexarlos.
- Indexación: proceso por el que Doofinder lee el feed y guarda productos para poder buscarlos.
- Layer: widget visual de búsqueda que aparece en la web cuando alguien escribe en el buscador.
- Script de instalación: una línea JS en el header/footer de la web. Formato:
  <script src="https://eu1-config.doofinder.com/2.x/STORE_ID.js" async></script>
  Zonas: eu1 = Europa, us1 = América, ap1 = Asia
- CSS Selector: indica a Doofinder dónde está el buscador (ej: #search-box, input[name="q"])

Plataformas con plugin oficial (instalación automática):
Shopify, WooCommerce, PrestaShop, Magento, BigCommerce, Shopware, VTEX, JTL, Shoper, Shoptet, WiziShop, LightSpeed, Gomag, nopCommerce, BigCommerce

Otras plataformas: instalación manual con script JS o via Google Tag Manager (GTM).
Nota con GTM: cambiar "const" por "var" en el script de Doofinder.

PROBLEMAS COMUNES Y SOLUCIONES:

1. Layer no aparece en la web:
   - Verificar que el script está en el HTML global (Ctrl+U, buscar "doofinder")
   - Comprobar que el CSS selector apunta al buscador correcto
   - Confirmar que el Search Engine tiene productos indexados (> 0)
   - Esperar a que la indexación inicial termine (puede tardar minutos)
   - Desactivar plugins de caché y probar de nuevo

2. Error de indexación / indexación no avanza:
   - Comprobar que la URL del feed es accesible desde internet (abrirla en navegador)
   - Verificar formato correcto del feed (XML bien formado, CSV con cabeceras)
   - Comprobar que la tienda no está en modo mantenimiento
   - Para WooCommerce: comprobar que el plugin de Doofinder está activo

3. Precios incorrectos en resultados:
   - Revisar configuración de moneda en el Search Engine
   - Comprobar si los precios en el feed incluyen o excluyen IVA
   - Verificar la configuración de divisa del Search Engine

4. El script está puesto pero no funciona:
   - Limpiar caché del navegador y probar en modo incógnito
   - Verificar que no hay errores de CSP (Content Security Policy) en consola
   - Confirmar que el script está en el header/footer de TODAS las páginas, no solo una
   - Si usa GTM: verificar que el tag está publicado (no solo guardado)

5. Productos no aparecen en la búsqueda:
   - Verificar que la indexación ha completado correctamente
   - Comprobar que el producto está activo/publicado en la tienda
   - Revisar los campos del feed (title, link, price, image_link obligatorios)

FLUJO DE ONBOARDING (pasos que sigue el comercial):
1. Alta de cuenta en admin.doofinder.com
2. Crear Store con la URL del cliente
3. Crear Search Engine (elegir tipo de datos, idioma, moneda, fuente del feed)
4. Instalar script o plugin según plataforma
5. Verificar que el layer aparece y muestra productos

ESCALACIÓN A SOPORTE:
Si el problema no se puede resolver en la llamada, el comercial debe abrir un ticket en Intercom con: plataforma, URL, descripción del problema y pasos ya realizados.

INSTRUCCIONES DE RESPUESTA:
- Responde siempre en español
- Sé conciso y directo: el comercial está en llamada y necesita respuestas rápidas
- Usa listas numeradas para pasos a seguir
- Si hay un problema claro, da el diagnóstico y los pasos concretos
- Indica cuándo es momento de escalar a soporte por Intercom
- Usa **negritas** para términos clave
- Máximo 300 palabras por respuesta salvo que se pida más detalle`;
}

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`\n✅ Doofinder Sales Copilot corriendo en http://localhost:${PORT}\n`);
});
