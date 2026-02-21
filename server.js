const express = require('express');
const path = require('path');

// Load config
let config;
try {
  config = require('./config');
} catch (e) {
  console.error('Missing config.js — copy config.js.example to config.js and fill in your credentials.');
  process.exit(1);
}

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple cookie parser (no dependency needed)
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      req.cookies[name] = decodeURIComponent(rest.join('='));
    });
  }
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', require('./src/routes/auth')(config));
app.use('/api/fetch', require('./src/routes/fetch')(config));
app.use('/api/chat', require('./src/routes/chat')(config));

// Config endpoint (public — no auth required)
app.get('/api/config', (req, res) => {
  res.json({ energyUnit: config.display?.energyUnit || 'kcal' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 3000;
app.listen(PORT, HOST, () => {
  console.log(`HealthOS running at http://${HOST}:${PORT}`);
});
