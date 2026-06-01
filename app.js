/**
 * app.js — NovaMind AI Core Logic
 * Multi-chat state, LocalStorage persistence, Gemini API (gemini-1.5-flash),
 * Image upload & base64 conversion, Markdown rendering, Auto-scroll.
 */

import { GoogleGenerativeAI } from 'https://esm.run/@google/generative-ai';

/* ================================================================
   CONFIG & CONSTANTS
   ================================================================ */
const API_KEY       = '';
const MODEL_NAME    = 'gemini-1.5-flash';
const LS_KEY_CHATS  = 'novamind_chats';
const LS_KEY_ACTIVE = 'novamind_active_chat';

/* ================================================================
   GEMINI CLIENT
   ================================================================ */
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

/* ================================================================
   APP STATE
   ================================================================ */
let state = {
  chats: {},          // { [chatId]: { id, title, messages: [], createdAt } }
  activeChatId: null,
  uploadedImage: null, // { base64, mimeType, name, previewUrl }
  isStreaming: false,
};

/* ================================================================
   DOM REFERENCES
   ================================================================ */
const dom = {
  sidebar:            document.getElementById('sidebar'),
  sidebarOverlay:     document.getElementById('sidebar-overlay'),
  sidebarToggleBtn:   document.getElementById('sidebar-toggle-btn'),
  sidebarCloseBtn:    document.getElementById('sidebar-close-btn'),
  newChatBtn:         document.getElementById('new-chat-btn'),
  chatHistoryList:    document.getElementById('chat-history-list'),
  noChatsPlaceholder: document.getElementById('no-chats-placeholder'),
  chatTitle:          document.getElementById('chat-title'),
  chatSubtitle:       document.getElementById('chat-subtitle'),
  clearChatBtn:       document.getElementById('clear-chat-btn'),
  chatDisplay:        document.getElementById('chat-display'),
  welcomeScreen:      document.getElementById('welcome-screen'),
  messagesContainer:  document.getElementById('messages-container'),
  thinkingIndicator:  document.getElementById('thinking-indicator'),
  attachBtn:          document.getElementById('attach-btn'),
  fileInput:          document.getElementById('file-input'),
  messageInput:       document.getElementById('message-input'),
  sendBtn:            document.getElementById('send-btn'),
  imagePreviewBar:    document.getElementById('image-preview-bar'),
  imageChip:          document.getElementById('image-chip'),
  imagePreviewThumb:  document.getElementById('image-preview-thumb'),
  imagePreviewName:   document.getElementById('image-preview-name'),
  removeImageBtn:     document.getElementById('remove-image-btn'),
  toast:              document.getElementById('toast'),
  toastMessage:       document.getElementById('toast-message'),
  suggestionPills:    document.querySelectorAll('.suggestion-pill'),
};

/* ================================================================
   UTILS
   ================================================================ */
/** Generate a unique ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Get current timestamp formatted */
function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Truncate text to N words */
function truncateWords(text, n = 6) {
  const words = text.trim().split(/\s+/);
  return words.slice(0, n).join(' ') + (words.length > n ? '…' : '');
}

/** Show toast notification */
let toastTimer = null;
function showToast(message, duration = 2500) {
  dom.toastMessage.textContent = message;
  dom.toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), duration);
}

/** Ripple click effect */
function addRipple(element, event) {
  const circle = document.createElement('span');
  circle.classList.add('ripple-circle');
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  circle.style.width  = circle.style.height = `${size}px`;
  circle.style.left = `${event.clientX - rect.left - size / 2}px`;
  circle.style.top  = `${event.clientY - rect.top  - size / 2}px`;
  element.appendChild(circle);
  circle.addEventListener('animationend', () => circle.remove());
}

/** Escape HTML to prevent XSS in code blocks */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ================================================================
   MARKDOWN RENDERER
   Handles: headings, bold, italic, code blocks, inline code,
   blockquotes, lists, tables, links, horizontal rules.
   ================================================================ */
