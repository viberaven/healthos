// HealthOS Chat UI — SSE streaming, markdown rendering, inline Chart.js

(function () {
  let sessionId = `session_${Date.now()}`;
  let isStreaming = false;

  function renderChat(container) {
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

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Send on Enter (shift+enter for newline)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || isStreaming) return;

      input.value = '';
      input.style.height = 'auto';
      addBubble('user', text);
      await streamResponse(text);
    }
  }

  function addBubble(role, content) {
    const messages = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;

    if (role === 'user') {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = renderMarkdown(content);
    }

    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  async function streamResponse(message) {
    isStreaming = true;
    const sendBtn = document.getElementById('chat-send');
    sendBtn.disabled = true;

    // Add typing indicator
    const messages = document.getElementById('chat-messages');
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble assistant';
    typingBubble.id = 'typing-bubble';
    typingBubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    messages.appendChild(typingBubble);
    messages.scrollTop = messages.scrollHeight;

    let fullText = '';

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Replace typing indicator with actual response bubble
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
              typingBubble.innerHTML = renderMarkdown(fullText);
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
      typingBubble.innerHTML = renderMarkdown(fullText);
      renderInlineCharts(typingBubble);
      messages.scrollTop = messages.scrollHeight;
    } catch (err) {
      typingBubble.innerHTML = `<p class="text-red-400">Failed to get response: ${err.message}</p>`;
    }

    isStreaming = false;
    sendBtn.disabled = false;
    document.getElementById('chat-input')?.focus();
  }

  // --- Markdown rendering (basic) ---

  function renderMarkdown(text) {
    if (!text) return '';

    // Extract chartjs code blocks and replace with placeholders
    const chartBlocks = [];
    text = text.replace(/```chartjs\s*\n([\s\S]*?)```/g, (_, json) => {
      chartBlocks.push(json.trim());
      return `<div class="inline-chart" data-chart-index="${chartBlocks.length - 1}"><canvas></canvas></div>`;
    });

    // Remove other code blocks temporarily
    const codeBlocks = [];
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      codeBlocks.push(code.trim());
      return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
    });

    // Process line by line
    const lines = text.split('\n');
    let html = '';
    let inList = false;
    let listType = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Headers
      if (line.startsWith('### ')) { html += `<h3>${inlineFormat(line.slice(4))}</h3>`; continue; }
      if (line.startsWith('## ')) { html += `<h2>${inlineFormat(line.slice(3))}</h2>`; continue; }
      if (line.startsWith('# ')) { html += `<h1>${inlineFormat(line.slice(2))}</h1>`; continue; }

      // List items
      const ulMatch = line.match(/^[-*]\s+(.*)/);
      const olMatch = line.match(/^\d+\.\s+(.*)/);

      if (ulMatch) {
        if (!inList || listType !== 'ul') { if (inList) html += `</${listType}>`; html += '<ul>'; inList = true; listType = 'ul'; }
        html += `<li>${inlineFormat(ulMatch[1])}</li>`;
        continue;
      } else if (olMatch) {
        if (!inList || listType !== 'ol') { if (inList) html += `</${listType}>`; html += '<ol>'; inList = true; listType = 'ol'; }
        html += `<li>${inlineFormat(olMatch[1])}</li>`;
        continue;
      } else if (inList) {
        html += `</${listType}>`;
        inList = false;
      }

      // Chart placeholder (pass through)
      if (line.includes('inline-chart')) { html += line; continue; }

      // Empty line
      if (line.trim() === '') { continue; }

      // Paragraph
      html += `<p>${inlineFormat(line)}</p>`;
    }

    if (inList) html += `</${listType}>`;

    // Restore code blocks
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

  function renderInlineCharts(bubble) {
    const chartDivs = bubble.querySelectorAll('.inline-chart');
    chartDivs.forEach(div => {
      const index = parseInt(div.dataset.chartIndex);
      const canvas = div.querySelector('canvas');
      if (!canvas) return;

      // Find the chart config from the original text
      const configText = extractChartConfig(bubble.innerHTML, index);
      if (!configText) return;

      try {
        const config = JSON.parse(configText);
        applyDarkTheme(config);
        new Chart(canvas, config);
      } catch (err) {
        console.error('Failed to render inline chart:', err);
        div.innerHTML = `<p class="text-red-400 text-xs">Chart render error: ${err.message}</p>`;
      }
    });
  }

  function extractChartConfig(html, targetIndex) {
    // Re-parse the original text to find chartjs blocks
    // We need to look at the raw text from the stream
    const messages = document.getElementById('chat-messages');
    const bubbles = messages.querySelectorAll('.chat-bubble.assistant');
    const lastBubble = bubbles[bubbles.length - 1];
    if (!lastBubble) return null;

    // Get the original raw text we need to find — stored via data attribute approach
    // Actually, let's extract from the rendered HTML by finding canvas containers
    const allChartDivs = lastBubble.querySelectorAll('.inline-chart');
    // The chart configs are baked into the rendering pipeline, so we need a different approach

    return null; // fallback — use the direct approach below
  }

  // Better approach: store chart configs during markdown rendering
  const pendingChartConfigs = [];

  const origRenderMarkdown = renderMarkdown;
  // Override to capture chart configs
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

  // Wire up the improved rendering into the stream handler
  const origStreamResponse = streamResponse;

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
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId }),
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
    } catch (err) {
      typingBubble.innerHTML = `<p class="text-red-400">Failed to get response: ${err.message}</p>`;
    }

    isStreaming = false;
    sendBtn.disabled = false;
    document.getElementById('chat-input')?.focus();
  }

  // Patch renderChat to use the improved stream handler
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

  window.healthOS.renderChat = renderChatFull;
})();
