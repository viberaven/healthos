// HealthOS Browser DB — SQLite WASM (official sqlite.org) with IndexedDB persistence

(function () {
  const IDB_NAME = 'healthos';
  const IDB_STORE = 'sqlite';
  const IDB_KEY = 'db';

  let db = null;
  let sqlite3 = null;
  let ready = false;
  let initPromise = null;

  // --- IndexedDB helpers ---

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(store, key) {
    return new Promise((resolve, reject) => {
      const tx = store.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(store, key, value) {
    return new Promise((resolve, reject) => {
      const tx = store.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Init ---

  async function initDb() {
    if (initPromise) return initPromise;
    initPromise = _doInit();
    return initPromise;
  }

  async function _doInit() {
    sqlite3 = await sqlite3InitModule();
    console.log('[DB] SQLite WASM version:', sqlite3.version.libVersion);

    // Try loading from IndexedDB
    const idb = await idbOpen();
    const saved = await idbGet(idb, IDB_KEY);

    if (saved) {
      console.log('[DB] Restoring from IndexedDB...');
      const p = sqlite3.wasm.allocFromTypedArray(saved);
      db = new sqlite3.oo1.DB();
      // SQLITE_DESERIALIZE_FREEONCLOSE=1 | SQLITE_DESERIALIZE_RESIZEABLE=2
      const rc = sqlite3.capi.sqlite3_deserialize(
        db.pointer, 'main', p, saved.byteLength, saved.byteLength, 3
      );
      if (rc !== 0) {
        console.warn('[DB] Deserialize failed, creating fresh DB');
        db.close();
        db = new sqlite3.oo1.DB(':memory:');
      }
    } else {
      console.log('[DB] No saved DB, creating fresh');
      db = new sqlite3.oo1.DB(':memory:');
    }

    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
    ready = true;
    console.log('[DB] Ready');
  }

  function initSchema() {
    db.exec(`
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

      INSERT OR IGNORE INTO sync_metadata (data_type) VALUES
        ('profile'), ('body_measurements'), ('cycles'),
        ('recovery'), ('sleep'), ('workouts');
    `);
  }

  // --- Persistence ---

  async function persistDb() {
    if (!db) return;
    try {
      const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer);
      const idb = await idbOpen();
      await idbPut(idb, IDB_KEY, bytes);
      console.log('[DB] Persisted to IndexedDB (' + bytes.byteLength + ' bytes)');
    } catch (err) {
      console.error('[DB] Persist error:', err);
    }
  }

  // --- Helper: run SQL returning rows as objects ---

  function all(sql, ...params) {
    const result = [];
    db.exec({ sql, bind: params, rowMode: 'object', callback: row => result.push(row) });
    return result;
  }

  function get(sql, ...params) {
    const rows = all(sql, ...params);
    return rows[0] || null;
  }

  function run(sql, ...params) {
    db.exec({ sql, bind: params });
  }

  // --- Profile ---

  function upsertProfile(data) {
    run(`INSERT OR REPLACE INTO profile (user_id, email, first_name, last_name, raw_json, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      data.user_id, data.email, data.first_name, data.last_name, JSON.stringify(data));
  }

  function getProfile() {
    return get('SELECT * FROM profile LIMIT 1');
  }

  // --- Body Measurements ---

  function upsertBodyMeasurements(data) {
    run('DELETE FROM body_measurements');
    run(`INSERT INTO body_measurements (height_meter, weight_kilogram, max_heart_rate, raw_json, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      data.height_meter, data.weight_kilogram, data.max_heart_rate, JSON.stringify(data));
  }

  function getBodyMeasurements() {
    return get('SELECT * FROM body_measurements ORDER BY id DESC LIMIT 1');
  }

  // --- Cycles ---

  function upsertCycle(c) {
    const score = c.score || {};
    run(`INSERT OR REPLACE INTO cycles (id, start_time, end_time, timezone_offset, score_strain, score_kilojoule, score_average_heart_rate, score_max_heart_rate, raw_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      c.id, c.start, c.end, c.timezone_offset, score.strain, score.kilojoule, score.average_heart_rate, score.max_heart_rate, JSON.stringify(c));
  }

  function getCycles(limit = 30, offset = 0) {
    return all('SELECT * FROM cycles ORDER BY start_time DESC LIMIT ? OFFSET ?', limit, offset);
  }

  function getCycleCount() {
    return get('SELECT COUNT(*) as count FROM cycles').count;
  }

  // --- Recovery ---

  function upsertRecovery(r) {
    const score = r.score || {};
    run(`INSERT OR REPLACE INTO recovery (cycle_id, sleep_id, user_calibrating, recovery_score, resting_heart_rate, hrv_rmssd_milli, spo2_percentage, skin_temp_celsius, raw_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      r.cycle_id, r.sleep_id, r.user_calibrating ? 1 : 0, score.recovery_score, score.resting_heart_rate, score.hrv_rmssd_milli, score.spo2_percentage, score.skin_temp_celsius, JSON.stringify(r));
  }

  function getRecoveries(limit = 30, offset = 0) {
    return all(`SELECT r.*, c.start_time as cycle_start FROM recovery r
                LEFT JOIN cycles c ON r.cycle_id = c.id
                ORDER BY c.start_time DESC LIMIT ? OFFSET ?`, limit, offset);
  }

  function getRecoveryCount() {
    return get('SELECT COUNT(*) as count FROM recovery').count;
  }

  // --- Sleep ---

  function upsertSleep(s) {
    const score = s.score || {};
    const stages = score.stage_summary || {};
    const need = score.sleep_needed || {};
    run(`INSERT OR REPLACE INTO sleep (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
      s.start, s.end, s.timezone_offset, JSON.stringify(s));
  }

  function getSleeps(limit = 30, offset = 0) {
    return all('SELECT * FROM sleep WHERE nap = 0 ORDER BY start_time DESC LIMIT ? OFFSET ?', limit, offset);
  }

  function getSleepCount() {
    return get('SELECT COUNT(*) as count FROM sleep WHERE nap = 0').count;
  }

  // --- Workouts ---

  function upsertWorkout(w) {
    const score = w.score || {};
    run(`INSERT OR REPLACE INTO workouts (
          id, sport_id, sport_name, start_time, end_time, timezone_offset,
          score_strain, score_average_heart_rate, score_max_heart_rate,
          score_kilojoule, score_distance_meter, score_altitude_gain_meter,
          score_altitude_change_meter, score_zone_durations, raw_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      w.id, w.sport_id, w.sport_name, w.start, w.end, w.timezone_offset,
      score.strain, score.average_heart_rate, score.max_heart_rate,
      score.kilojoule, score.distance_meter, score.altitude_gain_meter,
      score.altitude_change_meter, (score.zone_duration || score.zone_durations) ? JSON.stringify(score.zone_duration || score.zone_durations) : null,
      JSON.stringify(w));
  }

  function getWorkouts(limit = 30, offset = 0) {
    return all('SELECT * FROM workouts ORDER BY start_time DESC LIMIT ? OFFSET ?', limit, offset);
  }

  function getWorkoutCount() {
    return get('SELECT COUNT(*) as count FROM workouts').count;
  }

  // --- Sync metadata ---

  function getSyncStatus(dataType) {
    return get('SELECT * FROM sync_metadata WHERE data_type = ?', dataType);
  }

  function getAllSyncStatus() {
    return all('SELECT * FROM sync_metadata ORDER BY data_type');
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
    return get(countMap[dataType]).count;
  }

  function updateSyncStatus(dataType, status, lastSyncedAt, errorMessage) {
    const count = getRecordCount(dataType);
    if (lastSyncedAt !== undefined && lastSyncedAt !== null) {
      run(`UPDATE sync_metadata SET status = ?, last_synced_at = ?, error_message = ?, record_count = ?, updated_at = datetime('now')
           WHERE data_type = ?`, status, lastSyncedAt, errorMessage || null, count, dataType);
    } else {
      run(`UPDATE sync_metadata SET status = ?, error_message = ?, record_count = ?, updated_at = datetime('now')
           WHERE data_type = ?`, status, errorMessage || null, count, dataType);
    }
  }

  // --- Chat history ---

  function saveChatMessage(sessionId, role, content, chartConfig) {
    run(`INSERT INTO chat_history (session_id, role, content, chart_config, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      sessionId, role, content, chartConfig ? JSON.stringify(chartConfig) : null);
  }

  function getChatHistory(sessionId, limit = 50) {
    return all('SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at ASC LIMIT ?', sessionId, limit);
  }

  // --- Dashboard aggregate queries ---

  function getDashboardData(days) {
    const filter = days ? `-${days} days` : null;

    const latestRecovery = get(`
      SELECT r.*, c.start_time as cycle_start FROM recovery r
      LEFT JOIN cycles c ON r.cycle_id = c.id
      ORDER BY c.start_time DESC LIMIT 1`);

    const latestCycle = get('SELECT * FROM cycles ORDER BY start_time DESC LIMIT 1');

    const latestSleep = get('SELECT * FROM sleep WHERE nap = 0 ORDER BY start_time DESC LIMIT 1');

    const recoveryRange = filter
      ? all(`SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate, c.start_time
             FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
             WHERE c.start_time >= datetime('now', ?) ORDER BY c.start_time ASC`, filter)
      : all(`SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate, c.start_time
             FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
             ORDER BY c.start_time ASC`);

    const cyclesRange = filter
      ? all(`SELECT score_strain, score_kilojoule, start_time FROM cycles WHERE start_time >= datetime('now', ?) ORDER BY start_time ASC`, filter)
      : all('SELECT score_strain, score_kilojoule, start_time FROM cycles ORDER BY start_time ASC');

    const sleepRange = filter
      ? all(`SELECT score_stage_summary_total_light_sleep_time_milli as light,
                    score_stage_summary_total_slow_wave_sleep_time_milli as deep,
                    score_stage_summary_total_rem_sleep_time_milli as rem,
                    score_stage_summary_total_awake_time_milli as awake,
                    score_sleep_performance_percentage as performance, start_time
             FROM sleep WHERE nap = 0 AND start_time >= datetime('now', ?) ORDER BY start_time ASC`, filter)
      : all(`SELECT score_stage_summary_total_light_sleep_time_milli as light,
                    score_stage_summary_total_slow_wave_sleep_time_milli as deep,
                    score_stage_summary_total_rem_sleep_time_milli as rem,
                    score_stage_summary_total_awake_time_milli as awake,
                    score_sleep_performance_percentage as performance, start_time
             FROM sleep WHERE nap = 0 ORDER BY start_time ASC`);

    const workoutsRange = filter
      ? all(`SELECT sport_name, score_strain, score_kilojoule, start_time FROM workouts WHERE start_time >= datetime('now', ?) ORDER BY start_time DESC LIMIT 20`, filter)
      : all('SELECT sport_name, score_strain, score_kilojoule, start_time FROM workouts ORDER BY start_time DESC LIMIT 20');

    return { latestRecovery, latestCycle, latestSleep, recoveryRange, cyclesRange, sleepRange, workoutsRange };
  }

  // --- Chart data queries ---

  function getRecoveryChartData(days) {
    const filter = days ? `-${days} days` : null;
    return filter
      ? all(`SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate,
                    r.spo2_percentage, r.skin_temp_celsius, c.start_time
             FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
             WHERE c.start_time >= datetime('now', ?) ORDER BY c.start_time ASC`, filter)
      : all(`SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate,
                    r.spo2_percentage, r.skin_temp_celsius, c.start_time
             FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
             ORDER BY c.start_time ASC`);
  }

  function getWorkoutsChartData(days) {
    const filter = days ? `-${days} days` : null;
    return filter
      ? all(`SELECT score_strain, score_kilojoule, score_average_heart_rate,
                    score_max_heart_rate, start_time
             FROM workouts WHERE start_time >= datetime('now', ?) ORDER BY start_time ASC`, filter)
      : all(`SELECT score_strain, score_kilojoule, score_average_heart_rate,
                    score_max_heart_rate, start_time
             FROM workouts ORDER BY start_time ASC`);
  }

  function getCyclesChartData(days) {
    const filter = days ? `-${days} days` : null;
    return filter
      ? all(`SELECT score_strain, score_kilojoule, score_average_heart_rate,
                    score_max_heart_rate, start_time
             FROM cycles WHERE start_time >= datetime('now', ?) ORDER BY start_time ASC`, filter)
      : all(`SELECT score_strain, score_kilojoule, score_average_heart_rate,
                    score_max_heart_rate, start_time
             FROM cycles ORDER BY start_time ASC`);
  }

  function getSleepChartData(days) {
    const filter = days ? `-${days} days` : null;
    return filter
      ? all(`SELECT score_stage_summary_total_light_sleep_time_milli as light,
                    score_stage_summary_total_slow_wave_sleep_time_milli as deep,
                    score_stage_summary_total_rem_sleep_time_milli as rem,
                    score_stage_summary_total_awake_time_milli as awake,
                    score_sleep_efficiency_percentage as efficiency,
                    score_sleep_performance_percentage as performance,
                    score_respiratory_rate as respiratory_rate,
                    start_time
             FROM sleep WHERE nap = 0 AND start_time >= datetime('now', ?) ORDER BY start_time ASC`, filter)
      : all(`SELECT score_stage_summary_total_light_sleep_time_milli as light,
                    score_stage_summary_total_slow_wave_sleep_time_milli as deep,
                    score_stage_summary_total_rem_sleep_time_milli as rem,
                    score_stage_summary_total_awake_time_milli as awake,
                    score_sleep_efficiency_percentage as efficiency,
                    score_sleep_performance_percentage as performance,
                    score_respiratory_rate as respiratory_rate,
                    start_time
             FROM sleep WHERE nap = 0 ORDER BY start_time ASC`);
  }

  // --- AI context ---

  function getAIContext() {
    const recovery365d = all(`
      SELECT r.recovery_score, r.hrv_rmssd_milli, r.resting_heart_rate, r.spo2_percentage, r.skin_temp_celsius, c.start_time
      FROM recovery r LEFT JOIN cycles c ON r.cycle_id = c.id
      WHERE c.start_time >= datetime('now', '-365 days')
      ORDER BY c.start_time ASC`);

    const sleep365d = all(`
      SELECT score_stage_summary_total_light_sleep_time_milli as light,
             score_stage_summary_total_slow_wave_sleep_time_milli as deep,
             score_stage_summary_total_rem_sleep_time_milli as rem,
             score_stage_summary_total_awake_time_milli as awake,
             score_sleep_performance_percentage as performance,
             score_sleep_efficiency_percentage as efficiency,
             score_respiratory_rate as respiratory_rate,
             start_time
      FROM sleep WHERE nap = 0 AND start_time >= datetime('now', '-365 days')
      ORDER BY start_time ASC`);

    const workouts365d = all(`
      SELECT sport_name, score_strain, score_average_heart_rate, score_max_heart_rate,
             score_kilojoule, score_distance_meter, start_time, end_time
      FROM workouts WHERE start_time >= datetime('now', '-365 days')
      ORDER BY start_time ASC`);

    const cycles365d = all(`
      SELECT score_strain, score_kilojoule, score_average_heart_rate, start_time
      FROM cycles WHERE start_time >= datetime('now', '-365 days')
      ORDER BY start_time ASC`);

    const profile = getProfile();
    const bodyMeasurements = getBodyMeasurements();

    return { recovery365d, sleep365d, workouts365d, cycles365d, profile, bodyMeasurements };
  }

  // --- Expose ---

  window.healthDB = {
    initDb, persistDb, isReady: () => ready,
    upsertProfile, getProfile,
    upsertBodyMeasurements, getBodyMeasurements,
    upsertCycle, getCycles, getCycleCount,
    upsertRecovery, getRecoveries, getRecoveryCount,
    upsertSleep, getSleeps, getSleepCount,
    upsertWorkout, getWorkouts, getWorkoutCount,
    getSyncStatus, getAllSyncStatus, updateSyncStatus,
    saveChatMessage, getChatHistory,
    getDashboardData, getRecoveryChartData, getCyclesChartData, getWorkoutsChartData, getSleepChartData,
    getAIContext,
  };
})();
