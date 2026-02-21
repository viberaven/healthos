// HealthOS Chat UI — SSE streaming, markdown rendering, inline Chart.js
// Builds AI context from local SQLite, stores chat history locally

(function () {
  let sessionId = `session_${Date.now()}`;
  let isStreaming = false;

  function renderChatFull(container) {
    container.innerHTML = `
      <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
          <div class="chat-bubble assistant">
            <p>Hi! I'm your health data assistant. Ask me anything about your WHOOP data — recovery trends, sleep quality, workout insights, or request a chart.</p>
          </div>
        </div>
        <div class="chat-input-area">
          <div class="chat-input-wrap">
            <textarea class="chat-input" id="chat-input" placeholder="Ask about your health data..." rows="1"></textarea>
            <button class="chat-send-btn" id="chat-send">Send</button>
          </div>
        </div>
      </div>
    `;

    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    sendBtn.addEventListener('click', doSend);

    function doSend() {
      const text = input.value.trim();
      if (!text || isStreaming) return;
      input.value = '';
      input.style.height = 'auto';
      addBubble('user', text);
      streamResponseWithCharts(text);
    }
  }

  function addBubble(role, content) {
    const messages = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;

    if (role === 'user') {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = renderMarkdownWithCharts(content);
    }

    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  // --- Markdown rendering ---

  const pendingChartConfigs = [];

  function renderMarkdownWithCharts(text) {
    pendingChartConfigs.length = 0;

    if (!text) return '';

    const chartBlocks = [];
    text = text.replace(/```chartjs\s*\n([\s\S]*?)```/g, (_, json) => {
      const trimmed = json.trim();
      chartBlocks.push(trimmed);
      pendingChartConfigs.push(trimmed);
      return `<div class="inline-chart" data-chart-index="${chartBlocks.length - 1}"><canvas></canvas></div>`;
    });

    const codeBlocks = [];
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      codeBlocks.push(code.trim());
      return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
    });

    const lines = text.split('\n');
    let html = '';
    let inList = false;
    let listType = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.startsWith('### ')) { html += `<h3>${inlineFormat(line.slice(4))}</h3>`; continue; }
      if (line.startsWith('## ')) { html += `<h2>${inlineFormat(line.slice(3))}</h2>`; continue; }
      if (line.startsWith('# ')) { html += `<h1>${inlineFormat(line.slice(2))}</h1>`; continue; }
      const ulMatch = line.match(/^[-*]\s+(.*)/);
      const olMatch = line.match(/^\d+\.\s+(.*)/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') { if (inList) html += `</${listType}>`; html += '<ul>'; inList = true; listType = 'ul'; }
        html += `<li>${inlineFormat(ulMatch[1])}</li>`; continue;
      } else if (olMatch) {
        if (!inList || listType !== 'ol') { if (inList) html += `</${listType}>`; html += '<ol>'; inList = true; listType = 'ol'; }
        html += `<li>${inlineFormat(olMatch[1])}</li>`; continue;
      } else if (inList) { html += `</${listType}>`; inList = false; }
      if (line.includes('inline-chart')) { html += line; continue; }
      if (line.trim() === '') continue;
      html += `<p>${inlineFormat(line)}</p>`;
    }
    if (inList) html += `</${listType}>`;

    html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
      return `<pre style="background:rgba(0,0,0,0.3);padding:0.75rem;border-radius:0.5rem;overflow-x:auto;margin:0.5rem 0"><code>${escapeHtml(codeBlocks[parseInt(idx)])}</code></pre>`;
    });

    return html;
  }

  function inlineFormat(text) {
    text = escapeHtml(text);
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');
    return text;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Inline Chart.js rendering ---

  function renderInlineChartsFromConfigs(bubble) {
    const chartDivs = bubble.querySelectorAll('.inline-chart');
    chartDivs.forEach(div => {
      const index = parseInt(div.dataset.chartIndex);
      const canvas = div.querySelector('canvas');
      if (!canvas || !pendingChartConfigs[index]) return;

      try {
        const config = JSON.parse(pendingChartConfigs[index]);
        applyDarkTheme(config);
        new Chart(canvas, config);
      } catch (err) {
        console.error('Failed to render inline chart:', err);
        div.innerHTML = `<p class="text-red-400 text-xs">Chart render error</p>`;
      }
    });
  }

  function applyDarkTheme(config) {
    if (!config.options) config.options = {};
    config.options.responsive = true;
    config.options.maintainAspectRatio = false;

    if (!config.options.plugins) config.options.plugins = {};
    if (!config.options.plugins.legend) config.options.plugins.legend = {};
    if (!config.options.plugins.legend.labels) config.options.plugins.legend.labels = {};
    config.options.plugins.legend.labels.color = '#9ca3af';

    if (config.options.scales) {
      for (const scale of Object.values(config.options.scales)) {
        if (!scale.ticks) scale.ticks = {};
        scale.ticks.color = '#6b7280';
        if (!scale.grid) scale.grid = {};
        scale.grid.color = 'rgba(255,255,255,0.06)';
      }
    }
  }

  // --- Stream response with local context ---

  async function streamResponseWithCharts(message) {
    isStreaming = true;
    const sendBtn = document.getElementById('chat-send');
    sendBtn.disabled = true;

    const messages = document.getElementById('chat-messages');
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble assistant';
    typingBubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messages.appendChild(typingBubble);
    messages.scrollTop = messages.scrollHeight;

    let fullText = '';

    try {
      // Build context and history from local DB
      const context = window.healthDB.getAIContext();
      const historyRows = window.healthDB.getChatHistory(sessionId, 20);
      const history = historyRows.map(h => ({ role: h.role, content: h.content }));

      // Save user message locally
      window.healthDB.saveChatMessage(sessionId, 'user', message);

      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId, context, history }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      typingBubble.innerHTML = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') {
              fullText += event.content;
              typingBubble.innerHTML = renderMarkdownWithCharts(fullText);
              messages.scrollTop = messages.scrollHeight;
            } else if (event.type === 'error') {
              typingBubble.innerHTML += `<p class="text-red-400">Error: ${event.content}</p>`;
            } else if (event.type === 'done') {
              if (event.sessionId) sessionId = event.sessionId;
            }
          } catch { /* skip malformed */ }
        }
      }

      // Final render with charts
      typingBubble.innerHTML = renderMarkdownWithCharts(fullText);
      renderInlineChartsFromConfigs(typingBubble);
      messages.scrollTop = messages.scrollHeight;

      // Save assistant response locally
      if (fullText) {
        window.healthDB.saveChatMessage(sessionId, 'assistant', fullText);
        window.healthDB.persistDb();
      }
    } catch (err) {
      typingBubble.innerHTML = `<p class="text-red-400">Failed to get response: ${err.message}</p>`;
    }

    isStreaming = false;
    sendBtn.disabled = false;
    document.getElementById('chat-input')?.focus();
  }

  window.healthOS.renderChat = renderChatFull;
})();
