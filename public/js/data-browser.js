// HealthOS Data Browser — Paginated tables for recovery, sleep, workouts, cycles

(function () {
  const PAGE_SIZE = 20;

  const tableConfigs = {
    recovery: {
      title: 'Recovery',
      endpoint: '/api/recovery',
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
      endpoint: '/api/sleep',
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
      endpoint: '/api/workouts',
      columns: [
        { key: 'start_time', label: 'Date', format: v => window.healthOS.formatDateTime(v) },
        { key: 'sport_name', label: 'Activity', format: v => v || 'Unknown' },
        { key: 'score_strain', label: 'Strain', format: v => v != null ? v.toFixed(1) : '—' },
        { key: 'score_average_heart_rate', label: 'Avg HR', format: v => v != null ? v + ' bpm' : '—' },
        { key: 'score_max_heart_rate', label: 'Max HR', format: v => v != null ? v + ' bpm' : '—' },
        { key: 'score_kilojoule', label: 'Energy', format: v => window.healthOS.formatEnergy(v) },
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
      endpoint: '/api/cycles',
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

  async function renderDataBrowser(container, type) {
    const config = tableConfigs[type];
    if (!config) {
      container.innerHTML = '<div class="empty-state"><p>Unknown data type</p></div>';
      return;
    }

    let currentOffset = 0;

    async function loadPage(offset) {
      currentOffset = offset;

      try {
        const data = await window.healthOS.apiJSON(`${config.endpoint}?limit=${PAGE_SIZE}&offset=${offset}`);
        renderTable(data);
      } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Failed to load data</p><p>${err.message}</p></div>`;
      }
    }

    function renderTable(result) {
      const { data, total } = result;
      const totalPages = Math.ceil(total / PAGE_SIZE);
      const currentPage = Math.floor(currentOffset / PAGE_SIZE) + 1;

      if (!data || data.length === 0) {
        container.innerHTML = `
          <div class="mb-6">
            <h2 class="text-xl font-bold text-white mb-1">${config.title}</h2>
            <p class="text-sm text-gray-500">${total} records</p>
          </div>
          <div class="empty-state"><p>No data yet</p><p>Sync your WHOOP data to get started</p></div>
        `;
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

      document.getElementById('page-prev')?.addEventListener('click', () => {
        if (currentOffset >= PAGE_SIZE) loadPage(currentOffset - PAGE_SIZE);
      });
      document.getElementById('page-next')?.addEventListener('click', () => {
        if (currentOffset + PAGE_SIZE < total) loadPage(currentOffset + PAGE_SIZE);
      });
    }

    await loadPage(0);
  }

  window.healthOS.renderDataBrowser = renderDataBrowser;
})();
