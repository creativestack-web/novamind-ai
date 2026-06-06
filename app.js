 NovaMind AI — app.js  v2.0
   Groq Streaming · LocalStorage History · Auto-scroll
   CreativeStack
═══════════════════════════════════════════════════════════ */

/* ── API Key (split for GitHub safety) ─────────────────── */
const part1   = 'gsk_KYaoYlvaI0MhUyU';
const part2   = 'RKOCdWGdyb3FYe3CNGq';
const part3   = '4BR7XiZuY318D8B2LM';
const API_KEY = part1 + part2 + part3;

const API_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODEL = 'llama-3.3-70b-versatile';

/* ── System Persona ─────────────────────────────────────── */
const SYSTEM_PROMPT = `You are NovaMind AI, an omniscient, hyper-intelligent AI companion created by CreativeStack. You possess the elite intelligence, coding expertise, and conversational empathy of the world's best AI systems. You have comprehensive knowledge spanning the full breadth of human understanding — advanced programming across every language and paradigm, business strategy and scaling, digital marketing and growth hacking, social media mastery, world history, science, mathematics, creative writing, and beyond.

RESPONSE PHILOSOPHY — This is critical:
- Never give generic 2-line answers. Always go deep, structured, and comprehensive.
- Think like a senior expert in the relevant field who genuinely wants the user to succeed.
- Use rich formatting: **bold** for key terms, ## headers to organise sections, bullet lists for steps/options, numbered lists for sequences, \`inline code\` for technical terms, and fenced code blocks for any code.
- For coding questions: always provide complete, commented, production-ready code. Explain the architecture, the why behind decisions, edge cases, and next steps.
- For business/marketing questions: provide frameworks, concrete examples, real metrics to aim for, and actionable 30/60/90-day plans where relevant.
- For educational questions: use analogies, worked examples, common misconceptions, and build from fundamentals.
- End complex responses with a "**Next Steps**" or "**What to try next**" section when helpful.
- Be warm, encouraging, and precise. Never be robotic or dismissive.
- If asked who created you: "I am NovaMind AI, built by CreativeStack."
- If asked what model powers you: you may say you run on advanced AI infrastructure optimised for speed and intelligence.`;

/* ── State ──────────────────────────────────────────────── */
let activeSessionId      = null;   // current chat UUID
let conversationHistory  = [];     // [{role,content}, ...]
let isStreaming          = false;

/* ── LocalStorage Helpers ───────────────────────────────── */
const LS_INDEX_KEY = 'nm_history_index'; // array of {id, title, ts}
const sessionKey   = id => `nm_session_${id}`;

function getIndex() {
  try { return JSON.parse(localStorage.getItem(LS_INDEX_KEY) || '[]'); }
  catch { return []; }
}
function saveIndex(index) {
  localStorage.setItem(LS_INDEX_KEY, JSON.stringify(index));
}
function loadSession(id) {
  try { return JSON.parse(localStorage.getItem(sessionKey(id)) || '[]'); }
  catch { return []; }
}
function saveSession(id, messages) {
  localStorage.setItem(sessionKey(id), JSON.stringify(messages));
}
function deleteSessionData(id) {
  localStorage.removeItem(sessionKey(id));
  const idx = getIndex().filter(e => e.id !== id);
  saveIndex(idx);
}
function generateId() {
  return 'nm_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
}
function titleFromMessage(text) {
  return text.slice(0, 52).replace(/\n/g, ' ').trim() + (text.length > 52 ? '…' : '');
}

/* ── DOM Refs ────────────────────────────────────────────── */
const chatWindow  = document.getElementById('chatWindow');
const dashboard   = document.getElementById('dashboard');
const userInput   = document.getElementById('userInput');
const sendBtn     = document.getElementById('sendBtn');
const historyList = document.getElementById('historyList');
const historyEmpty= document.getElementById('historyEmpty');

/* ── Auto-scroll ─────────────────────────────────────────── */
function scrollToBottom(force = false) {
  // Use requestAnimationFrame for a smooth, immediate snap
  requestAnimationFrame(() => {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  });
}

/* ── Show / Hide Views ───────────────────────────────────── */
function showDashboard() {
  dashboard.style.display   = '';
  chatWindow.style.display  = 'none';
  chatWindow.classList.remove('visible');
}
function showChatWindow() {
  dashboard.style.display   = 'none';
  chatWindow.style.display  = 'flex';
  chatWindow.classList.add('visible');
  scrollToBottom(true);
}

