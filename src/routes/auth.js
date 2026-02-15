const express = require('express');
const db = require('../db');
const whoop = require('../whoop-api');

function createRouter(config) {
  const router = express.Router();

  // GET /auth/login — redirect to WHOOP OAuth
  router.get('/login', (req, res) => {
    const { url, state } = whoop.getAuthUrl(config);
    // Store state in a cookie for verification
    res.cookie('oauth_state', state, { httpOnly: true, maxAge: 600000 });
    res.redirect(url);
  });

  // GET /auth/callback — handle OAuth redirect
  router.get('/callback', async (req, res) => {
    try {
      const { code, state } = req.query;

      if (!code) {
        return res.status(400).send('Missing authorization code');
      }

      // Verify state parameter
      const savedState = req.cookies?.oauth_state;
      if (savedState && state !== savedState) {
        return res.status(400).send('State mismatch — possible CSRF attack');
      }

      await whoop.exchangeCode(code, config);
      res.clearCookie('oauth_state');
      res.redirect('/#dashboard');
    } catch (err) {
      console.error('[Auth] Callback error:', err);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });

  // GET /auth/status — check if authenticated
  router.get('/status', (req, res) => {
    const tokens = db.getTokens();
    const profile = db.getProfile();
    res.json({
      authenticated: !!tokens,
      profile: profile ? { firstName: profile.first_name, lastName: profile.last_name, email: profile.email } : null,
    });
  });

  // POST /auth/logout — clear tokens
  router.post('/logout', (req, res) => {
    db.deleteTokens();
    res.json({ success: true });
  });

  return router;
}

module.exports = createRouter;
