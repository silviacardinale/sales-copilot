const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const cheerio = require('cheerio');

const PLATFORM_SIGNATURES = [
  { name: 'Shopify', type: 'plugin', indicators: ['cdn.shopify.com', 'Shopify.theme', 'shopify-section', 'myshopify.com', 'window.Shopify'] },
  { name: 'WooCommerce', type: 'plugin', indicators: ['woocommerce', 'wc-', '/wp-content/plugins/woocommerce', 'is-woocommerce'] },
  { name: 'PrestaShop', type: 'plugin', indicators: ['prestashop', '/modules/ps_', 'window.prestashop', 'data-id-product'] },
  { name: 'Magento', type: 'plugin', indicators: ['Magento_', 'mage/cookies', 'window.MAGE_', 'magento', '/pub/static/'] },
  { name: 'BigCommerce', type: 'plugin', indicators: ['bigcommerce', 'cdn11.bigcommerce.com', 'window.BCData', 'stencil-'] },
  { name: 'Shopware', type: 'plugin', indicators: ['shopware', 'sw-', 'sales-channel', 'shopware/storefront'] },
  { name: 'VTEX', type: 'plugin', indicators: ['vtex', 'vtexcommerce', 'vtex.com', 'window.vtex'] },
  { name: 'JTL', type: 'plugin', indicators: ['jtl-', 'jtlshop', 'jtl_', 'JTL-Shop'] },
  { name: 'WordPress', type: 'script', indicators: ['wp-content', 'wp-includes', 'wp-json', 'wordpress'] },
  { name: 'Wix', type: 'script', indicators: ['wix.com', 'wixsite.com', 'X-Wix-', 'wixstatic.com'] },
  { name: 'Squarespace', type: 'script', indicators: ['squarespace.com', 'squarespace-cdn', 'Static.SQUARESPACE_CONTEXT'] },
  { name: 'OpenCart', type: 'script', indicators: ['opencart', 'route=common', 'catalog/view/theme'] },
  { name: 'Drupal', type: 'script', indicators: ['Drupal.settings', 'drupal.js', '/sites/default/files'] },
];

const DOOFINDER_INDICATORS = {
  script: ['doofinder.com', 'eu1-config.doofinder', 'us1-config.doofinder', 'ap1-config.doofinder', 'doofinder/js'],
  elements: ['df-search-wrapper', 'df-results', 'doofinderLayer', 'doofinder-search'],
  meta: ['doofinder'],
};

const SUPPORT_TOOLS = [
  { name: 'Intercom', indicators: ['intercom.io', 'widget.intercom.io', 'window.Intercom', 'intercomSettings'] },
  { name: 'Zendesk', indicators: ['zopim', 'zendesk.com', 'zd-', 'zdAssets'] },
  { name: 'Freshchat', indicators: ['freshchat', 'freshdesk', 'fcWidget'] },
  { name: 'Tidio', indicators: ['tidio', 'tidiochat'] },
  { name: 'LiveChat', indicators: ['livechatinc.com', '__lc', 'LC_API'] },
  { name: 'Crisp', indicators: ['crisp.chat', 'CRISP_WEBSITE_ID'] },
  { name: 'HubSpot Chat', indicators: ['hubspot.com/conversations', 'HubSpotConversations'] },
  { name: 'Tawk.to', indicators: ['tawk.to', 'tawkto'] },
];

const ANALYTICS_TOOLS = [
  { name: 'Google Analytics 4', indicators: ['gtag(', 'G-', 'ga4'] },
  { name: 'Google Analytics UA', indicators: ["ga('create'", "'UA-'"] },
  { name: 'Google Tag Manager', indicators: ['googletagmanager.com/gtm', 'GTM-'] },
  { name: 'Meta Pixel', indicators: ['fbq(', 'connect.facebook.net/en_US/fbevents'] },
  { name: 'Hotjar', indicators: ['hotjar.com', 'hjSetting'] },
  { name: 'Klaviyo', indicators: ['klaviyo', 'KlaviyoObject'] },
];

async function fetchPage(url) {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(normalized, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SalesCopilot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    const html = await res.text();
    return { html, status: res.status, finalUrl: res.url, headers: Object.fromEntries(res.headers) };
  } catch (e) {
    clearTimeout(timeout);
    throw new Error(`No se pudo acceder a la web: ${e.message}`);
  }
}

function detectInText(text, indicators) {
  const lower = text.toLowerCase();
  return indicators.some(ind => lower.includes(ind.toLowerCase()));
}

