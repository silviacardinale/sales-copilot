/* ── State ── */
const state = {
  platform: null,
  installType: null,
  clientUrl: null,
  doofinderInfo: null,
  supportTools: [],
  chatHistory: [],
  isSending: false,
  callStart: Date.now(),
};

/* ── Timer ── */
setInterval(() => {
  const elapsed = Math.floor((Date.now() - state.callStart) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  const el = document.getElementById('call-timer');
  if (el) el.textContent = `${m}:${s}`;
}, 1000);

/* ── Navigation ── */
const STEP_VIEWS = ['view-0', 'view-1', 'view-2', 'view-3'];
const TOOL_VIEWS = ['view-troubleshoot', 'view-glossary', 'view-ticket'];
const ALL_VIEWS = [...STEP_VIEWS, ...TOOL_VIEWS];

function showView(id) {
  ALL_VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.remove('active');
  });
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  // Update sidebar step highlights
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById('sbtn-' + i);
    if (btn) btn.classList.toggle('active', id === 'view-' + i);
  }

  // Update tool btn highlights
  ['troubleshoot', 'glossary', 'ticket'].forEach(k => {
    const btn = document.getElementById('tbtn-' + k);
    if (btn) btn.classList.toggle('active', id === 'view-' + k);
  });
}

function goStep(n) {
  showView('view-' + n);
  if (n === 2) buildInstallView();
}

function goView(name) {
  showView('view-' + name);
  if (name === 'troubleshoot' && state.chatHistory.length === 0) initChat();
  if (name === 'ticket') prefillTicket();
}

