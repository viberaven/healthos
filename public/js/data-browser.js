// HealthOS Data Browser — Paginated tables for recovery, sleep, workouts, cycles
// Queries local SQLite directly — no network calls

(function () {
  const PAGE_SIZE = 20;

  const VALID_RANGES = { '30': 30, '90': 90, '180': 180, '365': 365, '730': 730, '1095': 1095, '1825': 1825 };
  function parseDays(range) {
    return range === 'max' ? null : VALID_RANGES[range] || 30;
  }

  const tableConfigs = {
    recovery: {
      title: 'Recovery',
      getData: (limit, offset) => ({
        data: window.healthDB.getRecoveries(limit, offset),
        total: window.healthDB.getRecoveryCount(),
      }),
      columns: [
        { key: 'cycle_start', label: 'Date', format: v => window.healthOS.formatDate(v) },
        { key: 'recovery_score', label: 'Recovery', format: (v, row) => `<span class="${window.healthOS.recoveryColor(v)}">${v != null ? Math.round(v) + '%' : '—'}</span>` },
        { key: 'hrv_rmssd_milli', label: 'HRV (ms)', format: v => v != null ? v.toFixed(1) : '—' },
        { key: 'resting_heart_rate', label: 'RHR', format: v => v != null ? Math.round(v) + ' bpm' : '—' },
        { key: 'spo2_percentage', label: 'SpO2', format: v => v != null ? v.toFixed(1) + '%' : '—' },
        { key: 'skin_temp_celsius', label: 'Skin Temp', format: v => v != null ? v.toFixed(1) + '\u00b0C' : '—' },
      ],
    },
    sleep: {
      title: 'Sleep',
      getData: (limit, offset) => ({
        data: window.healthDB.getSleeps(limit, offset),
        total: window.healthDB.getSleepCount(),
      }),
      columns: [
        { key: 'start_time', label: 'Date', format: v => window.healthOS.formatDate(v) },
        {
          key: '_total_sleep', label: 'Total Sleep',
          format: (_, row) => {
            const ms = (row.score_stage_summary_total_light_sleep_time_milli || 0) +
              (row.score_stage_summary_total_slow_wave_sleep_time_milli || 0) +
              (row.score_stage_summary_total_rem_sleep_time_milli || 0);
            return window.healthOS.msToHours(ms);
          },
        },
        { key: 'score_stage_summary_total_slow_wave_sleep_time_milli', label: 'Deep', format: v => window.healthOS.msToHours(v) },
        { key: 'score_stage_summary_total_rem_sleep_time_milli', label: 'REM', format: v => window.healthOS.msToHours(v) },
        { key: 'score_stage_summary_total_light_sleep_time_milli', label: 'Light', format: v => window.healthOS.msToHours(v) },
        { key: 'score_sleep_efficiency_percentage', label: 'Efficiency', format: v => v != null ? Math.round(v) + '%' : '—' },
        { key: 'score_sleep_performance_percentage', label: 'Performance', format: v => v != null ? Math.round(v) + '%' : '—' },
        { key: 'score_respiratory_rate', label: 'Resp Rate', format: v => v != null ? v.toFixed(1) : '—' },
      ],
    },
    workouts: {
      title: 'Workouts',
      getData: (limit, offset) => ({
        data: window.healthDB.getWorkouts(limit, offset),
        total: window.healthDB.getWorkoutCount(),
      }),
      columns: [
        { key: 'start_time', label: 'Date', format: v => window.healthOS.formatDateTime(v) },
        { key: 'sport_name', label: 'Activity', format: v => v || 'Unknown' },
        { key: 'score_strain', label: 'Strain', format: v => v != null ? v.toFixed(1) : '—' },
        { key: 'score_kilojoule', label: 'Energy', format: v => window.healthOS.formatEnergy(v) },
        { key: 'score_average_heart_rate', label: 'Avg HR', format: v => v != null ? v + ' bpm' : '—' },
        { key: 'score_max_heart_rate', label: 'Max HR', format: v => v != null ? v + ' bpm' : '—' },
        {
          key: 'score_distance_meter', label: 'Distance',
          format: v => {
            if (v == null || v === 0) return '—';
            return v >= 1000 ? (v / 1000).toFixed(2) + ' km' : Math.round(v) + ' m';
          },
        },
      ],
    },
    cycles: {
      title: 'Cycles',
      getData: (limit, offset) => ({
        data: window.healthDB.getCycles(limit, offset),
        total: window.healthDB.getCycleCount(),
      }),
      columns: [
        { key: 'start_time', label: 'Start', format: v => window.healthOS.formatDateTime(v) },
        { key: 'end_time', label: 'End', format: v => window.healthOS.formatDateTime(v) },
        { key: 'score_strain', label: 'Strain', format: v => v != null ? v.toFixed(1) : '—' },
        { key: 'score_kilojoule', label: 'Energy', format: v => window.healthOS.formatEnergy(v) },
        { key: 'score_average_heart_rate', label: 'Avg HR', format: v => v != null ? v + ' bpm' : '—' },
        { key: 'score_max_heart_rate', label: 'Max HR', format: v => v != null ? v + ' bpm' : '—' },
      ],
    },
  };

  // --- Recovery charts state ---
  const OWNER = 'recovery-charts';

  const RECOVERY_CHARTS = [
    { id: 'rc-recovery', valueKey: 'recovery_score', label: 'Recovery %', color: 'rgb(34,197,94)', min: 0, max: 100 },
    { id: 'rc-hrv', valueKey: 'hrv_rmssd_milli', label: 'HRV (ms)', color: 'rgb(6,182,212)' },
    { id: 'rc-rhr', valueKey: 'resting_heart_rate', label: 'RHR (bpm)', color: 'rgb(249,115,22)' },
    { id: 'rc-spo2', valueKey: 'spo2_percentage', label: 'SpO2 %', color: 'rgb(168,85,247)' },
    { id: 'rc-temp', valueKey: 'skin_temp_celsius', label: 'Skin Temp (\u00b0C)', color: 'rgb(234,179,8)' },
  ];

  function loadRecoveryCharts(chartsContainer) {
    const C = window.healthOS.charts;
    C.destroyCharts(OWNER);

    let chartData;
    try {
      const days = parseDays(C.getRange());
      chartData = window.healthDB.getRecoveryChartData(days);
    } catch {
      return;
    }

    if (!chartData?.length) return;

    const rl = C.rangeLabel(C.getRange());

    chartsContainer.innerHTML = `
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div></div>
        <div class="flex gap-1.5 flex-wrap" id="recovery-range-selector">${C.renderRangeSelector(C.getRange())}</div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        ${RECOVERY_CHARTS.map(c => `
          <div class="chart-card">
            <h3>${c.label} (${rl})</h3>
            <div style="height:200px"><canvas id="${c.id}"></canvas></div>
          </div>
        `).join('')}
      </div>
    `;

    C.wireRangeSelector('recovery-range-selector', C.getRange(), (range) => {
      C.setRange(range);
      loadRecoveryCharts(chartsContainer);
    });

    for (const chart of RECOVERY_CHARTS) {
      const cfg = C.lineChartConfig(chartData, {
        dateKey: 'start_time',
        valueKey: chart.valueKey,
        label: chart.label,
        color: chart.color,
        min: chart.min,
        max: chart.max,
      });
      if (cfg) C.createChart(OWNER, document.getElementById(chart.id), cfg);
    }
  }

  // --- Sleep charts state ---
  const SLEEP_OWNER = 'sleep-charts';

  const SLEEP_LINE_CHARTS = [
    { id: 'sc-efficiency', valueKey: 'efficiency', label: 'Efficiency %', color: 'rgb(34,197,94)', min: 0, max: 100 },
    { id: 'sc-performance', valueKey: 'performance', label: 'Performance %', color: 'rgb(59,130,246)', min: 0, max: 100 },
    { id: 'sc-resp', valueKey: 'respiratory_rate', label: 'Resp Rate (br/min)', color: 'rgb(249,115,22)' },
  ];

  function loadSleepCharts(chartsContainer) {
    const C = window.healthOS.charts;
    C.destroyCharts(SLEEP_OWNER);

    let chartData;
    try {
      const days = parseDays(C.getRange());
      chartData = window.healthDB.getSleepChartData(days);
    } catch {
      return;
    }

    if (!chartData?.length) return;

    const rl = C.rangeLabel(C.getRange());

    chartsContainer.innerHTML = `
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div></div>
        <div class="flex gap-1.5 flex-wrap" id="sleep-range-selector">${C.renderRangeSelector(C.getRange())}</div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="chart-card">
          <h3>Sleep Breakdown (${rl})</h3>
          <div style="height:200px"><canvas id="sc-breakdown"></canvas></div>
        </div>
        ${SLEEP_LINE_CHARTS.map(c => `
          <div class="chart-card">
            <h3>${c.label} (${rl})</h3>
            <div style="height:200px"><canvas id="${c.id}"></canvas></div>
          </div>
        `).join('')}
      </div>
    `;

    C.wireRangeSelector('sleep-range-selector', C.getRange(), (range) => {
      C.setRange(range);
      loadSleepCharts(chartsContainer);
    });

    // Sleep breakdown (stacked bar / line)
    const breakdownCfg = C.sleepBreakdownConfig(chartData);
    if (breakdownCfg) C.createChart(SLEEP_OWNER, document.getElementById('sc-breakdown'), breakdownCfg);

    // Line charts for efficiency, performance, respiratory rate
    for (const chart of SLEEP_LINE_CHARTS) {
      const cfg = C.lineChartConfig(chartData, {
        dateKey: 'start_time',
        valueKey: chart.valueKey,
        label: chart.label,
        color: chart.color,
        min: chart.min,
        max: chart.max,
      });
      if (cfg) C.createChart(SLEEP_OWNER, document.getElementById(chart.id), cfg);
    }
  }

  // --- Strain/energy/HR charts (shared by cycles and workouts) ---
  const CYCLES_OWNER = 'cycles-charts';
  const WORKOUTS_OWNER = 'workouts-charts';

  const STRAIN_HR_CHARTS = [
    { valueKey: 'score_strain', label: 'Strain', color: 'rgb(59,130,246)' },
    { valueKey: 'score_kilojoule', label: 'Energy (kJ)', color: 'rgb(168,85,247)' },
    { valueKey: 'score_average_heart_rate', label: 'Avg HR (bpm)', color: 'rgb(34,197,94)' },
    { valueKey: 'score_max_heart_rate', label: 'Max HR (bpm)', color: 'rgb(239,68,68)' },
  ];

  function makeStrainHRLoader(owner, dbChartFn, selectorId) {
    function loader(chartsContainer) {
      const C = window.healthOS.charts;
      C.destroyCharts(owner);

      let chartData;
      try {
        const days = parseDays(C.getRange());
        chartData = dbChartFn(days);
      } catch {
        return;
      }

      if (!chartData?.length) return;

      const rl = C.rangeLabel(C.getRange());
      const prefix = selectorId.replace('-range-selector', '');
      const charts = STRAIN_HR_CHARTS.map(c => ({ ...c, id: `${prefix}-${c.valueKey}` }));

      chartsContainer.innerHTML = `
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div></div>
          <div class="flex gap-1.5 flex-wrap" id="${selectorId}">${C.renderRangeSelector(C.getRange())}</div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          ${charts.map(c => `
            <div class="chart-card">
              <h3>${c.label} (${rl})</h3>
              <div style="height:200px"><canvas id="${c.id}"></canvas></div>
            </div>
          `).join('')}
        </div>
      `;

      C.wireRangeSelector(selectorId, C.getRange(), (range) => {
        C.setRange(range);
        loader(chartsContainer);
      });

      for (const chart of charts) {
        const cfg = C.lineChartConfig(chartData, {
          dateKey: 'start_time',
          valueKey: chart.valueKey,
          label: chart.label,
          color: chart.color,
        });
        if (cfg) C.createChart(owner, document.getElementById(chart.id), cfg);
      }
    }
    return loader;
  }

  const loadCyclesCharts = makeStrainHRLoader(CYCLES_OWNER, (days) => window.healthDB.getCyclesChartData(days), 'cycles-range-selector');
  const loadWorkoutsCharts = makeStrainHRLoader(WORKOUTS_OWNER, (days) => window.healthDB.getWorkoutsChartData(days), 'workouts-range-selector');

  // --- Chart loading dispatcher ---

  const CHART_OWNERS = { recovery: OWNER, sleep: SLEEP_OWNER, cycles: CYCLES_OWNER, workouts: WORKOUTS_OWNER };
  const CHART_LOADERS = {
    recovery: loadRecoveryCharts,
    sleep: loadSleepCharts,
    cycles: loadCyclesCharts,
    workouts: loadWorkoutsCharts,
  };

  function loadChartsForType(type) {
    const loader = CHART_LOADERS[type];
    if (!loader) return;
    const el = document.getElementById(`${type}-charts-container`);
    if (el) loader(el);
  }

  // --- Table rendering ---

  function renderDataBrowser(container, type) {
    const C = window.healthOS.charts;
    const config = tableConfigs[type];
    if (!config) {
      container.innerHTML = '<div class="empty-state"><p>Unknown data type</p></div>';
      return;
    }

    // Clean up previous charts
    const owner = CHART_OWNERS[type];
    if (owner) C.destroyCharts(owner);

    let currentOffset = 0;

    function loadPage(offset) {
      currentOffset = offset;

      try {
        const data = config.getData(PAGE_SIZE, offset);
        renderTable(data);
      } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Failed to load data</p><p>${err.message}</p></div>`;
      }
    }

    function renderTable(result) {
      const { data, total } = result;
      const totalPages = Math.ceil(total / PAGE_SIZE);
      const currentPage = Math.floor(currentOffset / PAGE_SIZE) + 1;

      // Charts container for types that have them
      const hasCharts = type in CHART_LOADERS;
      const chartsDiv = hasCharts ? `<div id="${type}-charts-container"></div>` : '';

      if (!data || data.length === 0) {
        container.innerHTML = `
          <div class="mb-6">
            <h2 class="text-xl font-bold text-white mb-1">${config.title}</h2>
            <p class="text-sm text-gray-500">${total} records</p>
          </div>
          ${chartsDiv}
          <div class="empty-state"><p>No data yet</p><p>Sync your WHOOP data to get started</p></div>
        `;
        loadChartsForType(type);
        return;
      }

      const headerCells = config.columns.map(c => `<th>${c.label}</th>`).join('');
      const rows = data.map(row => {
        const cells = config.columns.map(c => {
          const val = c.key.startsWith('_') ? null : row[c.key];
          return `<td>${c.format(val, row)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      container.innerHTML = `
        <div class="mb-6">
          <h2 class="text-xl font-bold text-white mb-1">${config.title}</h2>
          <p class="text-sm text-gray-500">${total} records</p>
        </div>
        ${chartsDiv}
        <div class="chart-card">
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr>${headerCells}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="pagination">
            <button id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
            <span class="page-info">Page ${currentPage} of ${totalPages}</span>
            <button id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      `;

      loadChartsForType(type);

      document.getElementById('page-prev')?.addEventListener('click', () => {
        if (currentOffset >= PAGE_SIZE) loadPage(currentOffset - PAGE_SIZE);
      });
      document.getElementById('page-next')?.addEventListener('click', () => {
        if (currentOffset + PAGE_SIZE < total) loadPage(currentOffset + PAGE_SIZE);
      });
    }

    loadPage(0);
  }

  window.healthOS.renderDataBrowser = renderDataBrowser;
})();
