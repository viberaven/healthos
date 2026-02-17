const { GoogleGenAI } = require('@google/genai');
const db = require('./db');

let client = null;

function getClient(config) {
  if (!client) {
    client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }
  return client;
}

function msToH(ms) {
  return ms ? (ms / 3600000).toFixed(1) : '';
}

function n(v, d) {
  if (v == null) return '';
  return d != null ? v.toFixed(d) : String(v);
}

function energy(kj, unit) {
  if (kj == null) return '';
  if (unit === 'kJ') return String(Math.round(kj));
  return String(Math.round(kj / 4.184));
}

function buildSystemPrompt(context, config) {
  const { recovery365d, sleep365d, workouts365d, cycles365d, profile, bodyMeasurements } = context;
  const eUnit = config.display?.energyUnit || 'kcal';

  let profileInfo = '';
  if (profile) {
    profileInfo = `User: ${profile.first_name || ''} ${profile.last_name || ''}\n`;
  }
  if (bodyMeasurements) {
    profileInfo += `Height: ${bodyMeasurements.height_meter}m, Weight: ${bodyMeasurements.weight_kilogram}kg, Max HR: ${bodyMeasurements.max_heart_rate}bpm\n`;
  }

  // Recovery: compact CSV — date,recovery%,hrv_ms,rhr,spo2,skin_temp
  const recoveryCSV = recovery365d.map(r =>
    `${r.start_time?.slice(0, 10)},${n(r.recovery_score, 0)},${n(r.hrv_rmssd_milli, 1)},${n(r.resting_heart_rate, 0)},${n(r.spo2_percentage, 1)},${n(r.skin_temp_celsius, 1)}`
  ).join('\n');

  // Sleep: compact CSV — date,total_h,light_h,deep_h,rem_h,awake_h,perf%,eff%,resp_rate
  const sleepCSV = sleep365d.map(s => {
    const total = msToH((s.light || 0) + (s.deep || 0) + (s.rem || 0));
    return `${s.start_time?.slice(0, 10)},${total},${msToH(s.light)},${msToH(s.deep)},${msToH(s.rem)},${msToH(s.awake)},${n(s.performance, 0)},${n(s.efficiency, 0)},${n(s.respiratory_rate, 1)}`;
  }).join('\n');

  // Cycles: compact CSV — date,strain,energy,avg_hr
  const cyclesCSV = cycles365d.map(c =>
    `${c.start_time?.slice(0, 10)},${n(c.score_strain, 1)},${energy(c.score_kilojoule, eUnit)},${n(c.score_average_heart_rate, 0)}`
  ).join('\n');

  // Workouts: compact CSV — date,sport,strain,avg_hr,max_hr,energy,distance_m
  const workoutsCSV = workouts365d.map(w =>
    `${w.start_time?.slice(0, 10)},${w.sport_name || 'Unknown'},${n(w.score_strain, 1)},${n(w.score_average_heart_rate, 0)},${n(w.score_max_heart_rate, 0)},${energy(w.score_kilojoule, eUnit)},${n(w.score_distance_meter, 0)}`
  ).join('\n');

  return `You are a health data analyst assistant for HealthOS. You have access to the user's WHOOP health data for the last year (365 days). All daily data is provided below in CSV format.

${profileInfo}
=== Recovery (${recovery365d.length} days) ===
date,recovery%,hrv_ms,rhr,spo2%,skin_temp_c
${recoveryCSV || 'No data'}

=== Sleep (${sleep365d.length} nights) ===
date,total_h,light_h,deep_h,rem_h,awake_h,performance%,efficiency%,resp_rate
${sleepCSV || 'No data'}

=== Daily Cycles (${cycles365d.length} days) ===
date,strain,${eUnit},avg_hr
${cyclesCSV || 'No data'}

=== Workouts (${workouts365d.length} sessions) ===
date,sport,strain,avg_hr,max_hr,${eUnit},distance_m
${workoutsCSV || 'No data'}

GUIDELINES:
- You have the FULL daily data for the last year — use it to identify trends, patterns, weekly/monthly averages, and correlations
- Reference specific numbers and date ranges when answering questions
- Provide actionable health insights and trends
- Be encouraging but honest about areas for improvement
- When the user asks about trends or wants a visualization, output a Chart.js config inside a chartjs code block
- Format chart configs as valid JSON that Chart.js can render directly
- Use dark theme colors: backgrounds transparent, grid colors rgba(255,255,255,0.1)
- Use these colors: green #22c55e, blue #3b82f6, red #ef4444, yellow #eab308, purple #a855f7, cyan #06b6d4
- Keep chart configs compact — labels as short dates (MM/DD), datasets with proper colors
- For long time ranges (>60 data points), use line charts with pointRadius:0 and tension:0.3
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
  const ai = getClient(config);
  const context = db.getAIContext();
  const systemPrompt = buildSystemPrompt(context, config);

  // Load chat history for context
  const history = db.getChatHistory(sessionId, 20);

  // Build contents array with Gemini role format (user/model)
  const contents = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  // Save user message
  db.saveChatMessage(sessionId, 'user', message);

  const response = await ai.models.generateContentStream({
    model: config.gemini.model,
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
    },
  });

  let fullResponse = '';

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) {
      fullResponse += text;
      yield text;
    }
  }

  // Save assistant response
  db.saveChatMessage(sessionId, 'assistant', fullResponse);
}

module.exports = { streamChat };