function renderMarkdown(text) {
  let html = text;

  // Protect code blocks first (replace placeholders)
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const language = lang || 'code';
    const escapedCode = escapeHtml(code.trim());
    codeBlocks.push(`
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-label">${language}</span>
          <button class="code-copy-btn" onclick="copyCode(this)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy
          </button>
        </div>
        <pre><code>${escapedCode}</code></pre>
      </div>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  html = html.replace(/__(.+?)__/g,          '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g,            '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '<hr>');

  // Unordered lists (- or *)
  html = html.replace(/^[-*+] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Simple table support
  html = html.replace(/^\|(.+)\|$/gm, (line) => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
  });
  // Convert separator rows (| --- | --- |)
  html = html.replace(/<tr>(<td>[-:]+<\/td>)+<\/tr>/g, '');
  // Wrap tables
  if (html.includes('<tr>')) {
    html = html.replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, (match) => {
      const rows = match.trim().split('\n').filter(Boolean);
      if (!rows.length) return match;
      const header = rows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
      const body   = rows.slice(1).join('\n');
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    });
  }

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Paragraphs: wrap double newlines
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Single newlines → <br> inside paragraphs
  html = html.replace(/(?<!>)\n(?!<)/g, '<br>');

  // Remove empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, block);
  });

  return html;
}

/** Global code copy handler (attached to window for onclick access) */
window.copyCode = async function(btn) {
  const pre  = btn.closest('.code-block-wrapper').querySelector('pre code');
  const code = pre.textContent;
  try {
    await navigator.clipboard.writeText(code);
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    btn.style.color = '#22d3ee';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
  } catch {
    showToast('Could not copy to clipboard.');
  }
};

/* ================================================================
   LOCAL STORAGE
   ================================================================ */
function saveToLocalStorage() {
  try {
    localStorage.setItem(LS_KEY_CHATS,  JSON.stringify(state.chats));
    localStorage.setItem(LS_KEY_ACTIVE, state.activeChatId || '');
  } catch (e) {
    console.warn('LocalStorage write failed:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const chatsJSON  = localStorage.getItem(LS_KEY_CHATS);
    const activeChatId = localStorage.getItem(LS_KEY_ACTIVE);
    if (chatsJSON) {
      state.chats = JSON.parse(chatsJSON);
    }
    if (activeChatId && state.chats[activeChatId]) {
      state.activeChatId = activeChatId;
    }
  } catch (e) {
    console.warn('LocalStorage read failed:', e);
    state.chats = {};
    state.activeChatId = null;
  }
}

/* ================================================================
   CHAT MANAGEMENT
   ================================================================ */
function createNewChat() {
  const id = uid();
  state.chats[id] = {
    id,
    title:     'New Conversation',
    messages:  [],
    createdAt: Date.now(),
  };
  state.activeChatId = id;
  saveToLocalStorage();
  return id;
}

function setActiveChat(chatId) {
  state.activeChatId = chatId;
  saveToLocalStorage();
}

function deleteChat(chatId) {
  const wasActive = (state.activeChatId === chatId);
  delete state.chats[chatId];
  if (wasActive) {
    const remaining = Object.keys(state.chats);
    state.activeChatId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
  }
  saveToLocalStorage();
}

function getActiveChat() {
  if (!state.activeChatId || !state.chats[state.activeChatId]) return null;
  return state.chats[state.activeChatId];
}

function addMessageToChat(chatId, role, text, imageMeta = null) {
  if (!state.chats[chatId]) return;
  const msg = {
    id:        uid(),
    role,
    text,
    imageMeta, // { previewUrl, name } or null
    timestamp: timestamp(),
  };
  state.chats[chatId].messages.push(msg);

  // Auto-title the chat from first user message
  if (role === 'user' && state.chats[chatId].messages.filter(m => m.role === 'user').length === 1) {
    state.chats[chatId].title = truncateWords(text || 'Image conversation', 6);
  }

  saveToLocalStorage();
  return msg;
}

/* ================================================================
   SIDEBAR RENDERING
   ================================================================ */
function renderSidebar() {
  // Remove all history items (keep placeholder in DOM but manage visibility)
  const items = dom.chatHistoryList.querySelectorAll('.chat-history-item');
  items.forEach(el => el.remove());

  const chatIds = Object.keys(state.chats).sort((a, b) => {
    return (state.chats[b].createdAt || 0) - (state.chats[a].createdAt || 0);
  });

  if (chatIds.length === 0) {
    dom.noChatsPlaceholder.classList.remove('hidden');
    // re-render icons
    lucide.createIcons({ nodes: [dom.noChatsPlaceholder] });
    return;
  }

  dom.noChatsPlaceholder.classList.add('hidden');

  chatIds.forEach(chatId => {
    const chat = state.chats[chatId];
    const isActive = chatId === state.activeChatId;
    const item = document.createElement('div');
    item.className = `chat-history-item${isActive ? ' active' : ''}`;
    item.dataset.chatId = chatId;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Open chat: ${chat.title}`);
    item.innerHTML = `
      <i data-lucide="message-square" class="item-icon w-3.5 h-3.5 flex-shrink-0"></i>
      <span class="item-title">${escapeHtml(chat.title)}</span>
      <button class="item-delete" data-chat-id="${chatId}" aria-label="Delete chat" title="Delete">
        <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
      </button>
    `;
    dom.chatHistoryList.insertBefore(item, dom.noChatsPlaceholder);
    lucide.createIcons({ nodes: [item] });

    // Click to open chat
    item.addEventListener('click', (e) => {
      if (e.target.closest('.item-delete')) return;
      switchToChat(chatId);
      closeMobileSidebar();
    });

    // Keyboard open
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchToChat(chatId);
        closeMobileSidebar();
      }
    });

    // Delete button
    item.querySelector('.item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteChat(chatId);
    });
  });
}

