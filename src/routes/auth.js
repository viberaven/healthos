const express = require('express');
const authStore = require('../auth-store');
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
    const tokens = authStore.getTokens();
    res.json({
      authenticated: !!tokens,
    });
  });

  // POST /auth/logout — clear tokens
  router.post('/logout', (req, res) => {
    authStore.deleteTokens();
    res.json({ success: true });
  });

  return router;
}

module.exports = createRouter;