function extractDoofinderVersion(html) {
  const patterns = [
    /doofinder[^\s"']*\/(\d+\.\d+\.\d+)/i,
    /df[_-]version['":\s]+["']?(\d+\.\d+[\.\d]*)/i,
    /\/(\d+\.\d+\.\d+)\/doofinder/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractModuleVersion(html, platform) {
  const patterns = {
    WooCommerce: /woocommerce[_\-]?doofinder[^\s]*\/(\d+[\.\d]+)/i,
    PrestaShop: /doofinder[^\s]*prestashop[^\s]*\/(\d+[\.\d]+)/i,
    Magento: /doofinder[^\s]*magento[^\s]*\/(\d+[\.\d]+)/i,
    Shopify: /doofinder[^\s]*shopify[^\s]*\/(\d+[\.\d]+)/i,
  };
  const pat = patterns[platform];
  if (!pat) return null;
  const m = html.match(pat);
  return m ? m[1] : null;
}

function extractStoreId(html) {
  const patterns = [
    /eu1-config\.doofinder\.com\/2\.x\/([a-f0-9\-]{20,})/i,
    /us1-config\.doofinder\.com\/2\.x\/([a-f0-9\-]{20,})/i,
    /ap1-config\.doofinder\.com\/2\.x\/([a-f0-9\-]{20,})/i,
    /hashid["'\s:=]+["']([a-f0-9]{32,})/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractZone(html) {
  if (html.includes('eu1-config.doofinder')) return 'EU (eu1)';
  if (html.includes('us1-config.doofinder')) return 'US (us1)';
  if (html.includes('ap1-config.doofinder')) return 'AP (ap1)';
  return null;
}

function extractSearchBar($, html) {
  const candidates = [];
  $('input[type="search"], input[name="q"], input[name="search"], input[id*="search"], input[class*="search"], input[placeholder*="search" i], input[placeholder*="buscar" i], input[placeholder*="cerca" i]').each((_, el) => {
    const attrs = el.attribs || {};
    if (attrs.id) candidates.push(`#${attrs.id}`);
    else if (attrs.name) candidates.push(`input[name="${attrs.name}"]`);
    else if (attrs.class) candidates.push(`.${attrs.class.split(' ')[0]}`);
  });
  return candidates[0] || null;
}

function detectCookieBanner(html) {
  const indicators = ['cookiebot', 'cookielaw', 'onetrust', 'gdpr', 'cookie-consent', 'tarteaucitron', 'cc-window'];
  return indicators.some(i => html.toLowerCase().includes(i));
}

router.post('/', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });

  try {
    const { html, status, finalUrl, headers } = await fetchPage(url);
    const $ = cheerio.load(html);

    // Remove scripts content for DOM analysis but keep for text analysis
    const fullText = html;

    // Platform detection
    let platform = null;
    let installType = 'script';
    for (const p of PLATFORM_SIGNATURES) {
      if (detectInText(fullText, p.indicators)) {
        platform = p;
        installType = p.type;
        break;
      }
    }

    // Doofinder detection
    const hasDoofinderScript = detectInText(fullText, DOOFINDER_INDICATORS.script);
    const hasDoofinderElements = detectInText(fullText, DOOFINDER_INDICATORS.elements);
    const doofinderInstalled = hasDoofinderScript || hasDoofinderElements;
    const doofinderVersion = doofinderInstalled ? extractDoofinderVersion(fullText) : null;
    const doofinderZone = doofinderInstalled ? extractZone(fullText) : null;
    const doofinderStoreId = doofinderInstalled ? extractStoreId(fullText) : null;
    const moduleVersion = platform ? extractModuleVersion(fullText, platform.name) : null;

    // Support tools
    const detectedSupport = SUPPORT_TOOLS.filter(t => detectInText(fullText, t.indicators)).map(t => t.name);

    // Analytics
    const detectedAnalytics = ANALYTICS_TOOLS.filter(t => detectInText(fullText, t.indicators)).map(t => t.name);

    // Search bar
    const searchBarSelector = extractSearchBar($, fullText);

    // Cookie banner
    const hasCookieBanner = detectCookieBanner(fullText);

    // Server / tech headers
    const server = headers['server'] || headers['x-powered-by'] || null;
    const cdnHeaders = ['x-served-by', 'x-cache', 'cf-ray', 'x-vercel-id'];
    const cdn = cdnHeaders.find(h => headers[h]) ? 
      (headers['cf-ray'] ? 'Cloudflare' : headers['x-vercel-id'] ? 'Vercel' : 'CDN detectado') : null;

    // Page meta
    const title = $('title').text().trim() || null;
    const metaDesc = $('meta[name="description"]').attr('content') || null;

    // Products count hint
    const productSignals = (fullText.match(/product[_-]?id|sku|add[_-]to[_-]cart/gi) || []).length;
    const estimatedProducts = productSignals > 50 ? 'Grande (>500 productos estimado)' :
      productSignals > 20 ? 'Mediano (100-500 productos estimado)' :
      productSignals > 5 ? 'Pequeño (<100 productos estimado)' : null;

    // GTM detection (important for script install)
    const hasGTM = detectInText(fullText, ['googletagmanager.com/gtm', 'GTM-']);

    res.json({
      ok: true,
      url: finalUrl,
      title,
      metaDesc,
      platform: platform ? { name: platform.name, type: platform.type } : { name: 'Desconocida / Custom', type: 'script' },
      doofinder: {
        installed: doofinderInstalled,
        version: doofinderVersion,
        moduleVersion,
        zone: doofinderZone,
        storeId: doofinderStoreId ? doofinderStoreId.substring(0, 8) + '...' : null,
      },
      searchBar: {
        selector: searchBarSelector,
      },
      integrations: {
        supportChat: detectedSupport,
        analytics: detectedAnalytics,
        hasGTM,
        hasCookieBanner,
      },
      tech: {
        server,
        cdn,
        estimatedCatalogSize: estimatedProducts,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
