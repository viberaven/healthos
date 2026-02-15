const express = require('express');
const db = require('../db');
const { syncDataType, syncAll, SYNC_ORDER } = require('../sync');

function createRouter(config) {
  const router = express.Router();

  // Middleware: require authentication
  router.use((req, res, next) => {
    const tokens = db.getTokens();
    if (!tokens) return res.status(401).json({ error: 'Not authenticated' });
    next();
  });

  // POST /api/sync/all — sync all data types sequentially
  router.post('/all', async (req, res) => {
    try {
      const results = await syncAll(config);
      res.json({ results });
    } catch (err) {
      console.error('[Sync] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sync/:type — sync a single data type
  router.post('/:type', async (req, res) => {
    const { type } = req.params;
    if (!SYNC_ORDER.includes(type)) {
      return res.status(400).json({ error: `Invalid data type: ${type}` });
    }
    try {
      const result = await syncDataType(type, config);
      res.json(result);
    } catch (err) {
      console.error(`[Sync:${type}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/sync/status — get sync status for all types
  router.get('/status', (req, res) => {
    try {
      const status = db.getAllSyncStatus();
      res.json({ status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createRouter;
