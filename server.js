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

// Initialize database
const db = require('./src/db');
db.getDb();

const app = express();

// Middleware
app.use(express.json());
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
app.use('/api', require('./src/routes/api')(config));
app.use('/api/sync', require('./src/routes/sync')(config));
app.use('/api/chat', require('./src/routes/chat')(config));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = config.server?.port || 3000;
app.listen(PORT, () => {
  console.log(`HealthOS running at http://localhost:${PORT}`);
});
