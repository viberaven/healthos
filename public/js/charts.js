// HealthOS Charts — Shared chart utilities for dashboard and data browser

(function () {
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

  // Global range state shared across all screens
  let currentRange = '30';

  function getRange() { return currentRange; }
  function setRange(r) { currentRange = r; }

  // Per-owner chart instance tracking
  const chartsByOwner = {};

  function destroyCharts(owner) {
    const list = chartsByOwner[owner];
    if (list) {
      list.forEach(c => c.destroy());
      list.length = 0;
    }
  }

  function createChart(owner, canvas, config) {
    if (!chartsByOwner[owner]) chartsByOwner[owner] = [];

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
    chartsByOwner[owner].push(chart);
    return chart;
  }

  function thinData(arr, maxPoints) {
    if (!arr || arr.length <= maxPoints) return arr;
    const step = Math.ceil(arr.length / maxPoints);
    return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
  }

  function rangeLabel(currentRange) {
    return RANGES.find(r => r.value === currentRange)?.label || '30d';
  }

  function renderRangeSelector(currentRange) {
    return RANGES.map(r =>
      `<button class="range-btn px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${r.value === currentRange ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}" data-range="${r.value}">${r.label}</button>`
    ).join('');
  }

  function wireRangeSelector(selectorId, currentRange, onChange) {
    document.getElementById(selectorId)?.addEventListener('click', (e) => {
      const btn = e.target.closest('.range-btn');
      if (!btn || btn.dataset.range === currentRange) return;
      onChange(btn.dataset.range);
    });
  }

  // Shared line chart config builder for trend data
  function lineChartConfig(data, { dateKey, valueKey, label, color, min, max }) {
    const thinned = thinData(data, 60);
    if (!thinned?.length) return null;
    return {
      type: 'line',
      data: {
        labels: thinned.map(r => window.healthOS.shortDate(r[dateKey])),
        datasets: [{
          label,
          data: thinned.map(r => r[valueKey]),
          borderColor: color,
          backgroundColor: color.replace(')', ',0.1)').replace('rgb', 'rgba'),
          fill: true,
          tension: 0.3,
          pointRadius: thinned.length > 90 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: thinned.length > 180 ? 1.5 : 2,
        }],
      },
      options: {
        scales: {
          y: { ...(min != null ? { min } : { beginAtZero: false }), ...(max != null ? { max } : {}) },
          x: {},
        },
      },
    };
  }

  // Sleep breakdown chart config (stacked bar or line depending on data density)
  function sleepBreakdownConfig(data) {
    const thinned = thinData(data, 60);
    if (!thinned?.length) return null;
    const useLines = thinned.length > 90;
    return {
      type: useLines ? 'line' : 'bar',
      data: {
        labels: thinned.map(s => window.healthOS.shortDate(s.start_time)),
        datasets: useLines ? [
          { label: 'Total Sleep', data: thinned.map(s => +((s.light + s.deep + s.rem) / 3600000).toFixed(1)), borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
        ] : [
          { label: 'Deep', data: thinned.map(s => +(s.deep / 3600000).toFixed(1)), backgroundColor: '#6366f1', borderRadius: 2 },
          { label: 'REM', data: thinned.map(s => +(s.rem / 3600000).toFixed(1)), backgroundColor: '#a855f7', borderRadius: 2 },
          { label: 'Light', data: thinned.map(s => +(s.light / 3600000).toFixed(1)), backgroundColor: '#38bdf8', borderRadius: 2 },
          { label: 'Awake', data: thinned.map(s => +(s.awake / 3600000).toFixed(1)), backgroundColor: '#f87171', borderRadius: 2 },
        ],
      },
      options: {
        scales: useLines
          ? { y: { title: { display: true, text: 'Hours', color: '#6b7280' } }, x: {} }
          : { y: { stacked: true, title: { display: true, text: 'Hours', color: '#6b7280' } }, x: { stacked: true } },
      },
    };
  }

  window.healthOS.charts = {
    RANGES,
    getRange,
    setRange,
    destroyCharts,
    createChart,
    thinData,
    rangeLabel,
    renderRangeSelector,
    wireRangeSelector,
    lineChartConfig,
    sleepBreakdownConfig,
  };
})();
