const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'auth.json');

function ensureDir() {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveTokens(accessToken, refreshToken, expiresIn, scope) {
  ensureDir();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const data = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scope: scope || null,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

function getTokens() {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deleteTokens() {
  try {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  } catch { /* ignore */ }
}

module.exports = { saveTokens, getTokens, deleteTokens };
