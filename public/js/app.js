// HealthOS SPA — Router, Auth, Sync, Utilities (Browser SQLite version)

(function () {
  const KJ_TO_KCAL = 1 / 4.184;

  const state = {
    authenticated: false,
    profile: null,
    currentPage: null,
    syncing: false,
    energyUnit: 'kcal',
    dbReady: false,
  };

  // --- Utilities ---

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function msToHours(ms) {
    if (!ms) return '0h 0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function msToDecimalHours(ms) {
    return ms ? (ms / 3600000).toFixed(1) : '0';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
  }

  function recoveryColor(score) {
    if (score == null) return 'text-gray-500';
    if (score >= 67) return 'recovery-green';
    if (score >= 34) return 'recovery-yellow';
    return 'recovery-red';
  }

  function recoveryColorHex(score) {
    if (score == null) return '#6b7280';
    if (score >= 67) return '#22c55e';
    if (score >= 34) return '#eab308';
    return '#ef4444';
  }

  function formatEnergy(kj) {
    if (kj == null) return '—';
    if (state.energyUnit === 'kJ') return Math.round(kj) + ' kJ';
    return Math.round(kj * KJ_TO_KCAL) + ' kcal';
  }

  function energyLabel() {
    return state.energyUnit === 'kJ' ? 'kJ' : 'kcal';
  }

  async function apiFetch(url, opts = {}) {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      state.authenticated = false;
      render();
      throw new Error('Not authenticated');
    }
    return res;
  }

  async function apiJSON(url, opts = {}) {
    const res = await apiFetch(url, opts);
    return res.json();
  }

  // --- Auth ---

  async function checkAuth() {
    try {
      const data = await apiJSON('/auth/status');
      state.authenticated = data.authenticated;
      if (state.authenticated && state.dbReady) {
        const profile = window.healthDB.getProfile();
        state.profile = profile ? { firstName: profile.first_name, lastName: profile.last_name, email: profile.email } : null;
      }
    } catch {
      state.authenticated = false;
    }
    render();

    // Auto-sync after login if local DB has no data yet
    if (state.authenticated && state.dbReady && !state.profile) {
      syncAll();
    }
  }

  async function logout() {
    await fetch('/auth/logout', { method: 'POST' });
    state.authenticated = false;
    state.profile = null;
    render();
  }

  // --- Sync ---

  async function syncAll() {
    if (state.syncing || !state.dbReady) return;
    state.syncing = true;
    const overlay = $('#sync-overlay');
    const progress = $('#sync-progress');
    const statusText = $('#sync-status-text');

    $$('.sync-spinning').forEach(el => el.classList.remove('sync-spinning'));
    $('#sidebar-sync-btn')?.classList.add('sync-spinning');
    $('#mobile-sync-btn')?.classList.add('sync-spinning');

    const types = window.healthSync.SYNC_ORDER;
    progress.innerHTML = types.map(t => `
      <div class="sync-item pending" id="sync-${t}">
        <svg class="sync-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke-width="2" stroke-dasharray="4 4"/>
        </svg>
        <span class="sync-name">${t.replace('_', ' ')}</span>
        <span class="sync-status">pending</span>
      </div>
    `).join('');

    overlay.classList.remove('hidden');
    statusText.textContent = 'Starting sync...';

    try {
      for (const type of types) {
        const item = $(`#sync-${type}`);
        item.className = 'sync-item syncing';
        item.querySelector('.sync-icon').innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>';
        item.querySelector('.sync-status').textContent = 'syncing...';
        statusText.textContent = `Syncing ${type.replace('_', ' ')}...`;

        try {
          const result = await window.healthSync.syncDataType(type);
          item.className = 'sync-item completed';
          item.querySelector('.sync-icon').innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
          item.querySelector('.sync-status').textContent = result.count != null ? `${result.count} records` : 'done';
        } catch (err) {
          item.className = 'sync-item error';
          item.querySelector('.sync-icon').innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
          item.querySelector('.sync-status').textContent = 'error';
        }
      }

      // Update profile from local DB after sync
      const profile = window.healthDB.getProfile();
      state.profile = profile ? { firstName: profile.first_name, lastName: profile.last_name, email: profile.email } : null;
      if (state.profile) {
        $('#sidebar-user').textContent = `${state.profile.firstName || ''} ${state.profile.lastName || ''}`.trim();
      }

      statusText.textContent = 'Sync complete!';
    } catch (err) {
      statusText.textContent = `Error: ${err.message}`;
    }

    setTimeout(() => {
      overlay.classList.add('hidden');
      state.syncing = false;
      $('#sidebar-sync-btn')?.classList.remove('sync-spinning');
      $('#mobile-sync-btn')?.classList.remove('sync-spinning');
      // Reload current page
      navigateTo(state.currentPage || 'dashboard');
    }, 1200);
  }

  // --- Router ---

  function getHash() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    return hash;
  }

  function navigateTo(page) {
    state.currentPage = page;

    // Update nav highlights
    $$('.nav-link, .mobile-nav-link').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    const container = $('#page-content');
    container.innerHTML = '<div class="spinner"></div>';

    switch (page) {
      case 'dashboard':
        window.healthOS.renderDashboard(container);
        break;
      case 'recovery':
        window.healthOS.renderDataBrowser(container, 'recovery');
        break;
      case 'sleep':
        window.healthOS.renderDataBrowser(container, 'sleep');
        break;
      case 'workouts':
        window.healthOS.renderDataBrowser(container, 'workouts');
        break;
      case 'cycles':
        window.healthOS.renderDataBrowser(container, 'cycles');
        break;
      case 'chat':
        window.healthOS.renderChat(container);
        break;
      default:
        container.innerHTML = '<div class="empty-state"><p>Page not found</p></div>';
    }
  }

  function render() {
    const sidebar = $('#sidebar');
    const loginScreen = $('#login-screen');
    const pageContainer = $('#page-container');
    const mobileNav = $('#mobile-nav');

    if (!state.authenticated) {
      sidebar.classList.add('hidden');
      sidebar.classList.remove('md:flex');
      loginScreen.classList.remove('hidden');
      loginScreen.classList.add('flex');
      pageContainer.classList.add('hidden');
      mobileNav.classList.add('hidden');
      return;
    }

    sidebar.classList.remove('hidden');
    sidebar.classList.add('md:flex');
    loginScreen.classList.add('hidden');
    loginScreen.classList.remove('flex');
    pageContainer.classList.remove('hidden');
    mobileNav.classList.remove('hidden');

    // Update user name
    if (state.profile) {
      $('#sidebar-user').textContent = `${state.profile.firstName || ''} ${state.profile.lastName || ''}`.trim();
    }

    navigateTo(getHash());
  }

  // --- Init ---

  window.addEventListener('hashchange', () => {
    if (state.authenticated) navigateTo(getHash());
  });

  // Expose shared API
  window.healthOS = {
    state,
    $, $$,
    apiFetch, apiJSON,
    msToHours, msToDecimalHours, formatDate, formatDateTime, shortDate,
    recoveryColor, recoveryColorHex,
    formatEnergy, energyLabel,
    syncAll, logout,
    // Populated by other modules:
    renderDashboard: () => {},
    renderDataBrowser: () => {},
    renderChat: () => {},
  };

  // Init: load DB → load config → check auth
  async function init() {
    try {
      await window.healthDB.initDb();
      state.dbReady = true;
      console.log('[App] DB ready');
    } catch (err) {
      console.error('[App] DB init failed:', err);
    }

    try {
      const cfg = await fetch('/api/config').then(r => r.json());
      state.energyUnit = cfg.energyUnit || 'kcal';
    } catch { /* ignore */ }

    await checkAuth();
  }

  init();
})();
