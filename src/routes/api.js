const express = require('express');
const db = require('../db');

function createRouter() {
  const router = express.Router();

  // Middleware: require authentication
  router.use((req, res, next) => {
    const tokens = db.getTokens();
    if (!tokens) return res.status(401).json({ error: 'Not authenticated' });
    next();
  });

  // GET /api/dashboard — aggregated dashboard data
  router.get('/dashboard', (req, res) => {
    try {
      const VALID_RANGES = { '30': 30, '90': 90, '180': 180, '365': 365, '730': 730, '1095': 1095, '1825': 1825 };
      const raw = req.query.days;
      // null/undefined = max (no filter), otherwise validate
      const days = raw === undefined || raw === 'max' ? null : VALID_RANGES[raw] || 30;
      const data = db.getDashboardData(days);
      res.json(data);
    } catch (err) {
      console.error('[API] Dashboard error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/recovery — paginated recovery data
  router.get('/recovery', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 30, 100);
      const offset = parseInt(req.query.offset) || 0;
      const data = db.getRecoveries(limit, offset);
      const total = db.getRecoveryCount();
      res.json({ data, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/sleep — paginated sleep data
  router.get('/sleep', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 30, 100);
      const offset = parseInt(req.query.offset) || 0;
      const data = db.getSleeps(limit, offset);
      const total = db.getSleepCount();
      res.json({ data, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/workouts — paginated workout data
  router.get('/workouts', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 30, 100);
      const offset = parseInt(req.query.offset) || 0;
      const data = db.getWorkouts(limit, offset);
      const total = db.getWorkoutCount();
      res.json({ data, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cycles — paginated cycle data
  router.get('/cycles', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 30, 100);
      const offset = parseInt(req.query.offset) || 0;
      const data = db.getCycles(limit, offset);
      const total = db.getCycleCount();
      res.json({ data, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/profile — user profile + body measurements
  router.get('/profile', (req, res) => {
    try {
      const profile = db.getProfile();
      const body = db.getBodyMeasurements();
      res.json({ profile, bodyMeasurements: body });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createRouter;