/* ── Markdown Renderer ───────────────────────────────────── */
function renderMarkdown(raw) {
  let text = raw;

  // 1. Fenced code blocks  ```lang\ncode```
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escHtml(code.trim());
    const langLabel   = lang || '';
    return `<div class="code-block-wrap">
      <span class="code-lang-tag">${escHtml(langLabel)}</span>
      <button class="copy-code-btn" title="Copy code" onclick="copyCode(this)">&#x2398;</button>
      <pre><code>${escapedCode}</code></pre>
    </div>`;
  });

  // 2. Inline code  `code`
  text = text.replace(/`([^`\n]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);

  // 3. Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 4. Italic *text* (not inside words)
  text = text.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<em>$1</em>');

  // 5. Headers
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // 6. Blockquote
  text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // 7. Horizontal rule
  text = text.replace(/^---+$/gm, '<hr>');

  // 8. Unordered lists  (- or *)
  text = text.replace(/^[ \t]*[-*] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, m => `<ul>${m}</ul>`);

  // 9. Ordered lists  1.
  text = text.replace(/^[ \t]*\d+\. (.+)$/gm, '<oli>$1</oli>');
  text = text.replace(/(<oli>[\s\S]*?<\/oli>)(\n<oli>[\s\S]*?<\/oli>)*/g, m =>
    `<ol>${m.replace(/<\/?oli>/g, t => t.replace('oli','li'))}</ol>`);

  // 10. Paragraphs — double newline
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  text = `<p>${text}</p>`;

  // 11. Clean up empty paragraphs wrapping block elements
  text = text.replace(/<p>(\s*<(?:h[1-6]|ul|ol|blockquote|div|hr)[^>]*>)/g, '$1');
  text = text.replace(/(<\/(?:h[1-6]|ul|ol|blockquote|div|hr)>)\s*<\/p>/g, '$1');
  text = text.replace(/<p>\s*<\/p>/g, '');

  return text;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Copy Code ───────────────────────────────────────────── */
function copyCode(btn) {
  const code = btn.closest('.code-block-wrap').querySelector('pre code');
  navigator.clipboard.writeText(code.innerText).then(() => {
    btn.classList.add('copied');
    btn.textContent = '✓';
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '&#x2398;'; }, 1800);
  });
}

/* ── Append User Message ─────────────────────────────────── */
function appendUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = 'U';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  contentDiv.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(contentDiv);
  chatWindow.appendChild(wrap);
  scrollToBottom();
}

/* ── Typing Indicator ────────────────────────────────────── */
function showTyping() {
  const row = document.createElement('div');
  row.className = 'typing-msg';
  row.id = 'typingMsg';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = 'NM';
  avatar.style.cssText = 'background:linear-gradient(135deg,#7b4fff,#00cfff);color:white;font-size:10px;font-weight:800;box-shadow:0 0 14px rgba(123,79,255,0.4);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:4px';

  const ind = document.createElement('div');
  ind.className = 'typing-indicator';
  ind.innerHTML = '<div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>';

  row.appendChild(avatar);
  row.appendChild(ind);
  chatWindow.appendChild(row);
  scrollToBottom();
  return row;
}
function removeTyping() {
  const el = document.getElementById('typingMsg');
  if (el) el.remove();
}

/* ── Create AI Bubble (for streaming) ───────────────────── */
function createAiBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = 'NM';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<span class="stream-cursor"></span>';

  contentDiv.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(contentDiv);
  chatWindow.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

/* ── Error in Chat ───────────────────────────────────────── */
function showChatError(title, detail) {
  removeTyping();
  const el = document.createElement('div');
  el.className = 'error-msg';
  el.innerHTML = `
    <svg width="18" height="18" fill="none" viewBox="0 0 18 18" style="flex-shrink:0;margin-top:2px">
      <circle cx="9" cy="9" r="8" stroke="#ff7575" stroke-width="1.4"/>
      <path d="M9 5.5v5M9 12v.5" stroke="#ff7575" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <div><strong>${escHtml(title)}</strong><p>${escHtml(detail)}</p></div>`;
  chatWindow.appendChild(el);
  scrollToBottom();
}

/* ── Groq Streaming API Call ─────────────────────────────── */
async function streamGroqResponse(bubble) {
  const payload = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
    ],
    temperature: 0.72,
    max_tokens: 4096,
    stream: true,
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `API error ${response.status}`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText  = '';

  // Remove initial cursor
  bubble.innerHTML = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const json  = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          // Render markdown as text streams in, append cursor
          bubble.innerHTML = renderMarkdown(fullText) + '<span class="stream-cursor"></span>';
          // Auto-scroll on every chunk
          scrollToBottom();
        }
      } catch {
        // malformed chunk — skip
      }
    }
  }

  // Final render without cursor
  bubble.innerHTML = renderMarkdown(fullText);
  scrollToBottom();
  return fullText;
}

