const crypto = require('crypto');
const authStore = require('./auth-store');

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const SCOPES = 'read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement offline';

// --- Rate Limiter (token bucket) ---

class RateLimiter {
  constructor(maxPerMinute = 90, maxPerDay = 9500) {
    this.maxPerMinute = maxPerMinute;
    this.maxPerDay = maxPerDay;
    this.minuteTokens = maxPerMinute;
    this.dayTokens = maxPerDay;
    this.lastMinuteRefill = Date.now();
    this.lastDayRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const minuteElapsed = (now - this.lastMinuteRefill) / 60000;
    if (minuteElapsed >= 1) {
      this.minuteTokens = this.maxPerMinute;
      this.lastMinuteRefill = now;
    }
    const dayElapsed = (now - this.lastDayRefill) / 86400000;
    if (dayElapsed >= 1) {
      this.dayTokens = this.maxPerDay;
      this.lastDayRefill = now;
    }
  }

  async acquire() {
    this.refill();
    if (this.minuteTokens <= 0) {
      const waitMs = 60000 - (Date.now() - this.lastMinuteRefill);
      console.log(`[Rate Limiter] Minute limit reached, waiting ${Math.ceil(waitMs / 1000)}s`);
      await sleep(Math.max(waitMs, 1000));
      this.refill();
    }
    if (this.dayTokens <= 0) {
      throw new Error('Daily API rate limit reached (10,000/day). Try again tomorrow.');
    }
    this.minuteTokens--;
    this.dayTokens--;
  }
}

const rateLimiter = new RateLimiter();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- OAuth helpers ---

function generateState() {
  return crypto.randomBytes(4).toString('hex'); // exactly 8 chars
}

function getAuthUrl(config) {
  const state = generateState();
  const params = new URLSearchParams({
    client_id: config.whoop.clientId,
    redirect_uri: config.whoop.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return { url: `${WHOOP_AUTH_URL}?${params}`, state };
}

async function exchangeCode(sessionId, code, config) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.whoop.clientId,
    client_secret: config.whoop.clientSecret,
    redirect_uri: config.whoop.redirectUri,
  });

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  authStore.saveTokens(sessionId, data.access_token, data.refresh_token, data.expires_in, data.scope);
  return data;
}

async function refreshAccessToken(sessionId, config) {
  const tokens = authStore.getTokens(sessionId);
  if (!tokens) throw new Error('No tokens stored — user must re-authenticate');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: config.whoop.clientId,
    client_secret: config.whoop.clientSecret,
  });

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 400) {
      authStore.deleteTokens(sessionId);
      throw new Error('Refresh token invalid — user must re-authenticate');
    }
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  // WHOOP rotates BOTH tokens on refresh — save both immediately
  authStore.saveTokens(sessionId, data.access_token, data.refresh_token, data.expires_in, data.scope);
  return data;
}

async function getValidToken(sessionId, config) {
  let tokens = authStore.getTokens(sessionId);
  if (!tokens) throw new Error('Not authenticated');

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at <= now + 60) {
    // Token expired or expiring within 60s — refresh
    console.log('[WHOOP] Refreshing access token...');
    await refreshAccessToken(sessionId, config);
    tokens = authStore.getTokens(sessionId);
  }
  return tokens.access_token;
}

// --- API fetcher with retry ---

async function apiFetch(sessionId, path, config, params = {}) {
  await rateLimiter.acquire();

  const token = await getValidToken(sessionId, config);
  const url = new URL(`${WHOOP_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10);
    console.log(`[WHOOP] Rate limited (429), retrying in ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return apiFetch(sessionId, path, config, params);
  }

  if (res.status === 401) {
    // Token may have expired mid-request — try refresh once
    console.log('[WHOOP] 401 received, attempting token refresh...');
    await refreshAccessToken(sessionId, config);
    return apiFetch(sessionId, path, config, params);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WHOOP API error ${res.status} on ${path}: ${text}`);
  }

  return res.json();
}

// --- Paginated fetcher ---

async function fetchPaginated(sessionId, path, config, params = {}) {
  const allRecords = [];
  let nextToken = null;

  do {
    const queryParams = { ...params, limit: 25 };
    if (nextToken) queryParams.nextToken = nextToken;

    const data = await apiFetch(sessionId, path, config, queryParams);
    const records = data.records || [];
    allRecords.push(...records);
    nextToken = data.next_token || null;

    if (records.length > 0) {
      console.log(`[WHOOP] Fetched ${records.length} records from ${path} (total: ${allRecords.length})`);
    }
  } while (nextToken);

  return allRecords;
}

// --- Endpoint-specific fetchers ---

async function fetchProfile(sessionId, config) {
  return apiFetch(sessionId, '/v1/user/profile/basic', config);
}

async function fetchBodyMeasurements(sessionId, config) {
  return apiFetch(sessionId, '/v1/user/measurement/body', config);
}

async function fetchCycles(sessionId, config, startDate, endDate) {
  const params = {};
  if (startDate) params.start = startDate;
  if (endDate) params.end = endDate;
  return fetchPaginated(sessionId, '/v2/cycle', config, params);
}

async function fetchRecovery(sessionId, config, startDate, endDate) {
  const params = {};
  if (startDate) params.start = startDate;
  if (endDate) params.end = endDate;
  return fetchPaginated(sessionId, '/v2/recovery', config, params);
}

async function fetchSleep(sessionId, config, startDate, endDate) {
  const params = {};
  if (startDate) params.start = startDate;
  if (endDate) params.end = endDate;
  return fetchPaginated(sessionId, '/v2/activity/sleep', config, params);
}

async function fetchWorkouts(sessionId, config, startDate, endDate) {
  const params = {};
  if (startDate) params.start = startDate;
  if (endDate) params.end = endDate;
  return fetchPaginated(sessionId, '/v2/activity/workout', config, params);
}

module.exports = {
  getAuthUrl, exchangeCode, refreshAccessToken, getValidToken,
  fetchProfile, fetchBodyMeasurements,
  fetchCycles, fetchRecovery, fetchSleep, fetchWorkouts,
};