/* ================================================================
   MESSAGE RENDERING
   ================================================================ */
function renderMessages() {
  const chat = getActiveChat();

  if (!chat || chat.messages.length === 0) {
    showWelcomeScreen();
    updateChatHeader('New Conversation');
    return;
  }

  hideWelcomeScreen();
  dom.messagesContainer.innerHTML = '';

  chat.messages.forEach(msg => {
    const el = buildMessageElement(msg);
    dom.messagesContainer.appendChild(el);
  });

  // Re-init icons in messages
  lucide.createIcons({ nodes: [dom.messagesContainer] });
  scrollToBottom();
}

function buildMessageElement(msg) {
  const isUser = msg.role === 'user';
  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user-row' : 'ai-row'}`;
  row.dataset.messageId = msg.id;

  // Avatar HTML
  const avatarHtml = isUser
    ? `<div class="user-avatar">Y</div>`
    : `<div class="ai-avatar"><div class="ai-avatar-inner"></div></div>`;

  // Image HTML (if user uploaded one with this message)
  let imageHtml = '';
  if (msg.imageMeta && msg.imageMeta.previewUrl) {
    imageHtml = `<img src="${msg.imageMeta.previewUrl}" alt="Uploaded: ${escapeHtml(msg.imageMeta.name || 'image')}" class="bubble-image" />`;
  }

  // Text content
  const bubbleContent = isUser
    ? `<div class="bubble-text">${imageHtml}${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>`
    : `<div class="bubble-text">${imageHtml}${renderMarkdown(msg.text)}</div>`;

  // Action buttons for AI
  const actionsHtml = isUser ? '' : `
    <div class="bubble-actions">
      <button class="bubble-action-btn" onclick="copyBubbleText(this)" title="Copy response">
        <i data-lucide="copy" style="width:12px;height:12px;"></i> Copy
      </button>
    </div>`;

  row.innerHTML = `
    ${avatarHtml}
    <div class="bubble-content">
      <div class="bubble-meta">${isUser ? 'You' : 'NovaMind'} · ${msg.timestamp || ''}</div>
      <div class="bubble ${isUser ? 'user-bubble' : 'ai-bubble'}">${bubbleContent}</div>
      ${actionsHtml}
    </div>
  `;

  return row;
}

/** Copy AI bubble text to clipboard */
window.copyBubbleText = async function(btn) {
  const bubble = btn.closest('.bubble-content').querySelector('.bubble-text');
  const text = bubble.innerText;
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width:12px;height:12px;"></i> Copied!`;
    btn.style.color = '#22d3ee';
    lucide.createIcons({ nodes: [btn] });
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.color = '';
      lucide.createIcons({ nodes: [btn] });
    }, 2000);
  } catch {
    showToast('Could not copy text.');
  }
};

/* ================================================================
   WELCOME SCREEN & HEADER
   ================================================================ */
function showWelcomeScreen() {
  dom.welcomeScreen.classList.remove('hidden');
  dom.messagesContainer.classList.add('hidden');
  dom.chatDisplay.classList.remove('has-messages');
}

function hideWelcomeScreen() {
  dom.welcomeScreen.classList.add('hidden');
  dom.messagesContainer.classList.remove('hidden');
  dom.chatDisplay.classList.add('has-messages');
}

function updateChatHeader(title) {
  dom.chatTitle.textContent = title || 'New Conversation';
}

