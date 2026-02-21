// HealthOS Browser Sync — Fetches from server proxy, stores in local SQLite

(function () {
  const OVERLAP_HOURS = 2;
  const SYNC_ORDER = ['profile', 'body_measurements', 'cycles', 'recovery', 'sleep', 'workouts'];

  const FETCH_ENDPOINTS = {
    profile: '/api/fetch/profile',
    body_measurements: '/api/fetch/body-measurements',
    cycles: '/api/fetch/cycles',
    recovery: '/api/fetch/recovery',
    sleep: '/api/fetch/sleep',
    workouts: '/api/fetch/workouts',
  };

  function getTimeRange(dataType) {
    const meta = window.healthDB.getSyncStatus(dataType);
    const end = new Date().toISOString();

    if (!meta || !meta.last_synced_at || meta.status === 'never') {
      return { start: null, end };
    }

    const lastSync = new Date(meta.last_synced_at);
    lastSync.setHours(lastSync.getHours() - OVERLAP_HOURS);
    return { start: lastSync.toISOString(), end };
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (res.status === 401) throw new Error('Not authenticated — please re-authenticate');
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async function syncDataType(type, onProgress) {
    const report = (msg) => {
      console.log(`[Sync:${type}] ${msg}`);
      if (onProgress) onProgress(type, msg);
    };

    try {
      window.healthDB.updateSyncStatus(type, 'syncing', null);
      report('Starting...');

      let count = 0;
      const { start, end } = getTimeRange(type);
      const rangeMsg = start ? `from ${start} to ${end}` : 'full history';
      report(`Fetching ${rangeMsg}`);

      const endpoint = FETCH_ENDPOINTS[type];
      let url = endpoint;

      // Add time range params for types that support it
      if (['cycles', 'recovery', 'sleep', 'workouts'].includes(type)) {
        const params = new URLSearchParams();
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        const qs = params.toString();
        if (qs) url += '?' + qs;
      }

      const data = await fetchJSON(url);

      switch (type) {
        case 'profile':
          window.healthDB.upsertProfile(data);
          count = 1;
          break;
        case 'body_measurements':
          window.healthDB.upsertBodyMeasurements(data);
          count = 1;
          break;
        case 'cycles':
          for (const r of data) window.healthDB.upsertCycle(r);
          count = data.length;
          break;
        case 'recovery':
          for (const r of data) window.healthDB.upsertRecovery(r);
          count = data.length;
          break;
        case 'sleep':
          for (const r of data) window.healthDB.upsertSleep(r);
          count = data.length;
          break;
        case 'workouts':
          for (const r of data) window.healthDB.upsertWorkout(r);
          count = data.length;
          break;
      }

      const now = new Date().toISOString();
      window.healthDB.updateSyncStatus(type, 'completed', now, null);
      await window.healthDB.persistDb();
      report(`Completed — ${count} records processed`);
      return { type, status: 'completed', count };
    } catch (err) {
      window.healthDB.updateSyncStatus(type, 'error', null, err.message);
      report(`Error: ${err.message}`);
      return { type, status: 'error', error: err.message };
    }
  }

  async function syncAll(onProgress) {
    const results = [];
    for (const type of SYNC_ORDER) {
      const result = await syncDataType(type, onProgress);
      results.push(result);
      if (result.error && result.error.includes('re-authenticate')) break;
    }
    return results;
  }

  window.healthSync = { syncDataType, syncAll, SYNC_ORDER };
})();
