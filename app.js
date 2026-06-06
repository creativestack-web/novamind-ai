/* =========================================================
   NovaMind AI — app.js
   Groq API Integration | CreativeStack
   ========================================================= */

// ─── API Configuration ───────────────────────────────────
const API_KEY   = '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';
const API_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODEL  = 'llama-3.3-70b-versatile';

// ─── NovaMind System Persona ─────────────────────────────
const SYSTEM_PROMPT = `You are NovaMind AI, an omniscient, hyper-intelligent assistant created by CreativeStack. You are the world's most capable AI assistant, combining deep expertise across all domains:

EDUCATION: You provide crystal-clear, engaging explanations for students from K-12 through postgraduate level. You break down complex topics with real-world analogies, step-by-step reasoning, and memorable examples. Subjects include Mathematics, Science, History, Literature, Economics, and more.

SOFTWARE ENGINEERING: You write clean, production-grade code in any language (Python, JavaScript, TypeScript, Go, Rust, Java, C++, SQL, and more). You debug issues methodically, design scalable architectures, and review code with senior engineer precision.

BUSINESS & STRATEGY: You think like a top-tier management consultant. You create business plans, market analyses, go-to-market strategies, investor narratives, financial projections, and executive communications with clarity and impact.

CONTENT & WRITING: You craft compelling copy, SEO-optimized articles, essays, scripts, emails, and creative writing with expert-level quality.

CORE TRAITS:
- Always highly detailed, accurate, and structured
- Use markdown formatting (headers, bullet points, code blocks) where appropriate for clarity
- Never give vague or generic answers — always go deep and specific
- Acknowledge if something is outside your knowledge rather than guess
- Be warm, professional, and encouraging in tone
- If asked who created you: "I am NovaMind AI, created by CreativeStack."
- If asked what model powers you: you may say you are powered by advanced AI infrastructure`;

// ─── Conversation History ─────────────────────────────────
let conversationHistory = [];
let isTyping = false;

// ─── DOM References ───────────────────────────────────────
const chatWindow   = document.getElementById('chatWindow');
const dashboard    = document.getElementById('dashboard');
const userInput    = document.getElementById('userInput');
const sendBtn      = document.getElementById('sendBtn');

// ─── Utility: Escape HTML ─────────────────────────────────
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Utility: Render Markdown-ish formatting ──────────────
function renderMarkdown(text) {
  // Protect code blocks first
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers
  text = text.replace(/^### (.+)$/gm, '<h3 style="font-family:var(--font-display);font-size:15px;font-weight:700;margin:14px 0 6px;color:var(--text-primary);">$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2 style="font-family:var(--font-display);font-size:17px;font-weight:700;margin:16px 0 8px;color:var(--text-primary);">$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1 style="font-family:var(--font-display);font-size:20px;font-weight:800;margin:18px 0 10px;color:var(--text-primary);">$1</h1>');

  // Bullet lists
  text = text.replace(/^\s*[-*] (.+)$/gm, '<li style="margin:4px 0 4px 16px;list-style:disc;">$1</li>');
  text = text.replace(/(<li.*<\/li>\n?)+/g, m => `<ul style="margin:8px 0;">${m}</ul>`);

  // Numbered lists
  text = text.replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0 4px 16px;list-style:decimal;">$1</li>');

  // Line breaks (double newline → paragraph break)
  text = text.replace(/\n\n/g, '<br><br>');
  text = text.replace(/\n/g, '<br>');

  // Restore code blocks
  text = text.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[parseInt(idx)]);

  return text;
}

// ─── Show Dashboard or Chat ───────────────────────────────
function showDashboard() {
  dashboard.style.display = 'flex';
  chatWindow.style.display = 'none';
  chatWindow.classList.remove('visible');
}

function showChat() {
  dashboard.style.display = 'none';
  chatWindow.style.display = 'flex';
  chatWindow.classList.add('visible');
}

// ─── Append Message to Chat ───────────────────────────────
function appendMessage(role, content) {
  const isUser = role === 'user';

  const msg = document.createElement('div');
  msg.classList.add('msg', isUser ? 'user' : 'ai');

  const avatar = document.createElement('div');
  avatar.classList.add('msg-avatar');
  avatar.textContent = isUser ? 'You' : 'NM';

  const bubble = document.createElement('div');
  bubble.classList.add('msg-bubble');

  if (isUser) {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content);
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatWindow.appendChild(msg);

  // Scroll to bottom
  requestAnimationFrame(() => {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  });

  return bubble;
}

