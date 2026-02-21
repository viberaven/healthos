const express = require('express');
const authStore = require('../auth-store');
const { streamChat } = require('../ai-chat');

function createRouter(config) {
  const router = express.Router();

  // Middleware: require authentication
  router.use((req, res, next) => {
    const tokens = authStore.getTokens();
    if (!tokens) return res.status(401).json({ error: 'Not authenticated' });
    next();
  });

  // POST /api/chat/message — SSE streaming chat
  // Body: { message, sessionId, context, history }
  // context: { recovery365d, sleep365d, workouts365d, cycles365d, profile, bodyMeasurements }
  // history: [{ role, content }, ...]
  router.post('/message', async (req, res) => {
    const { message, sessionId, context, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const sid = sessionId || `session_${Date.now()}`;
    const ctx = context || { recovery365d: [], sleep365d: [], workouts365d: [], cycles365d: [], profile: null, bodyMeasurements: null };
    const hist = history || [];

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      for await (const chunk of streamChat(message, sid, ctx, hist, config)) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done', sessionId: sid })}\n\n`);
    } catch (err) {
      console.error('[Chat] Error:', err);
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    }

    res.end();
  });

  return router;
}

module.exports = createRouter;