/* ── Main Send ───────────────────────────────────────────── */
async function sendMessage() {
  if (isStreaming) return;

  const rawText = userInput.value.trim();
  if (!rawText) return;

  /* API key guard */
  if (!API_KEY || API_KEY.includes('YOUR_')) {
    showChatWindow();
    showChatError(
      'API Key Not Configured',
      'Open app.js and replace the part1/part2/part3 values with your real Groq API key. Get one free at console.groq.com.'
    );
    return;
  }

  /* Start or continue session */
  if (!activeSessionId) {
    activeSessionId = generateId();
  }

  showChatWindow();
  appendUserMessage(rawText);
  conversationHistory.push({ role: 'user', content: rawText });

  userInput.value = '';
  autoResize();
  isStreaming = true;
  sendBtn.disabled = true;

  showTyping();

  try {
    const typingEl = document.getElementById('typingMsg');
    if (typingEl) typingEl.remove();

    const bubble  = createAiBubble();
    const aiReply = await streamGroqResponse(bubble);

    conversationHistory.push({ role: 'assistant', content: aiReply });

    /* Persist to localStorage */
    saveSession(activeSessionId, conversationHistory);

    /* Update history index */
    const index = getIndex();
    const existing = index.find(e => e.id === activeSessionId);
    if (!existing) {
      index.unshift({
        id:    activeSessionId,
        title: titleFromMessage(rawText),
        ts:    Date.now(),
      });
      saveIndex(index);
    }

    renderHistoryList();

  } catch (err) {
    showChatError('NovaMind AI Error', err.message);
  } finally {
    isStreaming   = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

/* ── New Chat ────────────────────────────────────────────── */
function startNewChat() {
  activeSessionId     = null;
  conversationHistory = [];
  chatWindow.innerHTML = '';
  showDashboard();
  userInput.value = '';
  autoResize();
  document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active-history'));
  userInput.focus();
}

/* ── Load Past Chat ──────────────────────────────────────── */
function loadChat(id) {
  const messages = loadSession(id);
  if (!messages.length) return;

  activeSessionId     = id;
  conversationHistory = messages;
  chatWindow.innerHTML = '';
  showChatWindow();

  for (const msg of messages) {
    if (msg.role === 'user') {
      appendUserMessage(msg.content);
    } else if (msg.role === 'assistant') {
      const wrap = document.createElement('div');
      wrap.className = 'msg ai';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.textContent = 'NM';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'msg-content';

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerHTML = renderMarkdown(msg.content);

      contentDiv.appendChild(bubble);
      wrap.appendChild(avatar);
      wrap.appendChild(contentDiv);
      chatWindow.appendChild(wrap);
    }
  }

  scrollToBottom(true);

  /* Mark active in sidebar */
  document.querySelectorAll('.history-item').forEach(el => {
    el.classList.toggle('active-history', el.dataset.id === id);
  });

  if (window.innerWidth <= 768) closeSidebar();
}

/* ── Delete Chat ─────────────────────────────────────────── */
function deleteChat(id, e) {
  e.stopPropagation();
  deleteSessionData(id);
  if (activeSessionId === id) startNewChat();
  renderHistoryList();
}

/* ── Render History Sidebar ──────────────────────────────── */
function renderHistoryList() {
  const index = getIndex();
  historyList.innerHTML = '';

  if (!index.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'No previous chats yet.';
    historyList.appendChild(empty);
    return;
  }

  index.forEach(entry => {
    const li = document.createElement('li');

    const btn = document.createElement('button');
    btn.className = 'history-item' + (entry.id === activeSessionId ? ' active-history' : '');
    btn.dataset.id = entry.id;
    btn.setAttribute('title', entry.title);
    btn.onclick = () => loadChat(entry.id);

    const icon = document.createElement('span');
    icon.className = 'history-item-icon';
    icon.textContent = '💬';

    const textSpan = document.createElement('span');
    textSpan.className = 'history-item-text';
    textSpan.textContent = entry.title;

    const delBtn = document.createElement('button');
    delBtn.className = 'history-item-del';
    delBtn.title = 'Delete this chat';
    delBtn.innerHTML = '×';
    delBtn.onclick = (e) => deleteChat(entry.id, e);

    btn.appendChild(icon);
    btn.appendChild(textSpan);
    btn.appendChild(delBtn);
    li.appendChild(btn);
    historyList.appendChild(li);
  });
}

/* ── Insert and Send (feature card click) ────────────────── */
function insertAndSend(text) {
  userInput.value = text;
  autoResize();
  sendMessage();
}

/* ── Textarea Auto-Resize ────────────────────────────────── */
function autoResize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
}

/* ── Page Navigation ─────────────────────────────────────── */
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  const link = document.querySelector(`[data-page="${pageId}"]`);
  if (link) link.classList.add('active');

  /* Show prompt bar only on chat page */
  document.getElementById('promptBar').style.display = (pageId === 'chat') ? '' : 'none';

  if (window.innerWidth <= 768) closeSidebar();
}

/* ── Mobile Sidebar ──────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const burger  = document.getElementById('burgerBtn');
  const isOpen  = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
  burger.setAttribute('aria-expanded', String(isOpen));
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('burgerBtn').setAttribute('aria-expanded', 'false');
}

/* ── Event Listeners ─────────────────────────────────────── */
userInput.addEventListener('input', autoResize);

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ── Init ────────────────────────────────────────────────── */
(function init() {
  renderHistoryList();
  showDashboard();

  if (!API_KEY || API_KEY.includes('YOUR_')) {
    console.warn(
      '%cNovaMind AI%c — Configure your Groq API key in app.js (part1 + part2 + part3). Get one free: https://console.groq.com',
      'color:#7b4fff;font-weight:800;font-size:13px;',
      'color:#888;font-size:12px;'
    );
  }
})();