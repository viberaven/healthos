const db = require('./db');
const whoop = require('./whoop-api');

const OVERLAP_HOURS = 2;
const SYNC_ORDER = ['profile', 'body_measurements', 'cycles', 'recovery', 'sleep', 'workouts'];

function getTimeRange(dataType) {
  const meta = db.getSyncStatus(dataType);
  const end = new Date().toISOString();

  if (!meta || !meta.last_synced_at || meta.status === 'never') {
    // First sync — fetch everything
    return { start: null, end };
  }

  // Subsequent sync — overlap by 2 hours to catch pending scores
  const lastSync = new Date(meta.last_synced_at);
  lastSync.setHours(lastSync.getHours() - OVERLAP_HOURS);
  return { start: lastSync.toISOString(), end };
}

async function syncDataType(type, config, onProgress) {
  const report = (msg) => {
    console.log(`[Sync:${type}] ${msg}`);
    if (onProgress) onProgress(type, msg);
  };

  try {
    db.updateSyncStatus(type, 'syncing', null, null);
    report('Starting...');

    let count = 0;
    const { start, end } = getTimeRange(type);
    const rangeMsg = start ? `from ${start} to ${end}` : 'full history';
    report(`Fetching ${rangeMsg}`);

    switch (type) {
      case 'profile': {
        const data = await whoop.fetchProfile(config);
        db.upsertProfile(data);
        count = 1;
        break;
      }
      case 'body_measurements': {
        const data = await whoop.fetchBodyMeasurements(config);
        db.upsertBodyMeasurements(data);
        count = 1;
        break;
      }
      case 'cycles': {
        const records = await whoop.fetchCycles(config, start, end);
        for (const r of records) db.upsertCycle(r);
        count = records.length;
        break;
      }
      case 'recovery': {
        const records = await whoop.fetchRecovery(config, start, end);
        for (const r of records) db.upsertRecovery(r);
        count = records.length;
        break;
      }
      case 'sleep': {
        const records = await whoop.fetchSleep(config, start, end);
        for (const r of records) db.upsertSleep(r);
        count = records.length;
        break;
      }
      case 'workouts': {
        const records = await whoop.fetchWorkouts(config, start, end);
        for (const r of records) db.upsertWorkout(r);
        count = records.length;
        break;
      }
      default:
        throw new Error(`Unknown data type: ${type}`);
    }

    const now = new Date().toISOString();
    db.updateSyncStatus(type, 'completed', now, null);
    report(`Completed — ${count} records processed`);
    return { type, status: 'completed', count };
  } catch (err) {
    db.updateSyncStatus(type, 'error', null, err.message);
    report(`Error: ${err.message}`);
    return { type, status: 'error', error: err.message };
  }
}

async function syncAll(config, onProgress) {
  const results = [];
  for (const type of SYNC_ORDER) {
    const result = await syncDataType(type, config, onProgress);
    results.push(result);
    // If auth fails on any step, stop
    if (result.error && result.error.includes('re-authenticate')) break;
  }
  return results;
}

module.exports = { syncDataType, syncAll, SYNC_ORDER };