function updateStepStatus(n, status) {
  const el = document.getElementById('sc-' + n);
  if (!el) return;
  if (status === 'done') {
    el.classList.add('done');
    el.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 5l2.5 2.5L8 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

/* ── Detection ── */
async function detectSite() {
  const input = document.getElementById('url-input');
  const url = input.value.trim();
  if (!url) { input.focus(); return; }

  document.getElementById('detect-results').style.display = 'none';
  document.getElementById('detect-error').style.display = 'none';
  document.getElementById('detect-loading').style.display = 'flex';
  document.getElementById('loading-url').textContent = url.replace(/^https?:\/\//, '');
  document.getElementById('detect-btn').disabled = true;

  try {
    const res = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();
    document.getElementById('detect-loading').style.display = 'none';
    document.getElementById('detect-btn').disabled = false;

    if (!res.ok || !data.success) {
      showDetectError(data.error || 'Error desconocido');
      return;
    }

    renderDetectResults(data, url);
    updateClientChip(data);

    // Store state for AI context
    state.clientUrl = data.url || url;
    state.platform = data.platform?.name || null;
    state.installType = data.platform?.type || null;
    state.doofinderInfo = data.doofinder;
    state.supportTools = data.supportTools || [];

  } catch (err) {
    document.getElementById('detect-loading').style.display = 'none';
    document.getElementById('detect-btn').disabled = false;
    showDetectError('No se pudo conectar con el servidor: ' + err.message);
  }
}

function showDetectError(msg) {
  const el = document.getElementById('detect-error');
  el.textContent = '⚠ ' + msg;
  el.style.display = 'block';
}

function renderDetectResults(data, inputUrl) {
  const { platform, doofinder, supportTools, meta, httpStatus } = data;

  // Platform card
  const platformEl = document.getElementById('r-platform-content');
  if (platform) {
    const badgeClass = platform.type === 'plugin' ? 'badge-plugin' : 'badge-script';
    const badgeLabel = platform.type === 'plugin' ? '✦ Plugin oficial disponible' : '⟨/⟩ Instalación manual';
    platformEl.innerHTML = `
      <div class="platform-big">
        <span class="platform-emoji-big">${platform.logo}</span>
        <div>
          <div class="platform-name-big">${platform.name}</div>
          ${platform.version ? `<div class="platform-ver">v${platform.version}</div>` : ''}
        </div>
      </div>
      <div class="platform-type-badge ${badgeClass}">${badgeLabel}</div>
      ${platform.doofinder_docs ? `<div style="margin-top:8px"><a href="${platform.doofinder_docs}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;">Ver guía de instalación ↗</a></div>` : ''}
    `;
  } else {
    platformEl.innerHTML = `<div class="platform-big"><span class="platform-emoji-big">🔍</span><div><div class="platform-name-big" style="color:var(--text-2)">No detectada</div><div class="platform-ver">Puede ser una plataforma custom</div></div></div><div class="platform-type-badge badge-unknown">Script manual</div>`;
  }

  // Doofinder card
  const dfEl = document.getElementById('r-doofinder-content');
  if (doofinder?.installed) {
    const idText = doofinder.storeId && doofinder.storeId !== 'unknown' ? doofinder.storeId : '—';
    const zoneText = doofinder.zone && doofinder.zone !== 'unknown' ? doofinder.zone.toUpperCase() : '—';
    dfEl.innerHTML = `
      <div class="df-installed">
        <span class="df-installed-icon">✅</span>
        <div>
          <div class="df-status-text" style="color:var(--green)">Ya instalado</div>
          <div class="df-store-id">Zone: ${zoneText} · ID: ${idText}</div>
        </div>
      </div>
    `;
  } else {
    dfEl.innerHTML = `
      <div class="df-installed">
        <span class="df-installed-icon">⭕</span>
        <div>
          <div class="df-status-text" style="color:var(--text-2)">No instalado</div>
          <div class="df-store-id">Pendiente de instalación</div>
        </div>
      </div>
    `;
  }

  // Support tools card
  const supEl = document.getElementById('r-support-content');
  if (supportTools?.length) {
    supEl.innerHTML = `<div class="support-tools">${supportTools.map(t =>
      `<div class="support-tool-item"><span class="support-dot"></span>${t}</div>`
    ).join('')}</div>`;
  } else {
    supEl.innerHTML = `<div style="font-size:13px;color:var(--text-3)">No detectado</div>`;
  }

  // Meta info card
  const metaEl = document.getElementById('r-meta-content');
  const rows = [];
  if (meta?.title) rows.push(`<div class="meta-row"><span class="meta-key">Nombre</span>${escHtml(meta.title.slice(0, 50))}</div>`);
  if (meta?.language) rows.push(`<div class="meta-row"><span class="meta-key">Idioma</span>${escHtml(meta.language)}</div>`);
  if (meta?.generator) rows.push(`<div class="meta-row"><span class="meta-key">CMS</span>${escHtml(meta.generator.slice(0, 40))}</div>`);
  if (httpStatus) rows.push(`<div class="meta-row"><span class="meta-key">HTTP</span>${httpStatus}</div>`);
  rows.push(`<div class="meta-row"><span class="meta-key">URL</span><a href="${data.url}" target="_blank" style="color:var(--accent);text-decoration:none;font-size:11px">${data.url.replace(/^https?:\/\//, '').slice(0, 40)}</a></div>`);
  metaEl.innerHTML = `<div class="meta-info">${rows.join('')}</div>`;

  document.getElementById('detect-results').style.display = 'block';
}

function updateClientChip(data) {
  const chip = document.getElementById('client-chip');
  const icon = document.getElementById('chip-icon');
  const urlEl = document.getElementById('chip-url');
  if (data.platform) icon.textContent = data.platform.logo + ' ';
  urlEl.textContent = (data.url || '').replace(/^https?:\/\//, '').split('/')[0];
  chip.style.display = 'flex';
}

/* ── Installation guide ── */
function setPlatform(name, type) {
  state.platform = name;
  state.installType = type;

  // Highlight selected
  document.querySelectorAll('.platform-btn').forEach(b => {
    b.classList.toggle('selected', b.textContent.trim().toLowerCase().includes(name.toLowerCase()));
  });

  setTimeout(() => buildInstallView(), 200);
}

function buildInstallView() {
  const guide = document.getElementById('install-guide');
  const selector = document.getElementById('platform-selector');
  if (!state.platform) { guide.style.display = 'none'; selector.style.display = 'block'; return; }

  document.getElementById('install-subtitle').textContent =
    `Instalación en ${state.platform} — ${state.installType === 'plugin' ? 'plugin oficial' : 'script manual'}`;

  const steps = getInstallSteps(state.platform, state.installType);
  const noteHtml = state.installType === 'plugin'
    ? `<div class="install-note"><strong>El plugin hace automáticamente:</strong> genera el data feed, inyecta el script, configura el CSS selector del buscador y activa la indexación. El cliente solo necesita instalarlo y conectarlo.</div>`
    : `<div class="install-note"><strong>Instalación manual vía script:</strong> el cliente copia una línea de JS y la pega en el &lt;head&gt; o &lt;footer&gt; global de su web. Alternativa: usar Google Tag Manager (cambiar <code>const</code> por <code>var</code> en el script).</div>`;

  guide.innerHTML = `
    <div class="install-guide-inner">
      <div class="section-label">Pasos con el cliente</div>
      <div class="install-checklist">
        ${steps.map(s => `
          <label class="check-item">
            <input type="checkbox" class="chk"/>
            <span>${s}</span>
          </label>`).join('')}
      </div>
      ${noteHtml}
      <div class="nav-btns">
        <button class="btn-secondary" onclick="goStep(1)">← Atrás</button>
        <button class="btn-primary" onclick="goStep(3); updateStepStatus(1,'done'); updateStepStatus(2,'done')">Instalado → verificar</button>
        <button class="btn-warn" onclick="goView('troubleshoot')">Hay un problema</button>
      </div>
    </div>`;

  guide.style.display = 'block';
  selector.style.display = 'none';
}

function getInstallSteps(platform, type) {
  const pluginSteps = {
    'Shopify': [
      'El cliente abre el <strong>Shopify App Store</strong> y busca "Doofinder"',
      'Instala la app oficial y la autoriza en su tienda',
      'El setup wizard de Doofinder se lanza automáticamente',
      'Confirmar idioma, moneda y tipo de datos del catálogo',
      'Esperar a que la indexación inicial finalice (2-10 min según catálogo)',
    ],
    'WooCommerce': [
      'El cliente va a <strong>WordPress → Plugins → Añadir nuevo</strong>',
      'Busca "Doofinder for WooCommerce" e instala el plugin oficial',
      'Lo activa y aparece el asistente de configuración de Doofinder',
      'Introduce las credenciales de su cuenta de Doofinder (o las crea)',
      'El plugin crea la Store y el Search Engine automáticamente',
      'Esperar a que la indexación inicial finalice',
    ],
    'PrestaShop': [
      'El cliente va a <strong>Módulos → Marketplace</strong> y busca "Doofinder"',
      'Instala el módulo oficial y lo activa',
      'Accede al módulo y conecta con su cuenta de Doofinder',
      'El módulo crea la Store y el Search Engine automáticamente',
      'Esperar indexación inicial (puede ser larga con catálogos grandes)',
    ],
    'Magento': [
      'Instalar el módulo vía Composer o descargándolo del Marketplace',
      'Activar el módulo en <strong>Sistema → Gestión de módulos</strong>',
      'Ir a <strong>Doofinder → Configuración</strong> e introducir las credenciales',
      'Ejecutar la indexación desde el panel de administración de Doofinder',
    ],
    'BigCommerce': [
      'El cliente va al <strong>BigCommerce App Store</strong> y busca "Doofinder"',
      'Instala la app y la autoriza',
      'El wizard configura el Search Engine automáticamente',
      'Confirmar configuración y esperar indexación',
    ],
    'Shopware': [
      'Descargar el plugin de Doofinder desde el <strong>Shopware Store</strong>',
      'Instalar y activar en <strong>Extensiones → Mis extensiones</strong>',
      'Configurar con las credenciales de la cuenta de Doofinder',
      'Lanzar la primera indexación desde el panel',
    ],
  };

  if (type === 'plugin' && pluginSteps[platform]) return pluginSteps[platform];

  if (type === 'plugin') return [
    `El cliente abre el marketplace de ${platform} y busca "Doofinder"`,
    'Instala el plugin oficial y lo activa',
    'Conecta el plugin con su cuenta de Doofinder',
    'El plugin crea la Store y Search Engine automáticamente',
    'Esperar a que la indexación inicial finalice',
  ];

  return [
    'El cliente abre su <strong>Admin Panel de Doofinder</strong> → Configuración → Store Settings',
    'Baja hasta <strong>Installation Script</strong> y copia el script',
    'En la plataforma de su web, pega el script en el <strong>header o footer global</strong> (todas las páginas)',
    'Guarda y publica los cambios en la web',
    'Si el CSS selector no se detecta automáticamente, indicarlo en el paso "Search Bar Location" del wizard',
    'Volver al Admin Panel y hacer clic en <strong>Connect</strong> para finalizar',
  ];
}

/* ── Chat ── */
function initChat() {
  const ctx = {
    platform: state.platform,
    installType: state.installType,
    doofinderInstalled: state.doofinderInfo?.installed,
    storeUrl: state.clientUrl,
    supportTools: state.supportTools,
    storeId: state.doofinderInfo?.storeId,
    zone: state.doofinderInfo?.zone,
  };

  state.chatHistory = [];

  // Show welcome based on context
  const welcome = document.getElementById('chat-messages');
  welcome.innerHTML = '';

  let welcomeMsg = 'Asistente listo.';
  if (state.platform) welcomeMsg += ` Plataforma: <strong>${state.platform}</strong>.`;
  if (state.doofinderInfo?.installed) welcomeMsg += ` Doofinder <strong>ya está instalado</strong> en esta web.`;
  welcomeMsg += ' ¿Qué problema tiene el cliente?';

  appendBubble('ai', welcomeMsg);
  state._context = ctx;
}

function appendBubble(who, html) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ' + who;

  const initials = who === 'ai' ? 'DF' : 'Yo';
  div.innerHTML = `
    <div class="msg-avatar ${who}">${initials}</div>
    <div class="msg-bubble" id="${who === 'ai' ? 'last-ai-bubble' : ''}">${html}</div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function addTypingIndicator() {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar ai">DF</div>
    <div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || state.isSending) return;

  // Hide quick actions after first use
  const qa = document.getElementById('quick-actions');
  if (qa) qa.style.display = 'none';

  appendBubble('user', escHtml(text).replace(/\n/g, '<br>'));
  state.chatHistory.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';

  state.isSending = true;
  document.getElementById('btn-send').disabled = true;
  addTypingIndicator();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.chatHistory,
        context: state._context || {},
      }),
    });

    removeTypingIndicator();

    if (!res.ok) throw new Error('HTTP ' + res.status);

    // Streaming response
    const msgDiv = appendBubble('ai', '');
    const bubble = msgDiv.querySelector('.msg-bubble');
    const messages = document.getElementById('chat-messages');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.text) {
              fullText += json.text;
              bubble.innerHTML = formatAIText(fullText);
              messages.scrollTop = messages.scrollHeight;
            }
          } catch {}
        }
      }
    }

    state.chatHistory.push({ role: 'assistant', content: fullText });

  } catch (err) {
    removeTypingIndicator();
    appendBubble('ai', `<span style="color:var(--red)">Error: ${err.message}. Revisa que el servidor está activo.</span>`);
  }

  state.isSending = false;
  document.getElementById('btn-send').disabled = false;
}

function quickSend(text) {
  document.getElementById('chat-input').value = text;
  sendChat();
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^(\d+)\.\s(.+)$/gm, '<div style="margin:3px 0">$1. $2</div>')
    .replace(/^[-•]\s(.+)$/gm, '<div style="margin:3px 0 3px 8px">• $1</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/* ── Ticket ── */
function prefillTicket() {
  const p = document.getElementById('t-platform');
  const u = document.getElementById('t-url');
  if (!p.value && state.platform) p.value = state.platform;
  if (!u.value && state.clientUrl) u.value = state.clientUrl;
}

function generateTicket() {
  const platform = document.getElementById('t-platform').value.trim();
  const url = document.getElementById('t-url').value.trim();
  const problem = document.getElementById('t-problem').value.trim();
  const steps = document.getElementById('t-steps').value.trim();

  if (!problem) {
    alert('Por favor describe el problema antes de generar el resumen.');
    return;
  }

  const doofStatus = state.doofinderInfo?.installed
    ? `Instalado (Zone: ${state.doofinderInfo.zone?.toUpperCase() || '?'}, ID: ${state.doofinderInfo.storeId || '?'})`
    : 'No instalado';

  const supportTools = state.supportTools?.length ? state.supportTools.join(', ') : 'No detectado';

  const summary = `🔴 REQUIERE INTERVENCIÓN DE SOPORTE TÉCNICO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plataforma: ${platform || 'No especificada'}
URL de la tienda: ${url || 'No especificada'}
Doofinder: ${doofStatus}
Chat de soporte del cliente: ${supportTools}

📋 PROBLEMA
${problem}

🔧 PASOS DE TROUBLESHOOTING REALIZADOS
${steps || 'Ninguno indicado'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generado desde Sales Copilot`;

  document.getElementById('ticket-preview').textContent = summary;
  document.getElementById('ticket-output').style.display = 'block';
  window._ticketSummary = summary;
}

function copyTicket() {
  if (window._ticketSummary) {
    navigator.clipboard.writeText(window._ticketSummary)
      .then(() => {
        const btn = event.target;
        btn.textContent = '✓ Copiado';
        setTimeout(() => { btn.textContent = 'Copiar al portapapeles'; }, 2000);
      })
      .catch(() => alert('No se pudo copiar. Selecciona el texto manualmente.'));
  }
}

function copyScript() {
  const script = '<script src="https://eu1-config.doofinder.com/2.x/STORE_ID.js" async><\/script>';
  navigator.clipboard.writeText(script).then(() => {
    const btn = event.target;
    btn.textContent = '✓ Copiado';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
}

/* ── Session reset ── */
function resetSession() {
  if (!confirm('¿Iniciar nueva llamada? Se borrará el contexto actual.')) return;
  Object.assign(state, {
    platform: null, installType: null, clientUrl: null,
    doofinderInfo: null, supportTools: [], chatHistory: [],
    isSending: false, callStart: Date.now(),
  });
  state._context = {};

  // Reset UI
  document.getElementById('url-input').value = '';
  document.getElementById('detect-results').style.display = 'none';
  document.getElementById('detect-error').style.display = 'none';
  document.getElementById('client-chip').style.display = 'none';
  document.getElementById('chat-messages').innerHTML = '<div class="chat-welcome"><div class="welcome-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="14" cy="14" r="11"/><path d="M14 3v3M14 22v3M3 14h3M22 14h3" stroke-linecap="round"/></svg></div><p>Asistente listo para la nueva llamada.</p></div>';
  document.getElementById('quick-actions').style.display = 'flex';
  document.getElementById('ticket-output').style.display = 'none';
  document.getElementById('install-guide').style.display = 'none';
  document.getElementById('platform-selector').style.display = 'block';

  for (let i = 0; i < 4; i++) {
    const el = document.getElementById('sc-' + i);
    if (el) { el.classList.remove('done'); el.innerHTML = i + 1; }
    const btn = document.getElementById('sbtn-' + i);
    if (btn) btn.classList.remove('active');
  }

  goStep(0);
}

/* ── Utils ── */
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showView('view-0');
  document.getElementById('sbtn-0').classList.add('active');
});
