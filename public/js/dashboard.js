// HealthOS Dashboard — Overview cards + Chart.js charts with time range selector

(function () {
  const chartInstances = [];
  let currentRange = '30';

  const RANGES = [
    { value: '30', label: '30d' },
    { value: '90', label: '90d' },
    { value: '180', label: '180d' },
    { value: '365', label: '1y' },
    { value: '730', label: '2y' },
    { value: '1095', label: '3y' },
    { value: '1825', label: '5y' },
    { value: 'max', label: 'Max' },
  ];

  function destroyCharts() {
    chartInstances.forEach(c => c.destroy());
    chartInstances.length = 0;
  }

  function createChart(canvas, config) {
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
          ticks: { color: '#6b7280', font: { size: 10 }, maxTicksLimit: 12, ...scale.ticks },
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

  function rangeLabel() {
    return RANGES.find(r => r.value === currentRange)?.label || '30d';
  }

  async function renderDashboard(container) {
    destroyCharts();
    await loadDashboard(container);
  }

  async function loadDashboard(container) {
    destroyCharts();

    let data;
    try {
      const param = currentRange === 'max' ? 'max' : currentRange;
      data = await window.healthOS.apiJSON(`/api/dashboard?days=${param}`);
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p>Failed to load dashboard data</p><p>Try syncing your data first</p></div>';
      return;
    }

    const { latestRecovery, latestCycle, latestSleep, recoveryRange, cyclesRange, sleepRange, workoutsRange } = data;

    const recoveryScore = latestRecovery?.recovery_score;
    const recoveryColorClass = window.healthOS.recoveryColor(recoveryScore);
    const strain = latestCycle?.score_strain;
    const sleepMs = latestSleep ? (latestSleep.score_stage_summary_total_light_sleep_time_milli || 0) +
      (latestSleep.score_stage_summary_total_slow_wave_sleep_time_milli || 0) +
      (latestSleep.score_stage_summary_total_rem_sleep_time_milli || 0) : 0;
    const sleepPerf = latestSleep?.score_sleep_performance_percentage;
    const hrv = latestRecovery?.hrv_rmssd_milli;

    const rangeBtns = RANGES.map(r =>
      `<button class="range-btn px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${r.value === currentRange ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}" data-range="${r.value}">${r.label}</button>`
    ).join('');

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 class="text-xl font-bold text-white mb-1">Dashboard</h2>
          <p class="text-sm text-gray-500">Your health at a glance</p>
        </div>
        <div class="flex gap-1.5 flex-wrap" id="range-selector">${rangeBtns}</div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div class="stat-card">
          <div class="stat-label">Recovery</div>
          <div class="stat-value ${recoveryColorClass}">${recoveryScore != null ? Math.round(recoveryScore) + '%' : '—'}</div>
          <div class="stat-sub">RHR ${latestRecovery?.resting_heart_rate != null ? Math.round(latestRecovery.resting_heart_rate) + ' bpm' : '—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Strain</div>
          <div class="stat-value text-blue-400">${strain != null ? strain.toFixed(1) : '—'}</div>
          <div class="stat-sub">${window.healthOS.formatEnergy(latestCycle?.score_kilojoule)}</div>
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

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="chart-card">
          <h3>Recovery Trend (${rangeLabel()})</h3>
          <div style="height:220px"><canvas id="chart-recovery"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>HRV Trend (${rangeLabel()})</h3>
          <div style="height:220px"><canvas id="chart-hrv"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Daily Strain (${rangeLabel()})</h3>
          <div style="height:220px"><canvas id="chart-strain"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Sleep Breakdown (${rangeLabel()})</h3>
          <div style="height:220px"><canvas id="chart-sleep"></canvas></div>
        </div>
      </div>
    `;

    // Wire up range selector
    document.getElementById('range-selector')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.range-btn');
      if (!btn || btn.dataset.range === currentRange) return;
      currentRange = btn.dataset.range;
      loadDashboard(container);
    });

    // For large datasets, thin out labels to avoid clutter
    const thin = (arr, maxPoints) => {
      if (!arr || arr.length <= maxPoints) return arr;
      const step = Math.ceil(arr.length / maxPoints);
      return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
    };

    const maxLabels = 60;
    const thinRecovery = thin(recoveryRange, maxLabels);
    const thinCycles = thin(cyclesRange, maxLabels);
    const thinSleep = thin(sleepRange, maxLabels);

    // --- Recovery trend chart ---
    if (thinRecovery?.length) {
      createChart(document.getElementById('chart-recovery'), {
        type: 'line',
        data: {
          labels: thinRecovery.map(r => window.healthOS.shortDate(r.start_time)),
          datasets: [{
            label: 'Recovery %',
            data: thinRecovery.map(r => r.recovery_score),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: thinRecovery.length > 90 ? 0 : 2,
            pointHoverRadius: 4,
            borderWidth: thinRecovery.length > 180 ? 1.5 : 2,
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
    if (thinRecovery?.length) {
      createChart(document.getElementById('chart-hrv'), {
        type: 'line',
        data: {
          labels: thinRecovery.map(r => window.healthOS.shortDate(r.start_time)),
          datasets: [{
            label: 'HRV (ms)',
            data: thinRecovery.map(r => r.hrv_rmssd_milli),
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6,182,212,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: thinRecovery.length > 90 ? 0 : 2,
            pointHoverRadius: 4,
            borderWidth: thinRecovery.length > 180 ? 1.5 : 2,
          }],
        },
        options: {
          scales: { y: { beginAtZero: false }, x: {} },
        },
      });
    }

    // --- Strain bar chart ---
    if (thinCycles?.length) {
      createChart(document.getElementById('chart-strain'), {
        type: thinCycles.length > 90 ? 'line' : 'bar',
        data: {
          labels: thinCycles.map(c => window.healthOS.shortDate(c.start_time)),
          datasets: [{
            label: 'Strain',
            data: thinCycles.map(c => c.score_strain),
            backgroundColor: thinCycles.length > 90 ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.6)',
            borderColor: '#3b82f6',
            borderWidth: thinCycles.length > 90 ? 1.5 : 1,
            borderRadius: thinCycles.length > 90 ? undefined : 3,
            fill: thinCycles.length > 90,
            tension: 0.3,
            pointRadius: 0,
          }],
        },
        options: {
          scales: { y: { beginAtZero: true }, x: {} },
        },
      });
    }

    // --- Sleep breakdown stacked bar ---
    if (thinSleep?.length) {
      const useLines = thinSleep.length > 90;
      createChart(document.getElementById('chart-sleep'), {
        type: useLines ? 'line' : 'bar',
        data: {
          labels: thinSleep.map(s => window.healthOS.shortDate(s.start_time)),
          datasets: useLines ? [
            { label: 'Total Sleep', data: thinSleep.map(s => +((s.light + s.deep + s.rem) / 3600000).toFixed(1)), borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
          ] : [
            { label: 'Deep', data: thinSleep.map(s => +(s.deep / 3600000).toFixed(1)), backgroundColor: '#6366f1', borderRadius: 2 },
            { label: 'REM', data: thinSleep.map(s => +(s.rem / 3600000).toFixed(1)), backgroundColor: '#a855f7', borderRadius: 2 },
            { label: 'Light', data: thinSleep.map(s => +(s.light / 3600000).toFixed(1)), backgroundColor: '#38bdf8', borderRadius: 2 },
            { label: 'Awake', data: thinSleep.map(s => +(s.awake / 3600000).toFixed(1)), backgroundColor: '#f87171', borderRadius: 2 },
          ],
        },
        options: {
          scales: useLines
            ? { y: { title: { display: true, text: 'Hours', color: '#6b7280' } }, x: {} }
            : { y: { stacked: true, title: { display: true, text: 'Hours', color: '#6b7280' } }, x: { stacked: true } },
        },
      });
    }

  }

  window.healthOS.renderDashboard = renderDashboard;
})();
