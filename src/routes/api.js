const express = require('express');
const db = require('../db');

function createRouter(config) {
  const router = express.Router();

  // GET /api/config — public display preferences (no auth required)
  router.get('/config', (req, res) => {
    res.json({ energyUnit: config.display?.energyUnit || 'kcal' });
  });

  // Middleware: require authentication
  router.use((req, res, next) => {
    const tokens = db.getTokens();
    if (!tokens) return res.status(401).json({ error: 'Not authenticated' });
    next();
  });

  // Helper: parse ?days= query param into a number or null (max)
  const VALID_RANGES = { '30': 30, '90': 90, '180': 180, '365': 365, '730': 730, '1095': 1095, '1825': 1825 };
  function parseDays(raw) {
    return raw === undefined || raw === 'max' ? null : VALID_RANGES[raw] || 30;
  }

  // Helper: register a chart endpoint backed by a db function(days)
  function chartRoute(path, dbFn) {
    router.get(path, (req, res) => {
      try {
        res.json(dbFn(parseDays(req.query.days)));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  // GET /api/dashboard — aggregated dashboard data
  chartRoute('/dashboard', (days) => db.getDashboardData(days));

  // Chart endpoints
  chartRoute('/workouts/chart', (days) => db.getWorkoutsChartData(days));
  chartRoute('/cycles/chart', (days) => db.getCyclesChartData(days));
  chartRoute('/recovery/chart', (days) => db.getRecoveryChartData(days));
  chartRoute('/sleep/chart', (days) => db.getSleepChartData(days));

  // Helper: register a paginated list endpoint
  function paginatedRoute(path, getRows, getCount) {
    router.get(path, (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const offset = parseInt(req.query.offset) || 0;
        res.json({ data: getRows(limit, offset), total: getCount(), limit, offset });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  // Paginated data endpoints
  paginatedRoute('/recovery', db.getRecoveries, db.getRecoveryCount);
  paginatedRoute('/sleep', db.getSleeps, db.getSleepCount);
  paginatedRoute('/workouts', db.getWorkouts, db.getWorkoutCount);
  paginatedRoute('/cycles', db.getCycles, db.getCycleCount);

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