/* ================================================================
   SWITCH CHAT
   ================================================================ */
function switchToChat(chatId) {
  if (!state.chats[chatId]) return;
  setActiveChat(chatId);
  clearImageUpload();
  renderMessages();
  renderSidebar();
  updateChatHeader(state.chats[chatId].title);
}

/* ================================================================
   DELETE CHAT
   ================================================================ */
function handleDeleteChat(chatId) {
  deleteChat(chatId);
  if (state.activeChatId) {
    switchToChat(state.activeChatId);
  } else {
    // No chats left
    dom.messagesContainer.innerHTML = '';
    showWelcomeScreen();
    updateChatHeader('New Conversation');
  }
  renderSidebar();
  showToast('Conversation deleted');
}

/* ================================================================
   NEW CHAT
   ================================================================ */
function handleNewChat() {
  const chatId = createNewChat();
  switchToChat(chatId);
  dom.messageInput.focus();
}

/* ================================================================
   CLEAR CURRENT CHAT
   ================================================================ */
function handleClearChat() {
  const chat = getActiveChat();
  if (!chat || chat.messages.length === 0) {
    showToast('Nothing to clear');
    return;
  }
  chat.messages = [];
  chat.title = 'New Conversation';
  saveToLocalStorage();
  renderMessages();
  renderSidebar();
  updateChatHeader('New Conversation');
  showToast('Chat cleared');
}

/* ================================================================
   IMAGE UPLOAD & BASE64
   ================================================================ */
dom.attachBtn.addEventListener('click', () => dom.fileInput.click());

dom.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    showToast('Only JPG, PNG, WEBP, GIF images are supported.');
    dom.fileInput.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    showToast('Image must be smaller than 10 MB.');
    dom.fileInput.value = '';
    return;
  }

  try {
    const { base64, previewUrl } = await fileToBase64(file);
    state.uploadedImage = {
      base64,
      mimeType:   file.type,
      name:       file.name,
      previewUrl,
    };
    showImagePreview(previewUrl, file.name);
  } catch (err) {
    console.error('Image read error:', err);
    showToast('Failed to read image file.');
  }
  dom.fileInput.value = '';
});

/** Convert File to base64 + object URL */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      // reader.result is "data:<mime>;base64,<data>"
      const base64 = reader.result.split(',')[1];
      const previewUrl = URL.createObjectURL(file);
      resolve({ base64, previewUrl });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function showImagePreview(previewUrl, name) {
  dom.imagePreviewThumb.src = previewUrl;
  dom.imagePreviewName.textContent = name;
  dom.imagePreviewBar.classList.remove('hidden');
}

function clearImageUpload() {
  if (state.uploadedImage?.previewUrl) {
    URL.revokeObjectURL(state.uploadedImage.previewUrl);
  }
  state.uploadedImage = null;
  dom.imagePreviewBar.classList.add('hidden');
  dom.imagePreviewThumb.src = '';
  dom.imagePreviewName.textContent = '';
  dom.fileInput.value = '';
}

dom.removeImageBtn.addEventListener('click', () => {
  clearImageUpload();
  showToast('Image removed');
});

/* ================================================================
   TEXTAREA AUTO-RESIZE & SEND BUTTON STATE
   ================================================================ */
dom.messageInput.addEventListener('input', () => {
  // Auto-resize
  dom.messageInput.style.height = 'auto';
  dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 200) + 'px';
  // Enable/disable send
  updateSendButton();
});

dom.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!dom.sendBtn.disabled) handleSend();
  }
});

function updateSendButton() {
  const hasText  = dom.messageInput.value.trim().length > 0;
  const hasImage = !!state.uploadedImage;
  dom.sendBtn.disabled = (!hasText && !hasImage) || state.isStreaming;
}

/* ================================================================
   SEND MESSAGE
   ================================================================ */
dom.sendBtn.addEventListener('click', handleSend);

