# Multi-Agent OpenAI (JavaScript)

A minimal JavaScript project that integrates the OpenAI API and lets you create multiple agents (each with its own model and instructions) and run them in a shared session.

## Features

- Create unlimited agents with:
  - Name
  - AI Provider (OpenAI, Anthropic Claude, Google Gemini, DeepSeek)
  - Model selection based on provider
  - System instructions
- Start a session with selected agents
- Round‑robin turns among agents with one‑click stepping or auto 5 turns
- Send user messages into the session at any time
- Clean Bootstrap UI
- **Persistent MongoDB storage** (agents, sessions, chat history)
- **File upload support** for images and PDFs
- **Multi-provider AI support** with automatic model selection

## Supported AI Providers

### OpenAI
- Models: gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-4.1
- Features: Full multimodal support (text + images)

### Anthropic Claude
- Models: claude-3-haiku-20240307, claude-3-sonnet-20240229, claude-3-opus-20240229
- Features: Text-only, excellent reasoning capabilities

### Google Gemini
- Models: gemini-1.5-flash, gemini-1.5-pro, gemini-pro
- Features: Multimodal support (text + images)

### DeepSeek
- Models: deepseek-chat, deepseek-coder, deepseek-llm-7b-chat
- Features: Text-only, good for coding tasks

### Perplexity AI
- Models: llama-3.1-8b-instant, llama-3.1-70b-vision, llama-3.1-405b, mixtral-8x7b-instruct, codellama-70b-instruct
- Features: Text-only, excellent reasoning and coding capabilities

## Prerequisites

- Node.js 18+
- MongoDB 5.0+
- An OpenAI API key

## Setup

1. Clone or copy this project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start MongoDB:
   ```bash
   # macOS with Homebrew
   brew services start mongodb-community
   
   # Or run manually
   mongod --dbpath /usr/local/var/mongodb
   ```
4. Configure environment:
   ```bash
   # Create .env file with:
   OPENAI_API_KEY=your_openai_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   GOOGLE_API_KEY=your_google_api_key_here
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   PERPLEXITY_API_KEY=your_perplexity_api_key_here
   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/multi_agent_openai?retryWrites=true&w=majority
   MONGODB_DB=multi_agent_openai
   PORT=3000
   ```
5. Start the server:
   ```bash
   npm run dev
   ```
6. Open the app:
   - `http://localhost:3000`

## How it works

- Backend: `Express` server with MongoDB persistence
  - `POST /api/agents` create agent
  - `GET /api/agents` list agents
  - `DELETE /api/agents/:id` delete agent
  - `POST /api/sessions` create session with `agentIds` and optional `task`
  - `POST /api/sessions/:id/step` advance the session (optionally `{ userMessage, steps }`)
  - File uploads supported for images and PDFs
- Each step:
  - The next agent (round‑robin) receives the current transcript as context
  - The agent's system instructions are prepended as a system message
  - The reply is generated via OpenAI Chat Completions and appended to the transcript
  - All data is persisted to MongoDB collections

## Database Collections

- `agents`: Agent definitions (name, model, systemPrompt)
- `sessions`: Multi-agent session data with message history
- `chat_threads`: Individual agent chat conversations

## Notes

- Agents and sessions are now persisted in MongoDB and survive server restarts
- File uploads support images (PNG, JPG, JPEG, GIF, WebP) and PDFs
- For production, ensure MongoDB is properly secured and backed up
- For streaming responses, switch to the streaming API and update the frontend renderer

## Security

- Do not expose your API key publicly
- This server serves a static frontend and proxies API calls; deploy behind a proper reverse proxy for production
- MongoDB should be configured with authentication in production

## License

MIT 