const express = require('express');
const db = require('../db');
const { streamChat } = require('../ai-chat');

function createRouter(config) {
  const router = express.Router();

  // Middleware: require authentication
  router.use((req, res, next) => {
    const tokens = db.getTokens();
    if (!tokens) return res.status(401).json({ error: 'Not authenticated' });
    next();
  });

  // POST /api/chat/message — SSE streaming chat
  router.post('/message', async (req, res) => {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const sid = sessionId || `session_${Date.now()}`;

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      for await (const chunk of streamChat(message, sid, config)) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done', sessionId: sid })}\n\n`);
    } catch (err) {
      console.error('[Chat] Error:', err);
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    }

    res.end();
  });

  // GET /api/chat/history — get chat history for a session
  router.get('/history', (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.json({ messages: [] });
    try {
      const messages = db.getChatHistory(sessionId);
      res.json({ messages });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createRouter;
