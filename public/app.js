/* ═══════════════════════════════════════════════════════════════════
   Nexora — app.js
   Chat state machine: mode switching, message rendering,
   typing indicator, Cheat Code dual-section parser,
   mode directive prepended to every request.
═══════════════════════════════════════════════════════════════════ */

'use strict';

// ── Mode configuration ────────────────────────────────────────────
const MODES = {
  mentor: {
    label: 'Mentor Mode',
    description:
      '<strong>Mentor Mode</strong> — I\'ll guide you step-by-step, explain concepts clearly, and check your understanding.',
    directive:
      "[Interface note: the user has selected 'Mentor Mode'. " +
      "Do NOT ask which mode to use. " +
      "Respond as a patient, step-by-step mentor: break down concepts thoroughly, " +
      "use clear explanations with examples, and guide the user toward understanding " +
      "rather than just providing answers. " +
      "Message from user below:]",
  },
  assistant: {
    label: 'AI Assistant Mode',
    description:
      '<strong>AI Assistant Mode</strong> — Quick, precise answers without extra ceremony.',
    directive:
      "[Interface note: the user has selected 'AI Assistant Mode'. " +
      "Do NOT ask which mode to use. " +
      "Respond concisely and directly. Give the most accurate, useful answer " +
      "without padding or step-by-step breakdowns unless explicitly requested. " +
      "Message from user below:]",
  },
  cheatcode: {
    label: 'Cheat Code Mode',
    description:
      '<strong>Cheat Code Mode</strong> — Instant short notes + an exam-ready cheat sheet.',
    directive:
      "[Interface note: the user has selected 'Cheat Code Mode'. " +
      "Do NOT ask which mode to use. " +
      "Your response MUST contain exactly two sections, in this order:\n\n" +
      "1. SHORT NOTES — a brief, readable summary of the key points (3–6 bullet points or a short paragraph).\n" +
      "2. EXAM-READY CHEAT SHEET — dense, structured revision notes: key terms, formulas, dates, or facts " +
      "formatted for rapid review.\n\n" +
      "Separate the two sections with exactly this delimiter on its own line: ---CHEATSHEET---\n\n" +
      "Do not include any preamble before the Short Notes section. " +
      "Message from user below:]",
  },
};

// ── App state ─────────────────────────────────────────────────────
let currentMode = 'mentor';
let conversationHistory = []; // array of { role, content } — full turn history
let isLoading = false;

// ── DOM references ────────────────────────────────────────────────
const chatMessages    = document.getElementById('chatMessages');
const typingIndicator = document.getElementById('typingIndicator');
const messageInput    = document.getElementById('messageInput');
const sendBtn         = document.getElementById('sendBtn');
const modeButtons     = document.querySelectorAll('.mode-btn');
const modeDescription = document.getElementById('modeDescription');
const currentModeLabel = document.getElementById('currentModeLabel');

