const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'healthos.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      scope TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile (
      user_id INTEGER PRIMARY KEY,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS body_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      height_meter REAL,
      weight_kilogram REAL,
      max_heart_rate INTEGER,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY,
      start_time TEXT,
      end_time TEXT,
      timezone_offset TEXT,
      score_strain REAL,
      score_kilojoule REAL,
      score_average_heart_rate INTEGER,
      score_max_heart_rate INTEGER,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recovery (
      cycle_id INTEGER PRIMARY KEY,
      sleep_id TEXT,
      user_calibrating INTEGER,
      recovery_score REAL,
      resting_heart_rate REAL,
      hrv_rmssd_milli REAL,
      spo2_percentage REAL,
      skin_temp_celsius REAL,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sleep (
      id TEXT PRIMARY KEY,
      nap INTEGER DEFAULT 0,
      score_stage_summary_total_light_sleep_time_milli INTEGER,
      score_stage_summary_total_slow_wave_sleep_time_milli INTEGER,
      score_stage_summary_total_rem_sleep_time_milli INTEGER,
      score_stage_summary_total_awake_time_milli INTEGER,
      score_stage_summary_total_in_bed_time_milli INTEGER,
      score_stage_summary_total_no_data_time_milli INTEGER,
      score_sleep_needed_baseline_milli INTEGER,
      score_sleep_needed_need_from_sleep_debt_milli INTEGER,
      score_sleep_needed_need_from_recent_strain_milli INTEGER,
      score_sleep_needed_need_from_recent_nap_milli INTEGER,
      score_sleep_efficiency_percentage REAL,
      score_sleep_performance_percentage REAL,
      score_respiratory_rate REAL,
      start_time TEXT,
      end_time TEXT,
      timezone_offset TEXT,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      sport_id INTEGER,
      sport_name TEXT,
      start_time TEXT,
      end_time TEXT,
      timezone_offset TEXT,
      score_strain REAL,
      score_average_heart_rate INTEGER,
      score_max_heart_rate INTEGER,
      score_kilojoule REAL,
      score_distance_meter REAL,
      score_altitude_gain_meter REAL,
      score_altitude_change_meter REAL,
      score_zone_durations TEXT,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      data_type TEXT PRIMARY KEY,
      last_synced_at TEXT,
      status TEXT DEFAULT 'never',
      error_message TEXT,
      record_count INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      chart_config TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(session_id, created_at);

    -- Seed sync_metadata for all data types
    INSERT OR IGNORE INTO sync_metadata (data_type) VALUES
      ('profile'), ('body_measurements'), ('cycles'),
      ('recovery'), ('sleep'), ('workouts');
  `);
}

// --- Auth token helpers ---

const stmts = {};

function prepare(name, sql) {
  if (!stmts[name]) stmts[name] = getDb().prepare(sql);
  return stmts[name];
}

function saveTokens(accessToken, refreshToken, expiresIn, scope) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  prepare('upsertTokens', `
    INSERT OR REPLACE INTO auth_tokens (id, access_token, refresh_token, expires_at, scope, updated_at)
    VALUES (1, ?, ?, ?, ?, datetime('now'))
  `).run(accessToken, refreshToken, expiresAt, scope || null);
}

function getTokens() {
  return prepare('getTokens', 'SELECT * FROM auth_tokens WHERE id = 1').get();
}

function deleteTokens() {
  prepare('deleteTokens', 'DELETE FROM auth_tokens WHERE id = 1').run();
}

// --- Profile helpers ---

function upsertProfile(data) {
  prepare('upsertProfile', `
    INSERT OR REPLACE INTO profile (user_id, email, first_name, last_name, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(data.user_id, data.email, data.first_name, data.last_name, JSON.stringify(data));
}

function getProfile() {
  return prepare('getProfile', 'SELECT * FROM profile LIMIT 1').get();
}

// --- Body measurements helpers ---

function upsertBodyMeasurements(data) {
  // Clear old and insert new (single-row concept)
  getDb().exec('DELETE FROM body_measurements');
  prepare('insertBody', `
    INSERT INTO body_measurements (height_meter, weight_kilogram, max_heart_rate, raw_json, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(data.height_meter, data.weight_kilogram, data.max_heart_rate, JSON.stringify(data));
}

function getBodyMeasurements() {
  return prepare('getBody', 'SELECT * FROM body_measurements ORDER BY id DESC LIMIT 1').get();
}

// --- Cycles helpers ---

function upsertCycle(c) {
  const score = c.score || {};
  prepare('upsertCycle', `
    INSERT OR REPLACE INTO cycles (id, start_time, end_time, timezone_offset, score_strain, score_kilojoule, score_average_heart_rate, score_max_heart_rate, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(c.id, c.start, c.end, c.timezone_offset, score.strain, score.kilojoule, score.average_heart_rate, score.max_heart_rate, JSON.stringify(c));
}

function getCycles(limit = 30, offset = 0) {
  return prepare('getCycles', `
    SELECT * FROM cycles ORDER BY start_time DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getCycleCount() {
  return prepare('getCycleCount', 'SELECT COUNT(*) as count FROM cycles').get().count;
}

// --- Recovery helpers ---

function upsertRecovery(r) {
  const score = r.score || {};
  prepare('upsertRecovery', `
    INSERT OR REPLACE INTO recovery (cycle_id, sleep_id, user_calibrating, recovery_score, resting_heart_rate, hrv_rmssd_milli, spo2_percentage, skin_temp_celsius, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(r.cycle_id, r.sleep_id, r.user_calibrating ? 1 : 0, score.recovery_score, score.resting_heart_rate, score.hrv_rmssd_milli, score.spo2_percentage, score.skin_temp_celsius, JSON.stringify(r));
}

function getRecoveries(limit = 30, offset = 0) {
  return prepare('getRecoveries', `
    SELECT r.*, c.start_time as cycle_start FROM recovery r
    LEFT JOIN cycles c ON r.cycle_id = c.id
    ORDER BY c.start_time DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getRecoveryCount() {
  return prepare('getRecoveryCount', 'SELECT COUNT(*) as count FROM recovery').get().count;
}

// --- Sleep helpers ---

function upsertSleep(s) {
  const score = s.score || {};
  const stages = score.stage_summary || {};
  const need = score.sleep_needed || {};
  prepare('upsertSleep', `
    INSERT OR REPLACE INTO sleep (
      id, nap, score_stage_summary_total_light_sleep_time_milli,
      score_stage_summary_total_slow_wave_sleep_time_milli,
      score_stage_summary_total_rem_sleep_time_milli,
      score_stage_summary_total_awake_time_milli,
      score_stage_summary_total_in_bed_time_milli,
      score_stage_summary_total_no_data_time_milli,
      score_sleep_needed_baseline_milli,
      score_sleep_needed_need_from_sleep_debt_milli,
      score_sleep_needed_need_from_recent_strain_milli,
      score_sleep_needed_need_from_recent_nap_milli,
      score_sleep_efficiency_percentage,
      score_sleep_performance_percentage,
      score_respiratory_rate,
      start_time, end_time, timezone_offset, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    s.id, s.nap ? 1 : 0,
    stages.total_light_sleep_time_milli,
    stages.total_slow_wave_sleep_time_milli,
    stages.total_rem_sleep_time_milli,
    stages.total_awake_time_milli,
    stages.total_in_bed_time_milli,
    stages.total_no_data_time_milli,
    need.baseline_milli,
    need.need_from_sleep_debt_milli,
    need.need_from_recent_strain_milli,
    need.need_from_recent_nap_milli,
    score.sleep_efficiency_percentage,
    score.sleep_performance_percentage,
    score.respiratory_rate,
    s.start, s.end, s.timezone_offset, JSON.stringify(s)
  );
}

function getSleeps(limit = 30, offset = 0) {
  return prepare('getSleeps', `
    SELECT * FROM sleep WHERE nap = 0 ORDER BY start_time DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getSleepCount() {
  return prepare('getSleepCount', 'SELECT COUNT(*) as count FROM sleep WHERE nap = 0').get().count;
}

// --- Workout helpers ---

function upsertWorkout(w) {
  const score = w.score || {};
  prepare('upsertWorkout', `
    INSERT OR REPLACE INTO workouts (
      id, sport_id, sport_name, start_time, end_time, timezone_offset,
      score_strain, score_average_heart_rate, score_max_heart_rate,
      score_kilojoule, score_distance_meter, score_altitude_gain_meter,
      score_altitude_change_meter, score_zone_durations, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    w.id, w.sport_id, w.sport_name, w.start, w.end, w.timezone_offset,
    score.strain, score.average_heart_rate, score.max_heart_rate,
    score.kilojoule, score.distance_meter, score.altitude_gain_meter,
    score.altitude_change_meter, (score.zone_duration || score.zone_durations) ? JSON.stringify(score.zone_duration || score.zone_durations) : null,
    JSON.stringify(w)
  );
}

function getWorkouts(limit = 30, offset = 0) {
  return prepare('getWorkouts', `
    SELECT * FROM workouts ORDER BY start_time DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getWorkoutCount() {
  return prepare('getWorkoutCount', 'SELECT COUNT(*) as count FROM workouts').get().count;
}

// --- Sync metadata helpers ---

function getSyncStatus(dataType) {
  return prepare('getSyncStatus', 'SELECT * FROM sync_metadata WHERE data_type = ?').get(dataType);
}

function getAllSyncStatus() {
  return prepare('getAllSyncStatus', 'SELECT * FROM sync_metadata ORDER BY data_type').all();
}

function updateSyncStatus(dataType, status, lastSyncedAt, errorMessage) {
  const count = getRecordCount(dataType);
  if (lastSyncedAt !== undefined && lastSyncedAt !== null) {
    // Update both status and last_synced_at (on completion)
    prepare('updateSyncStatusFull', `
      UPDATE sync_metadata SET status = ?, last_synced_at = ?, error_message = ?, record_count = ?, updated_at = datetime('now')
      WHERE data_type = ?
    `).run(status, lastSyncedAt, errorMessage || null, count, dataType);
  } else {
    // Update status only, preserve existing last_synced_at (on start/error)
    prepare('updateSyncStatusPartial', `
      UPDATE sync_metadata SET status = ?, error_message = ?, record_count = ?, updated_at = datetime('now')
      WHERE data_type = ?
    `).run(status, errorMessage || null, count, dataType);
  }
}

function getRecordCount(dataType) {
  const countMap = {
    profile: 'SELECT COUNT(*) as count FROM profile',
    body_measurements: 'SELECT COUNT(*) as count FROM body_measurements',
    cycles: 'SELECT COUNT(*) as count FROM cycles',
    recovery: 'SELECT COUNT(*) as count FROM recovery',
    sleep: 'SELECT COUNT(*) as count FROM sleep',
    workouts: 'SELECT COUNT(*) as count FROM workouts',
  };
  if (!countMap[dataType]) return 0;
  return getDb().prepare(countMap[dataType]).get().count;
}

// --- Chat history helpers ---

function saveChatMessage(sessionId, role, content, chartConfig) {
  prepare('saveChat', `
    INSERT INTO chat_history (session_id, role, content, chart_config, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(sessionId, role, content, chartConfig ? JSON.stringify(chartConfig) : null);
}

function getChatHistory(sessionId, limit = 50) {
  return prepare('getChatHistory', `
    SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at ASC LIMIT ?
  `).all(sessionId, limit);
}

// --- Dashboard aggregate queries ---

function getDashboardData(days) {
  const d = getDb();
  const filter = days ? `-${days} days` : null;

  const latestRecovery = d.prepare(`
    SELECT r.*, c.start_time as cycle_start FROM recovery r
    LEFT JOIN cycles c ON r.cycle_id = c.id
    ORDER BY c.start_time DESC LIMIT 1
  `).get();

  const latestCycle = d.prepare(`
    SELECT * FROM cycles ORDER BY start_time DESC LIMIT 1
  `).get();

  const latestSleep = d.prepare(`
    SELECT * FROM sleep WHERE nap = 0 ORDER BY start_time DESC LIMIT 1
  `).get();

  const recoveryRange = d.prepare(filter
    ? `SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate, c.start_time
       FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
       WHERE c.start_time >= datetime('now', ?) ORDER BY c.start_time ASC`
    : `SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate, c.start_time
       FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
       ORDER BY c.start_time ASC`
  ).all(...(filter ? [filter] : []));

  const cyclesRange = d.prepare(filter
    ? `SELECT score_strain, score_kilojoule, start_time FROM cycles WHERE start_time >= datetime('now', ?) ORDER BY start_time ASC`
    : `SELECT score_strain, score_kilojoule, start_time FROM cycles ORDER BY start_time ASC`
  ).all(...(filter ? [filter] : []));

  const sleepRange = d.prepare(filter
    ? `SELECT score_stage_summary_total_light_sleep_time_milli as light,
              score_stage_summary_total_slow_wave_sleep_time_milli as deep,
              score_stage_summary_total_rem_sleep_time_milli as rem,
              score_stage_summary_total_awake_time_milli as awake,
              score_sleep_performance_percentage as performance, start_time
       FROM sleep WHERE nap = 0 AND start_time >= datetime('now', ?) ORDER BY start_time ASC`
    : `SELECT score_stage_summary_total_light_sleep_time_milli as light,
              score_stage_summary_total_slow_wave_sleep_time_milli as deep,
              score_stage_summary_total_rem_sleep_time_milli as rem,
              score_stage_summary_total_awake_time_milli as awake,
              score_sleep_performance_percentage as performance, start_time
       FROM sleep WHERE nap = 0 ORDER BY start_time ASC`
  ).all(...(filter ? [filter] : []));

  const workoutsRange = d.prepare(filter
    ? `SELECT sport_name, score_strain, score_kilojoule, start_time FROM workouts WHERE start_time >= datetime('now', ?) ORDER BY start_time DESC LIMIT 20`
    : `SELECT sport_name, score_strain, score_kilojoule, start_time FROM workouts ORDER BY start_time DESC LIMIT 20`
  ).all(...(filter ? [filter] : []));

  return { latestRecovery, latestCycle, latestSleep, recoveryRange, cyclesRange, sleepRange, workoutsRange };
}

// --- AI context queries ---

function getAIContext() {
  const d = getDb();

  const recovery365d = d.prepare(`
    SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate, r.spo2_percentage, r.skin_temp_celsius, c.start_time
    FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
    WHERE c.start_time >= datetime('now', '-365 days')
    ORDER BY c.start_time ASC
  `).all();

  const sleep365d = d.prepare(`
    SELECT score_stage_summary_total_light_sleep_time_milli as light,
           score_stage_summary_total_slow_wave_sleep_time_milli as deep,
           score_stage_summary_total_rem_sleep_time_milli as rem,
           score_stage_summary_total_awake_time_milli as awake,
           score_sleep_performance_percentage as performance,
           score_sleep_efficiency_percentage as efficiency,
           score_respiratory_rate as respiratory_rate,
           start_time
    FROM sleep WHERE nap = 0 AND start_time >= datetime('now', '-365 days')
    ORDER BY start_time ASC
  `).all();

  const workouts365d = d.prepare(`
    SELECT sport_name, score_strain, score_average_heart_rate, score_max_heart_rate,
           score_kilojoule, score_distance_meter, start_time, end_time
    FROM workouts WHERE start_time >= datetime('now', '-365 days')
    ORDER BY start_time ASC
  `).all();

  const cycles365d = d.prepare(`
    SELECT score_strain, score_kilojoule, score_average_heart_rate, start_time
    FROM cycles WHERE start_time >= datetime('now', '-365 days')
    ORDER BY start_time ASC
  `).all();

  const profile = getProfile();
  const bodyMeasurements = getBodyMeasurements();

  return {
    recovery365d, sleep365d, workouts365d, cycles365d,
    profile, bodyMeasurements,
  };
}

module.exports = {
  getDb,
  saveTokens, getTokens, deleteTokens,
  upsertProfile, getProfile,
  upsertBodyMeasurements, getBodyMeasurements,
  upsertCycle, getCycles, getCycleCount,
  upsertRecovery, getRecoveries, getRecoveryCount,
  upsertSleep, getSleeps, getSleepCount,
  upsertWorkout, getWorkouts, getWorkoutCount,
  getSyncStatus, getAllSyncStatus, updateSyncStatus,
  saveChatMessage, getChatHistory,
  getDashboardData, getAIContext,
};
