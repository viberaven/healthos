# HealthOS

Health data dashboard powered by WHOOP API with an AI chat assistant.

Connects to your WHOOP account via OAuth2, imports all health data into a local SQLite database, and presents it through a modern dark-themed dashboard with charts. Includes an AI assistant (Google Gemini) that can analyze your data and render inline visualizations.

## Features

- **OAuth2 integration** with WHOOP API — imports cycles, recovery, sleep, workouts, profile, and body measurements
- **Incremental sync** with 2-hour overlap buffer to ensure no gaps from pending scores
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

## WHOOP Data

The app imports all available WHOOP data:

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
│   ├── db.js                  # SQLite schema and queries
│   ├── whoop-api.js           # WHOOP OAuth and API client
│   ├── sync.js                # Incremental sync engine
│   ├── ai-chat.js             # Gemini chat integration
│   └── routes/
│       ├── auth.js            # OAuth routes
│       ├── api.js             # Data API routes
│       ├── sync.js            # Sync trigger routes
│       └── chat.js            # Chat streaming (SSE)
├── public/
│   ├── index.html             # SPA shell
│   ├── css/app.css            # Styles
│   └── js/
│       ├── app.js             # Router and navigation
│       ├── dashboard.js       # Dashboard charts
│       ├── data-browser.js    # Data tables
│       └── chat.js            # Chat UI
└── data/                      # SQLite database (auto-created)
```

## Tech Stack

- **Backend**: Node.js, Express, better-sqlite3
- **Frontend**: Vanilla JS SPA, Tailwind CSS (CDN), Chart.js
- **AI**: Google Gemini API with streaming responses
- **Database**: SQLite with WAL mode

## License

MIT
