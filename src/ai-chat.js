const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

let client = null;

function getClient(config) {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

function msToHours(ms) {
  return ms ? (ms / 3600000).toFixed(1) : '0';
}

function buildSystemPrompt(context) {
  const { recovery7d, sleep7d, workouts7d, cycles7d, recovery30dAvg, sleep30dAvg, strain30dAvg, profile, bodyMeasurements } = context;

  let profileInfo = '';
  if (profile) {
    profileInfo = `User: ${profile.first_name || ''} ${profile.last_name || ''}\n`;
  }
  if (bodyMeasurements) {
    profileInfo += `Height: ${bodyMeasurements.height_meter}m, Weight: ${bodyMeasurements.weight_kilogram}kg, Max HR: ${bodyMeasurements.max_heart_rate}bpm\n`;
  }

  const recoveryLines = recovery7d.map(r =>
    `  ${r.start_time?.slice(0, 10)}: Recovery ${r.recovery_score?.toFixed(0)}%, HRV ${r.hrv_rmssd_milli?.toFixed(1)}ms, RHR ${r.resting_heart_rate?.toFixed(0)}bpm`
  ).join('\n');

  const sleepLines = sleep7d.map(s =>
    `  ${s.start_time?.slice(0, 10)}: Total ${msToHours(s.light + s.deep + s.rem)}h (Light ${msToHours(s.light)}h, Deep ${msToHours(s.deep)}h, REM ${msToHours(s.rem)}h), Performance ${s.performance?.toFixed(0)}%`
  ).join('\n');

  const workoutLines = workouts7d.map(w =>
    `  ${w.start_time?.slice(0, 10)}: ${w.sport_name} — Strain ${w.score_strain?.toFixed(1)}, Avg HR ${w.score_average_heart_rate}bpm, ${w.score_kilojoule?.toFixed(0)}kJ`
  ).join('\n');

  const cycleLines = cycles7d.map(c =>
    `  ${c.start_time?.slice(0, 10)}: Strain ${c.score_strain?.toFixed(1)}, ${c.score_kilojoule?.toFixed(0)}kJ`
  ).join('\n');

  let agg30d = '';
  if (recovery30dAvg) {
    agg30d += `30-day Avg Recovery: ${recovery30dAvg.avg_recovery?.toFixed(0)}% (range ${recovery30dAvg.min_recovery?.toFixed(0)}–${recovery30dAvg.max_recovery?.toFixed(0)}%)\n`;
    agg30d += `30-day Avg HRV: ${recovery30dAvg.avg_hrv?.toFixed(1)}ms, Avg RHR: ${recovery30dAvg.avg_rhr?.toFixed(0)}bpm\n`;
  }
  if (sleep30dAvg) {
    agg30d += `30-day Avg Sleep: ${msToHours(sleep30dAvg.avg_in_bed)}h, Avg Performance: ${sleep30dAvg.avg_performance?.toFixed(0)}%\n`;
  }
  if (strain30dAvg) {
    agg30d += `30-day Avg Strain: ${strain30dAvg.avg_strain?.toFixed(1)}, Max Strain: ${strain30dAvg.max_strain?.toFixed(1)}\n`;
  }

  return `You are a health data analyst assistant for HealthOS. You have access to the user's WHOOP health data.

${profileInfo}
=== Last 7 Days: Recovery ===
${recoveryLines || '  No data'}

=== Last 7 Days: Sleep ===
${sleepLines || '  No data'}

=== Last 7 Days: Workouts ===
${workoutLines || '  No data'}

=== Last 7 Days: Daily Cycles ===
${cycleLines || '  No data'}

=== 30-Day Aggregates ===
${agg30d || '  No data'}

GUIDELINES:
- Reference specific numbers from the data above when answering questions
- Provide actionable health insights and trends
- Be encouraging but honest about areas for improvement
- When the user asks about trends or wants a visualization, output a Chart.js config inside a chartjs code block
- Format chart configs as valid JSON that Chart.js can render directly
- Use dark theme colors: backgrounds transparent, grid colors rgba(255,255,255,0.1)
- Use these colors: green #22c55e, blue #3b82f6, red #ef4444, yellow #eab308, purple #a855f7, cyan #06b6d4
- Keep chart configs compact — labels as short dates (MM/DD), datasets with proper colors
- IMPORTANT: wrap chart configs in triple backtick blocks with the language identifier "chartjs"

Example chart output:
\`\`\`chartjs
{
  "type": "line",
  "data": {
    "labels": ["02/01", "02/02"],
    "datasets": [{"label": "Recovery %", "data": [65, 72], "borderColor": "#22c55e", "tension": 0.3}]
  },
  "options": {"scales": {"y": {"beginAtZero": false}}}
}
\`\`\`
`;
}

async function* streamChat(message, sessionId, config) {
  const anthropic = getClient(config);
  const context = db.getAIContext();

  // Check if user is asking about trends/longer periods — add extended context
  const trendKeywords = ['trend', 'month', '30 day', 'last month', 'over time', 'compare', 'history', 'progress'];
  const needsExtended = trendKeywords.some(kw => message.toLowerCase().includes(kw));

  let extContext = '';
  if (needsExtended) {
    const ext = db.getExtendedAIContext();
    const rec30 = ext.recovery30d.map(r => `${r.start_time?.slice(0, 10)}:${r.recovery_score?.toFixed(0)}`).join(', ');
    const sleep30 = ext.sleep30d.map(s => `${s.start_time?.slice(0, 10)}:${msToHours(s.light + s.deep + s.rem)}h`).join(', ');
    extContext = `\n\n=== Extended 30-Day Data ===\nRecovery: ${rec30}\nSleep duration: ${sleep30}\n`;
  }

  const systemPrompt = buildSystemPrompt(context) + extContext;

  // Load chat history for context
  const history = db.getChatHistory(sessionId, 20);
  const messages = history.map(h => ({ role: h.role, content: h.content }));
  messages.push({ role: 'user', content: message });

  // Save user message
  db.saveChatMessage(sessionId, 'user', message);

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  let fullResponse = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const text = event.delta.text;
      fullResponse += text;
      yield text;
    }
  }

  // Save assistant response
  db.saveChatMessage(sessionId, 'assistant', fullResponse);
}

module.exports = { streamChat };