async function handleSend() {
  if (state.isStreaming) return;

  const text       = dom.messageInput.value.trim();
  const imageMeta  = state.uploadedImage;

  if (!text && !imageMeta) return;

  // Ensure there's an active chat
  if (!state.activeChatId || !state.chats[state.activeChatId]) {
    createNewChat();
  }

  const chatId = state.activeChatId;

  // Clear input
  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  updateSendButton();

  // Preserve image preview data before clearing
  const sentImage = imageMeta
    ? { previewUrl: imageMeta.previewUrl, name: imageMeta.name, base64: imageMeta.base64, mimeType: imageMeta.mimeType }
    : null;

  // Clear image chip
  if (imageMeta) clearImageUpload();

  // Add user message to state
  const userMsg = addMessageToChat(chatId, 'user', text || '📎 Image', sentImage
    ? { previewUrl: sentImage.previewUrl, name: sentImage.name }
    : null);

  // Show message
  hideWelcomeScreen();
  const userEl = buildMessageElement(userMsg);
  dom.messagesContainer.appendChild(userEl);
  lucide.createIcons({ nodes: [userEl] });
  scrollToBottom();

  // Update header / sidebar title
  updateChatHeader(state.chats[chatId].title);
  renderSidebar();

  // Show thinking indicator
  showThinking();
  state.isStreaming = true;
  updateSendButton();

  try {
    // Build Gemini request parts
    const parts = [];

    if (sentImage) {
      parts.push({
        inlineData: {
          mimeType: sentImage.mimeType,
          data:     sentImage.base64,
        },
      });
    }

    if (text) {
      parts.push({ text });
    } else if (!sentImage) {
      parts.push({ text: 'Hello' });
    }

    // Build conversation history for multi-turn context
    const history = buildGeminiHistory(chatId, userMsg.id);

    let aiResponseText = '';

    if (history.length > 0) {
      // Multi-turn with history
      const chat = model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature:     0.85,
          topP:            0.95,
        },
      });

      // Build content for current message
      const currentContent = parts.length > 0 ? parts : [{ text: '' }];
      const result = await chat.sendMessageStream(currentContent);

      // Stream output
      const aiEl = appendStreamingBubble();
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        aiResponseText += chunkText;
        updateStreamingBubble(aiEl, aiResponseText);
      }
      finalizeStreamingBubble(aiEl);
    } else {
      // First message (no history)
      const result = await model.generateContentStream(parts.length > 1 ? parts : (parts[0] ? [parts[0]] : [{ text: '' }]));

      const aiEl = appendStreamingBubble();
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        aiResponseText += chunkText;
        updateStreamingBubble(aiEl, aiResponseText);
      }
      finalizeStreamingBubble(aiEl);
    }

    // Persist AI response
    addMessageToChat(chatId, 'assistant', aiResponseText);
    renderSidebar();

  } catch (err) {
    console.error('Gemini API error:', err);
    hideThinking();
    const errorText = extractErrorMessage(err);
    appendErrorBubble(errorText);
    addMessageToChat(chatId, 'assistant', `⚠️ ${errorText}`);
  } finally {
    state.isStreaming = false;
    updateSendButton();
    hideThinking();
  }
}

/** Build Gemini-compatible history array (exclude the latest user message) */
function buildGeminiHistory(chatId, latestUserMsgId) {
  const chat = state.chats[chatId];
  if (!chat || chat.messages.length < 2) return [];

  // All messages except the very last one (which we're sending now)
  const prior = chat.messages.filter(m => m.id !== latestUserMsgId);

  return prior.map(msg => ({
    role:  msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text || '' }],
  }));
}

/* ================================================================
   STREAMING BUBBLE HELPERS
   ================================================================ */
function showThinking() {
  dom.thinkingIndicator.classList.remove('hidden');
  scrollToBottom();
}

function hideThinking() {
  dom.thinkingIndicator.classList.add('hidden');
}

function appendStreamingBubble() {
  hideThinking();

  const row = document.createElement('div');
  row.className = 'message-row ai-row';

  row.innerHTML = `
    <div class="ai-avatar"><div class="ai-avatar-inner"></div></div>
    <div class="bubble-content">
      <div class="bubble-meta">NovaMind · ${timestamp()}</div>
      <div class="bubble ai-bubble">
        <div class="bubble-text streaming-text"></div>
      </div>
      <div class="bubble-actions">
        <button class="bubble-action-btn" onclick="copyBubbleText(this)" title="Copy response">
          <i data-lucide="copy" style="width:12px;height:12px;"></i> Copy
        </button>
      </div>
    </div>
  `;

  dom.messagesContainer.appendChild(row);
  lucide.createIcons({ nodes: [row] });
  scrollToBottom();
  return row;
}

function updateStreamingBubble(rowEl, text) {
  const textEl = rowEl.querySelector('.streaming-text');
  if (textEl) {
    textEl.innerHTML = renderMarkdown(text);
    textEl.classList.add('streaming-cursor');
  }
  scrollToBottom();
}