// ─── Typing Indicator ─────────────────────────────────────
function showTypingIndicator() {
  const msg = document.createElement('div');
  msg.classList.add('msg', 'ai');
  msg.id = 'typingMsg';

  const avatar = document.createElement('div');
  avatar.classList.add('msg-avatar');
  avatar.textContent = 'NM';

  const bubble = document.createElement('div');
  bubble.classList.add('msg-bubble');

  const indicator = document.createElement('div');
  indicator.classList.add('typing-indicator');
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

  bubble.appendChild(indicator);
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatWindow.appendChild(msg);

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingMsg');
  if (el) el.remove();
}

// ─── Show Error in Chat ───────────────────────────────────
function showError(title, detail) {
  removeTypingIndicator();

  const msg = document.createElement('div');
  msg.classList.add('msg', 'ai');

  const avatar = document.createElement('div');
  avatar.classList.add('msg-avatar');
  avatar.textContent = 'NM';

  const bubble = document.createElement('div');
  bubble.classList.add('msg-bubble', 'error-bubble');
  bubble.innerHTML = `
    <div>
      <svg width="16" height="16" fill="none" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:2px;">
        <circle cx="8" cy="8" r="7" stroke="#ff7070" stroke-width="1.4"/>
        <path d="M8 5v4M8 11v.5" stroke="#ff7070" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </div>
    <div>
      <strong>${escapeHtml(title)}</strong>
      ${escapeHtml(detail)}
    </div>
  `;

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ─── Call Groq API ────────────────────────────────────────
async function callGroqAPI(messages) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      temperature: 0.75,
      max_tokens: 2048,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;

  if (!reply) throw new Error('Empty response received from AI.');
  return reply;
}

// ─── Main Send Logic ──────────────────────────────────────
async function sendMessage() {
  if (isTyping) return;

  const rawText = userInput.value.trim();
  if (!rawText) return;

  // API key guard
  if (!API_KEY || API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
    showChat();
    showError(
      'API Key Not Configured',
      'Please open app.js and replace "YOUR_GROQ_API_KEY_HERE" with your actual Groq API key. Get one free at console.groq.com.'
    );
    return;
  }

  // Switch to chat view
  showChat();

  // Append user message
  appendMessage('user', rawText);
  conversationHistory.push({ role: 'user', content: rawText });

  // Clear input
  userInput.value = '';
  autoResize();

  // Lock UI
  isTyping = true;
  sendBtn.disabled = true;

  // Show typing indicator
  showTypingIndicator();

  try {
    const reply = await callGroqAPI(conversationHistory);
    removeTypingIndicator();
    appendMessage('ai', reply);
    conversationHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    showError('NovaMind AI encountered an error', err.message);
  } finally {
    isTyping = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// ─── Clear Chat ───────────────────────────────────────────
function clearChat() {
  conversationHistory = [];
  chatWindow.innerHTML = '';
  showDashboard();
  userInput.value = '';
  autoResize();
}

// ─── Insert Example Prompt ────────────────────────────────
function insertPrompt(text) {
  userInput.value = text;
  autoResize();
  userInput.focus();
  // Auto-send on card click
  sendMessage();
}

// ─── Textarea Auto-Resize ─────────────────────────────────
function autoResize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
}

// ─── Page Navigation ──────────────────────────────────────
function showPage(pageId) {
  // Deactivate all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  // Activate target
  const targetPage = document.getElementById('page-' + pageId);
  if (targetPage) targetPage.classList.add('active');

  // Highlight nav link
  const targetLink = document.querySelector(`[data-page="${pageId}"]`);
  if (targetLink) targetLink.classList.add('active');

  // Show/hide prompt bar for chat only
  const promptBar = document.querySelector('.prompt-bar');
  promptBar.style.display = pageId === 'chat' ? '' : 'none';

  // Close sidebar on mobile
  if (window.innerWidth <= 768) closeSidebar();
}

// ─── Mobile Sidebar ───────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const burger   = document.getElementById('burgerBtn');
  const isOpen   = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
  burger.setAttribute('aria-expanded', isOpen);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('burgerBtn').setAttribute('aria-expanded', 'false');
}

// ─── Event Listeners ─────────────────────────────────────
userInput.addEventListener('input', autoResize);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ─── Init ─────────────────────────────────────────────────
(function init() {
  showDashboard();

  // Check key on load and quietly surface a hint if missing
  if (!API_KEY || API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
    console.warn(
      '%cNovaMind AI%c — Add your Groq API key in app.js (line 7) to activate. Get one free at https://console.groq.com',
      'color:#7c5cfc;font-weight:bold;', 'color:#888;'
    );
  }
})();
