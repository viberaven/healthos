// HealthOS Dashboard — Overview cards + Chart.js charts with time range selector

(function () {
  const C = window.healthOS.charts;
  const OWNER = 'dashboard';

  async function renderDashboard(container) {
    C.destroyCharts(OWNER);
    await loadDashboard(container);
  }

  async function loadDashboard(container) {
    C.destroyCharts(OWNER);

    let data;
    try {
      const param = C.getRange() === 'max' ? 'max' : C.getRange();
      data = await window.healthOS.apiJSON(`/api/dashboard?days=${param}`);
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><p>Failed to load dashboard data</p><p>Try syncing your data first</p></div>';
      return;
    }

    const { latestRecovery, latestCycle, latestSleep, recoveryRange, cyclesRange, sleepRange } = data;

    const recoveryScore = latestRecovery?.recovery_score;
    const recoveryColorClass = window.healthOS.recoveryColor(recoveryScore);
    const strain = latestCycle?.score_strain;
    const sleepMs = latestSleep ? (latestSleep.score_stage_summary_total_light_sleep_time_milli || 0) +
      (latestSleep.score_stage_summary_total_slow_wave_sleep_time_milli || 0) +
      (latestSleep.score_stage_summary_total_rem_sleep_time_milli || 0) : 0;
    const sleepPerf = latestSleep?.score_sleep_performance_percentage;
    const hrv = latestRecovery?.hrv_rmssd_milli;
    const rl = C.rangeLabel(C.getRange());

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 class="text-xl font-bold text-white mb-1">Dashboard</h2>
          <p class="text-sm text-gray-500">Your health at a glance</p>
        </div>
        <div class="flex gap-1.5 flex-wrap" id="range-selector">${C.renderRangeSelector(C.getRange())}</div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div class="stat-card">
          <div class="stat-label">Recovery</div>
          <div class="stat-value ${recoveryColorClass}">${recoveryScore != null ? Math.round(recoveryScore) + '%' : '—'}</div>
          <div class="stat-sub">RHR ${latestRecovery?.resting_heart_rate != null ? Math.round(latestRecovery.resting_heart_rate) + ' bpm' : '—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">HRV</div>
          <div class="stat-value text-cyan-400">${hrv != null ? hrv.toFixed(0) : '—'}</div>
          <div class="stat-sub">RMSSD (ms)</div>
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
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="chart-card">
          <h3>Recovery Trend (${rl})</h3>
          <div style="height:220px"><canvas id="chart-recovery"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>HRV Trend (${rl})</h3>
          <div style="height:220px"><canvas id="chart-hrv"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Daily Strain (${rl})</h3>
          <div style="height:220px"><canvas id="chart-strain"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Sleep Breakdown (${rl})</h3>
          <div style="height:220px"><canvas id="chart-sleep"></canvas></div>
        </div>
      </div>
    `;

    C.wireRangeSelector('range-selector', C.getRange(), (range) => {
      C.setRange(range);
      loadDashboard(container);
    });

    const thinRecovery = C.thinData(recoveryRange, 60);
    const thinCycles = C.thinData(cyclesRange, 60);
    const thinSleep = C.thinData(sleepRange, 60);

    // --- Recovery trend chart ---
    const recoveryConfig = C.lineChartConfig(recoveryRange, {
      dateKey: 'start_time', valueKey: 'recovery_score',
      label: 'Recovery %', color: 'rgb(34,197,94)', min: 0, max: 100,
    });
    if (recoveryConfig) C.createChart(OWNER, document.getElementById('chart-recovery'), recoveryConfig);

    // --- HRV trend chart ---
    const hrvConfig = C.lineChartConfig(recoveryRange, {
      dateKey: 'start_time', valueKey: 'hrv_rmssd_milli',
      label: 'HRV (ms)', color: 'rgb(6,182,212)',
    });
    if (hrvConfig) C.createChart(OWNER, document.getElementById('chart-hrv'), hrvConfig);

    // --- Strain bar chart ---
    if (thinCycles?.length) {
      C.createChart(OWNER, document.getElementById('chart-strain'), {
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
    const sleepConfig = C.sleepBreakdownConfig(sleepRange);
    if (sleepConfig) C.createChart(OWNER, document.getElementById('chart-sleep'), sleepConfig);

  }

  window.healthOS.renderDashboard = renderDashboard;
})();
