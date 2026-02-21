# HealthOS

Health data dashboard powered by WHOOP API with an AI chat assistant.

Connects to your WHOOP account via OAuth2 and presents your health data through a modern dark-themed dashboard with charts. Health data is stored locally in each user's browser (SQLite WASM with OPFS), while the server handles OAuth sessions in a lightweight SQLite database. Includes an AI assistant (Google Gemini) that can analyze your data and render inline visualizations.

## Features

- **Multi-user support** — each browser gets its own OAuth session; multiple WHOOP accounts can be logged in simultaneously
- **OAuth2 integration** with WHOOP API — fetches cycles, recovery, sleep, workouts, profile, and body measurements
- **Browser-side storage** — all health data lives in SQLite WASM (OPFS-backed), keeping it private to each user's browser
- **Interactive dashboard** with recovery trend, HRV trend, daily strain, and sleep breakdown charts
- **Data browser** with paginated tables for all data types
- **AI chat assistant** powered by Google Gemini — ask questions about your health data and get answers with inline charts
- **Mobile-first** responsive design with Tailwind CSS

## Setup

1. Install dependencies:

```
npm install
```

2. Copy the config template and fill in your credentials:

```
cp config.js.example config.js
```

You'll need:
- **WHOOP OAuth credentials** from https://developer.whoop.com — set `clientId`, `clientSecret`, and `redirectUri`
- **Google Gemini API key** from https://ai.google.dev/ — set `gemini.apiKey`

3. Start the server:

```
npm start
```

Optionally set `HOST` and `PORT` environment variables (default: `localhost:3000`):

```
HOST=0.0.0.0 PORT=8080 npm start
```

4. Open http://localhost:3000, click **Connect WHOOP**, and authorize the app.

5. Click **Sync Data** to import your WHOOP data.

## Configuration

See `config.js.example` for all options:

| Key | Description |
|-----|-------------|
| `whoop.clientId` | WHOOP API client ID |
| `whoop.clientSecret` | WHOOP API client secret |
| `whoop.redirectUri` | OAuth callback URL (default: `http://localhost:3000/auth/callback`) |
| `gemini.apiKey` | Google Gemini API key for AI chat |
| `gemini.model` | Gemini model (default: `gemini-3-flash-preview`) |
| `display.energyUnit` | `kcal` or `kJ` |

Server host and port are controlled via `HOST` and `PORT` environment variables.

## Architecture

- **Health data** is stored entirely in the browser using SQLite WASM with OPFS (Origin Private File System). Each user's data stays in their browser and is never persisted on the server.
- **OAuth sessions** are stored server-side in a SQLite database (`data/sessions.db` via better-sqlite3). Each browser gets a unique session cookie (`healthos_sid`) mapping it to its own WHOOP OAuth tokens.

## WHOOP Data

The app fetches all available WHOOP data:

- **Cycles** — daily strain, kilojoules, average/max heart rate
- **Recovery** — recovery score, HRV (RMSSD), resting heart rate, SpO2, skin temperature
- **Sleep** — duration, stages (light/deep/REM/awake), efficiency, performance, respiratory rate
- **Workouts** — sport type, strain, heart rate zones, distance, altitude
- **Profile** — name, email
- **Body measurements** — height, weight, max heart rate

## Project Structure

```
healthos/
├── server.js                  # Express server
├── config.js.example          # Config template
├── src/
│   ├── auth-store.js          # SQLite session store (server-side)
│   ├── whoop-api.js           # WHOOP OAuth and API client
│   ├── ai-chat.js             # Gemini chat integration
│   └── routes/
│       ├── auth.js            # OAuth routes (session cookies)
│       ├── fetch.js           # WHOOP data proxy routes
│       └── chat.js            # Chat streaming (SSE)
├── public/
│   ├── index.html             # SPA shell
│   ├── css/app.css            # Styles
│   └── js/
│       ├── app.js             # Router and navigation
│       ├── db.js              # Browser-side SQLite (WASM + OPFS)
│       ├── sync.js            # Data sync from WHOOP API
│       ├── dashboard.js       # Dashboard charts
│       ├── charts.js          # Chart rendering utilities
│       ├── data-browser.js    # Data tables
│       └── chat.js            # Chat UI
└── data/                      # Server-side SQLite (sessions.db, auto-created)
```

## Tech Stack

- **Backend**: Node.js, Express, better-sqlite3 (sessions only)
- **Frontend**: Vanilla JS SPA, SQLite WASM (OPFS), Tailwind CSS (CDN), Chart.js
- **AI**: Google Gemini API with streaming responses

## License

MIT
