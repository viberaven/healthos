// HealthOS Dashboard — Overview cards + Chart.js charts

(function () {
  const chartInstances = [];

  function destroyCharts() {
    chartInstances.forEach(c => c.destroy());
    chartInstances.length = 0;
  }

  function createChart(canvas, config) {
    // Apply dark theme defaults
    const defaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
      },
      scales: {},
    };

    if (config.options?.scales) {
      for (const [key, scale] of Object.entries(config.options.scales)) {
        config.options.scales[key] = {
          ...scale,
          ticks: { color: '#6b7280', font: { size: 10 }, ...scale.ticks },
          grid: { color: 'rgba(255,255,255,0.06)', ...scale.grid },
        };
      }
    }

    config.options = { ...defaults, ...config.options };
    if (config.options.plugins) {
      config.options.plugins = { ...defaults.plugins, ...config.options.plugins };
    }

    const chart = new Chart(canvas, config);
    chartInstances.push(chart);
    return chart;
  }

  async function renderDashboard(container) {
    destroyCharts();

    let data;
    try {
      data = await window.healthOS.apiJSON('/api/dashboard');
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p>Failed to load dashboard data</p><p>Try syncing your data first</p></div>';
      return;
    }

    const { latestRecovery, latestCycle, latestSleep, recovery30d, cycles30d, sleep30d, recentWorkouts } = data;

    // Overview cards
    const recoveryScore = latestRecovery?.recovery_score;
    const recoveryColorClass = window.healthOS.recoveryColor(recoveryScore);
    const strain = latestCycle?.score_strain;
    const sleepMs = latestSleep ? (latestSleep.score_stage_summary_total_light_sleep_time_milli || 0) +
      (latestSleep.score_stage_summary_total_slow_wave_sleep_time_milli || 0) +
      (latestSleep.score_stage_summary_total_rem_sleep_time_milli || 0) : 0;
    const sleepPerf = latestSleep?.score_sleep_performance_percentage;
    const hrv = latestRecovery?.hrv_rmssd_milli;

    container.innerHTML = `
      <div class="mb-6">
        <h2 class="text-xl font-bold text-white mb-1">Dashboard</h2>
        <p class="text-sm text-gray-500">Your health at a glance</p>
      </div>

      <!-- Overview Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div class="stat-card">
          <div class="stat-label">Recovery</div>
          <div class="stat-value ${recoveryColorClass}">${recoveryScore != null ? Math.round(recoveryScore) + '%' : '—'}</div>
          <div class="stat-sub">RHR ${latestRecovery?.resting_heart_rate != null ? Math.round(latestRecovery.resting_heart_rate) + ' bpm' : '—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Strain</div>
          <div class="stat-value text-blue-400">${strain != null ? strain.toFixed(1) : '—'}</div>
          <div class="stat-sub">${latestCycle?.score_kilojoule != null ? Math.round(latestCycle.score_kilojoule) + ' kJ' : '—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Sleep</div>
          <div class="stat-value text-purple-400">${sleepMs ? window.healthOS.msToHours(sleepMs) : '—'}</div>
          <div class="stat-sub">Performance ${sleepPerf != null ? Math.round(sleepPerf) + '%' : '—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">HRV</div>
          <div class="stat-value text-cyan-400">${hrv != null ? hrv.toFixed(0) : '—'}</div>
          <div class="stat-sub">RMSSD (ms)</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="chart-card">
          <h3>Recovery Trend (30d)</h3>
          <div style="height:220px"><canvas id="chart-recovery"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>HRV Trend (30d)</h3>
          <div style="height:220px"><canvas id="chart-hrv"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Daily Strain (30d)</h3>
          <div style="height:220px"><canvas id="chart-strain"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Sleep Breakdown (30d)</h3>
          <div style="height:220px"><canvas id="chart-sleep"></canvas></div>
        </div>
        <div class="chart-card lg:col-span-2">
          <h3>Recent Workouts by Strain</h3>
          <div style="height:${Math.max(180, (recentWorkouts?.length || 1) * 32)}px"><canvas id="chart-workouts"></canvas></div>
        </div>
      </div>
    `;

    // --- Recovery trend chart ---
    if (recovery30d?.length) {
      createChart(document.getElementById('chart-recovery'), {
        type: 'line',
        data: {
          labels: recovery30d.map(r => window.healthOS.shortDate(r.start_time)),
          datasets: [{
            label: 'Recovery %',
            data: recovery30d.map(r => r.recovery_score),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5,
          }],
        },
        options: {
          scales: {
            y: { min: 0, max: 100 },
            x: {},
          },
        },
      });
    }

    // --- HRV trend chart ---
    if (recovery30d?.length) {
      createChart(document.getElementById('chart-hrv'), {
        type: 'line',
        data: {
          labels: recovery30d.map(r => window.healthOS.shortDate(r.start_time)),
          datasets: [{
            label: 'HRV (ms)',
            data: recovery30d.map(r => r.hrv_rmssd_milli),
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6,182,212,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5,
          }],
        },
        options: {
          scales: { y: { beginAtZero: false }, x: {} },
        },
      });
    }

    // --- Strain bar chart ---
    if (cycles30d?.length) {
      createChart(document.getElementById('chart-strain'), {
        type: 'bar',
        data: {
          labels: cycles30d.map(c => window.healthOS.shortDate(c.start_time)),
          datasets: [{
            label: 'Strain',
            data: cycles30d.map(c => c.score_strain),
            backgroundColor: 'rgba(59,130,246,0.6)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 3,
          }],
        },
        options: {
          scales: { y: { beginAtZero: true }, x: {} },
        },
      });
    }

    // --- Sleep breakdown stacked bar ---
    if (sleep30d?.length) {
      createChart(document.getElementById('chart-sleep'), {
        type: 'bar',
        data: {
          labels: sleep30d.map(s => window.healthOS.shortDate(s.start_time)),
          datasets: [
            { label: 'Deep', data: sleep30d.map(s => +(s.deep / 3600000).toFixed(1)), backgroundColor: '#6366f1', borderRadius: 2 },
            { label: 'REM', data: sleep30d.map(s => +(s.rem / 3600000).toFixed(1)), backgroundColor: '#a855f7', borderRadius: 2 },
            { label: 'Light', data: sleep30d.map(s => +(s.light / 3600000).toFixed(1)), backgroundColor: '#38bdf8', borderRadius: 2 },
            { label: 'Awake', data: sleep30d.map(s => +(s.awake / 3600000).toFixed(1)), backgroundColor: '#f87171', borderRadius: 2 },
          ],
        },
        options: {
          scales: {
            y: { stacked: true, title: { display: true, text: 'Hours', color: '#6b7280' } },
            x: { stacked: true },
          },
        },
      });
    }

    // --- Workouts horizontal bar ---
    if (recentWorkouts?.length) {
      createChart(document.getElementById('chart-workouts'), {
        type: 'bar',
        data: {
          labels: recentWorkouts.map(w => `${w.sport_name || 'Workout'} (${window.healthOS.shortDate(w.start_time)})`),
          datasets: [{
            label: 'Strain',
            data: recentWorkouts.map(w => w.score_strain),
            backgroundColor: recentWorkouts.map((_, i) => {
              const colors = ['#22c55e', '#3b82f6', '#a855f7', '#eab308', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#f43f5e', '#8b5cf6'];
              return colors[i % colors.length];
            }),
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          scales: { x: { beginAtZero: true }, y: {} },
          plugins: { legend: { display: false } },
        },
      });
    }
  }

  window.healthOS.renderDashboard = renderDashboard;
})();
