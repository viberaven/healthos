const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'sessions.db');

// Migrate: remove old auth.json if it exists
const OLD_AUTH_FILE = path.join(__dirname, '..', 'auth.json');
if (fs.existsSync(OLD_AUTH_FILE)) {
  fs.unlinkSync(OLD_AUTH_FILE);
  console.log('[Auth Store] Migrated away from auth.json — deleted old file');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    scope TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const stmtSave = db.prepare(`
  INSERT INTO sessions (id, access_token, refresh_token, expires_at, scope, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    scope = excluded.scope,
    updated_at = datetime('now')
`);

const stmtGet = db.prepare('SELECT * FROM sessions WHERE id = ?');
const stmtDelete = db.prepare('DELETE FROM sessions WHERE id = ?');

function saveTokens(sessionId, accessToken, refreshToken, expiresIn, scope) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  stmtSave.run(sessionId, accessToken, refreshToken, expiresAt, scope || null);
}

function getTokens(sessionId) {
  return stmtGet.get(sessionId) || null;
}

function deleteTokens(sessionId) {
  stmtDelete.run(sessionId);
}

module.exports = { saveTokens, getTokens, deleteTokens };
