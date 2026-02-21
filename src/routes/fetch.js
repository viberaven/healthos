const express = require('express');
const authStore = require('../auth-store');
const whoop = require('../whoop-api');

function createRouter(config) {
  const router = express.Router();

  // Middleware: require authentication via session cookie
  router.use((req, res, next) => {
    const sessionId = req.cookies?.healthos_sid;
    if (!sessionId) return res.status(401).json({ error: 'Not authenticated' });
    const tokens = authStore.getTokens(sessionId);
    if (!tokens) return res.status(401).json({ error: 'Not authenticated' });
    req.sessionId = sessionId;
    next();
  });

  // GET /api/fetch/profile
  router.get('/profile', async (req, res) => {
    try {
      const data = await whoop.fetchProfile(req.sessionId, config);
      res.json(data);
    } catch (err) {
      console.error('[Fetch] profile error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fetch/body-measurements
  router.get('/body-measurements', async (req, res) => {
    try {
      const data = await whoop.fetchBodyMeasurements(req.sessionId, config);
      res.json(data);
    } catch (err) {
      console.error('[Fetch] body-measurements error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fetch/cycles?start=&end=
  router.get('/cycles', async (req, res) => {
    try {
      const data = await whoop.fetchCycles(req.sessionId, config, req.query.start || null, req.query.end || null);
      res.json(data);
    } catch (err) {
      console.error('[Fetch] cycles error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fetch/recovery?start=&end=
  router.get('/recovery', async (req, res) => {
    try {
      const data = await whoop.fetchRecovery(req.sessionId, config, req.query.start || null, req.query.end || null);
      res.json(data);
    } catch (err) {
      console.error('[Fetch] recovery error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fetch/sleep?start=&end=
  router.get('/sleep', async (req, res) => {
    try {
      const data = await whoop.fetchSleep(req.sessionId, config, req.query.start || null, req.query.end || null);
      res.json(data);
    } catch (err) {
      console.error('[Fetch] sleep error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fetch/workouts?start=&end=
  router.get('/workouts', async (req, res) => {
    try {
      const data = await whoop.fetchWorkouts(req.sessionId, config, req.query.start || null, req.query.end || null);
      res.json(data);
    } catch (err) {
      console.error('[Fetch] workouts error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createRouter;