// ── Mode switching ────────────────────────────────────────────────
function switchMode(newMode) {
  if (newMode === currentMode) return;

  const previousMode = currentMode;
  currentMode = newMode;

  // Update body data-mode (drives CSS custom properties)
  document.body.dataset.mode = newMode;

  // Update button states
  modeButtons.forEach(btn => {
    const isActive = btn.dataset.mode === newMode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // Update description strip
  modeDescription.innerHTML = MODES[newMode].description;

  // Update footer chip
  currentModeLabel.textContent = MODES[newMode].label;

  // Insert visual mode-switch marker in chat transcript
  insertModeSwitchMarker(MODES[newMode].label);
}

function insertModeSwitchMarker(label) {
  const marker = document.createElement('div');
  marker.className = 'mode-switch-marker';
  marker.setAttribute('role', 'status');
  marker.innerHTML = `<span>— Switched to ${escapeHtml(label)} —</span>`;
  chatMessages.appendChild(marker);
  scrollToBottom();
}

// ── Message sending ───────────────────────────────────────────────
async function sendMessage() {
  const rawText = messageInput.value.trim();
  if (!rawText || isLoading) return;

  // Build the user content that is shown in the UI (raw text only)
  const displayText = rawText;

  // Build the content actually sent to the AI (with mode directive prepended)
  const modeDirective = MODES[currentMode].directive;
  const aiContent = `${modeDirective}\n\n${rawText}`;

  // Clear input and resize
  messageInput.value = '';
  autoResizeTextarea();

  // Append user message to UI
  appendUserMessage(displayText);

  // Add to conversation history with the directive-bearing content
  conversationHistory.push({ role: 'user', content: aiContent });

  // Show loading state
  setLoading(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server error ${response.status}`);
    }

    const replyText = data.reply;

    // Append assistant reply to history
    conversationHistory.push({ role: 'assistant', content: replyText });

    // Render the reply
    if (currentMode === 'cheatcode') {
      appendCheatCodeMessage(replyText);
    } else {
      appendAssistantMessage(replyText);
    }
  } catch (err) {
    appendErrorMessage(err.message || 'Something went wrong. Please try again.');
    // Remove the last user message from history on failure so the user can retry
    if (conversationHistory[conversationHistory.length - 1]?.role === 'user') {
      conversationHistory.pop();
    }
  } finally {
    setLoading(false);
  }
}

// ── Message renderers ─────────────────────────────────────────────
function appendUserMessage(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message user-message';
  wrapper.innerHTML = `
    <div class="message-body">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
    <div class="message-avatar" aria-hidden="true">You</div>
  `;
  chatMessages.appendChild(wrapper);
  scrollToBottom();
}

function appendAssistantMessage(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message assistant-message';
  wrapper.innerHTML = `
    <div class="message-avatar" aria-hidden="true">✦</div>
    <div class="message-body">${renderMarkdown(text)}</div>
  `;
  chatMessages.appendChild(wrapper);
  scrollToBottom();
}

function appendCheatCodeMessage(text) {
  // Split on the sentinel delimiter the AI is instructed to use
  const SENTINEL = '---CHEATSHEET---';
  const parts = text.split(SENTINEL);

  const notesHtml  = renderMarkdown((parts[0] ?? text).trim());
  const sheetHtml  = parts.length > 1 ? renderMarkdown(parts[1].trim()) : null;
  const sheetPlain = parts.length > 1 ? parts[1].trim() : null;

  const wrapper = document.createElement('div');
  wrapper.className = 'message assistant-message';

  let bodyHtml = `<div class="cheat-sections">`;

  // Section 1: Short Notes
  bodyHtml += `
    <div class="cheat-section-notes">
      <div class="section-label">📝 Short Notes</div>
      ${notesHtml}
    </div>
  `;

  // Section 2: Exam-Ready Cheat Sheet (only if sentinel was present)
  if (sheetHtml) {
    bodyHtml += `
      <div class="cheat-section-sheet">
        <div class="cheat-sheet-header">
          <div class="section-label">📋 Exam-Ready Cheat Sheet</div>
          <button class="copy-btn" data-copy-target>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
        <div class="sheet-content">${sheetHtml}</div>
      </div>
    `;
  }

  bodyHtml += `</div>`;

  wrapper.innerHTML = `
    <div class="message-avatar" aria-hidden="true">✦</div>
    <div class="message-body">${bodyHtml}</div>
  `;

  // Attach copy handler
  if (sheetPlain) {
    const copyBtn = wrapper.querySelector('[data-copy-target]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyToClipboard(sheetPlain, copyBtn));
    }
  }

  chatMessages.appendChild(wrapper);
  scrollToBottom();
}

function appendErrorMessage(errorText) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message assistant-message error-message';
  wrapper.innerHTML = `
    <div class="message-avatar" aria-hidden="true">✦</div>
    <div class="message-body">
      <strong>Something went wrong</strong>
      <p>${escapeHtml(errorText)}</p>
      <p style="font-size:.8rem;color:var(--text-muted);margin-top:6px;">
        Check that your <code>.env</code> credentials are correct and the server is running.
      </p>
    </div>
  `;
  chatMessages.appendChild(wrapper);
  scrollToBottom();
}

// ── Loading / typing indicator ────────────────────────────────────
function setLoading(state) {
  isLoading = state;
  sendBtn.disabled = state;
  messageInput.disabled = state;
  typingIndicator.hidden = !state;
  typingIndicator.setAttribute('aria-hidden', String(!state));
  if (state) scrollToBottom();
}

// ── Clipboard helper ──────────────────────────────────────────────
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy
      `;
    }, 2200);
  } catch {
    // Fallback for browsers that block clipboard API
    btn.textContent = 'Unavailable';
  }
}

// ── Markdown renderer (minimal, no external lib) ──────────────────
// Handles: headings, bold, italic, inline code, code blocks,
// unordered/ordered lists, horizontal rules, blockquotes, line breaks.
function renderMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks (``` ... ```) — process before other patterns
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Headings (### ## #)
  html = html.replace(/^### (.+)$/gm,  '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,   '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,    '<h1>$1</h1>');

  // Horizontal rule
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold + italic ***text***
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text* or _text_
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Unordered lists (lines starting with - or *)
  html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, match => {
    // Wrap consecutive <li> blocks only if not already in a list
    return match;
  });
  // Wrap consecutive li elements in ul
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists (lines starting with 1. 2. etc.)
  html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, (match) => {
    return '<ol>' + match.replace(/<\/?oli>/g, m => m === '<oli>' ? '<li>' : '</li>') + '</ol>';
  });

  // Paragraphs: wrap lines not already in block-level tags
  const blockTags = /^<(h[1-6]|ul|ol|li|pre|blockquote|hr)/;
  const lines = html.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (blockTags.test(line.trim())) {
      result.push(line);
    } else {
      // Collect consecutive non-block, non-empty lines into one paragraph
      const paraLines = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !blockTags.test(lines[i + 1].trim())) {
        i++;
        paraLines.push(lines[i]);
      }
      result.push(`<p>${paraLines.join('<br>')}</p>`);
    }
    i++;
  }

  return result.join('\n');
}

// ── HTML escaping ─────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Auto-resize textarea ──────────────────────────────────────────
function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + 'px';
}

// ── Scroll chat to bottom ─────────────────────────────────────────
function scrollToBottom() {
  // Use requestAnimationFrame so DOM has been painted first
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ── Event listeners ───────────────────────────────────────────────

// Mode buttons
modeButtons.forEach(btn => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// Send on Enter (not Shift+Enter)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Send button click
sendBtn.addEventListener('click', sendMessage);

// Auto-resize textarea as user types
messageInput.addEventListener('input', autoResizeTextarea);

// ── Initialise ────────────────────────────────────────────────────
(function init() {
  document.body.dataset.mode = currentMode;
  messageInput.focus();
})();
