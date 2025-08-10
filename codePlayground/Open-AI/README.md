# Multi-Agent OpenAI (JavaScript)

A minimal JavaScript project that integrates the OpenAI API and lets you create multiple agents (each with its own model and instructions) and run them in a shared session.

## Features

- Create unlimited agents with:
  - Name
  - Model (e.g., `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`)
  - System instructions
- Start a session with selected agents
- Round‑robin turns among agents with one‑click stepping or auto 5 turns
- Send user messages into the session at any time
- Clean Bootstrap UI
- In‑memory storage (no database)

## Prerequisites

- Node.js 18+
- An OpenAI API key

## Setup

1. Clone or copy this project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment:
   ```bash
   cp .env.example .env
   # edit .env and set OPENAI_API_KEY
   ```
4. Start the server:
   ```bash
   npm run dev
   ```
5. Open the app:
   - `http://localhost:3000`

## How it works

- Backend: `Express` server exposing REST endpoints
  - `POST /api/agents` create agent
  - `GET /api/agents` list agents
  - `DELETE /api/agents/:id` delete agent
  - `POST /api/sessions` create session with `agentIds` and optional `task`
  - `POST /api/sessions/:id/step` advance the session (optionally `{ userMessage, steps }`)
- Each step:
  - The next agent (round‑robin) receives the current transcript as context
  - The agent's system instructions are prepended as a system message
  - The reply is generated via OpenAI Chat Completions and appended to the transcript

## Notes

- This is a demo; agents and sessions are stored in memory and reset on restart.
- You can change default temperature and models in `server.js`.
- For persistence, add a database and replace the in‑memory maps.
- For streaming responses, switch to the streaming API and update the frontend renderer.

## Security

- Do not expose your API key publicly.
- This server serves a static frontend and proxies API calls; deploy behind a proper reverse proxy for production.

## License

MIT 