function finalizeStreamingBubble(rowEl) {
  const textEl = rowEl.querySelector('.streaming-text');
  if (textEl) {
    textEl.classList.remove('streaming-cursor');
  }
}

function appendErrorBubble(message) {
  const row = document.createElement('div');
  row.className = 'message-row ai-row';
  row.innerHTML = `
    <div class="ai-avatar"><div class="ai-avatar-inner"></div></div>
    <div class="bubble-content">
      <div class="bubble-meta">NovaMind · ${timestamp()}</div>
      <div class="bubble ai-bubble" style="border-color: rgba(239,68,68,0.3);">
        <div class="bubble-text" style="color: #fca5a5;">
          <p>⚠️ ${escapeHtml(message)}</p>
          <p style="font-size:0.8rem;opacity:0.7;margin-top:0.5rem;">Please check your API key or try again.</p>
        </div>
      </div>
    </div>
  `;
  dom.messagesContainer.appendChild(row);
  scrollToBottom();
}

function extractErrorMessage(err) {
  if (err?.message) {
    if (err.message.includes('API_KEY')) return 'Invalid API key. Please check your configuration.';
    if (err.message.includes('quota'))   return 'API quota exceeded. Please try again later.';
    if (err.message.includes('network')) return 'Network error. Please check your connection.';
    return err.message.slice(0, 120);
  }
  return 'An unexpected error occurred.';
}

/* ================================================================
   AUTO-SCROLL
   ================================================================ */
function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    dom.chatDisplay.scrollTo({
      top:      dom.chatDisplay.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    });
  });
}

/* ================================================================
   SIDEBAR TOGGLE
   ================================================================ */
dom.sidebarToggleBtn.addEventListener('click', () => {
  const isMobile = window.innerWidth < 1024;
  if (isMobile) {
    openMobileSidebar();
  } else {
    dom.sidebar.classList.toggle('collapsed');
  }
});

dom.sidebarCloseBtn?.addEventListener('click', closeMobileSidebar);
dom.sidebarOverlay.addEventListener('click', closeMobileSidebar);

function openMobileSidebar() {
  dom.sidebar.classList.add('mobile-open');
  dom.sidebarOverlay.classList.add('active');
  dom.sidebarOverlay.classList.remove('hidden');
}

function closeMobileSidebar() {
  dom.sidebar.classList.remove('mobile-open');
  dom.sidebarOverlay.classList.remove('active');
  dom.sidebarOverlay.classList.add('hidden');
}

/* ================================================================
   NEW CHAT BUTTON
   ================================================================ */
dom.newChatBtn.addEventListener('click', (e) => {
  addRipple(dom.newChatBtn, e);
  handleNewChat();
  closeMobileSidebar();
});

/* ================================================================
   CLEAR CHAT BUTTON
   ================================================================ */
dom.clearChatBtn.addEventListener('click', handleClearChat);

/* ================================================================
   SUGGESTION PILLS
   ================================================================ */
dom.suggestionPills.forEach(pill => {
  pill.addEventListener('click', (e) => {
    const prompt = pill.dataset.prompt;
    if (!prompt) return;
    addRipple(pill, e);
    dom.messageInput.value = prompt;
    dom.messageInput.style.height = 'auto';
    dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 200) + 'px';
    updateSendButton();
    dom.messageInput.focus();
    handleSend();
  });
});

/* ================================================================
   KEYBOARD SHORTCUTS
   ================================================================ */
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl+K → New Chat
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    handleNewChat();
  }
  // Escape → close mobile sidebar
  if (e.key === 'Escape') {
    closeMobileSidebar();
  }
});

/* ================================================================
   INIT
   ================================================================ */
function init() {
  // Load persisted data
  loadFromLocalStorage();

  // If there's an active chat, render it; else create a fresh one
  if (state.activeChatId && state.chats[state.activeChatId]) {
    renderMessages();
    updateChatHeader(state.chats[state.activeChatId].title);
  } else {
    // Don't auto-create — just show welcome with no active chat
    state.activeChatId = null;
    showWelcomeScreen();
    updateChatHeader('New Conversation');
  }

  renderSidebar();
  dom.messageInput.focus();
  updateSendButton();

  // Init Lucide icons (fallback)
  lucide.createIcons();
}

/* Run */
init();
