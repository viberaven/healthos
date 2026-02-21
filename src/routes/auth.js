const crypto = require('crypto');
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

      // Generate a unique session ID for this user
      const sessionId = crypto.randomBytes(32).toString('hex');

      await whoop.exchangeCode(sessionId, code, config);

      // Set session cookie (httpOnly, long-lived)
      res.cookie('healthos_sid', sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      });
      res.clearCookie('oauth_state');
      res.redirect('/#dashboard');
    } catch (err) {
      console.error('[Auth] Callback error:', err);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });

  // GET /auth/status — check if authenticated
  router.get('/status', (req, res) => {
    const sessionId = req.cookies?.healthos_sid;
    const tokens = sessionId ? authStore.getTokens(sessionId) : null;
    res.json({
      authenticated: !!tokens,
    });
  });

  // POST /auth/logout — clear tokens
  router.post('/logout', (req, res) => {
    const sessionId = req.cookies?.healthos_sid;
    if (sessionId) {
      authStore.deleteTokens(sessionId);
    }
    res.clearCookie('healthos_sid');
    res.json({ success: true });
  });

  return router;
}

module.exports = createRouter;
