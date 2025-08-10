import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import axios from 'axios';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Basic validation
if (!process.env.OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY is not set. Set it in your environment or in a .env file.');
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

// In-memory stores (for demo)
const agents = new Map(); // id -> { id, name, model, systemPrompt }
const sessions = new Map(); // id -> { id, agentIds, messages, currentAgentIndex }
const agentChats = new Map(); // threadId -> { id, agentId, messages }

// Helpers
function makeSystemMessageForAgent(agent) {
  // Prepend a system message for the current agent
  return {
    role: 'system',
    content: `You are agent "${agent.name}". Follow your instructions strictly. Instructions: ${agent.systemPrompt || 'No specific instructions.'}`
  };
}

function sessionToDto(session) {
  return {
    id: session.id,
    agentIds: session.agentIds,
    messages: session.messages,
    currentAgentIndex: session.currentAgentIndex
  };
}

async function callOpenAIChat({ model, messages, temperature = 0.6 }) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };
  const body = { model, messages, temperature };
  const { data } = await axios.post(url, body, { headers });
  return data;
}

// Routes: Agents
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});

app.post('/api/agents', (req, res) => {
  const { name, systemPrompt, model } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid();
  const agent = { id, name, systemPrompt: systemPrompt || '', model: model || 'gpt-4o-mini' };
  agents.set(id, agent);
  res.json(agent);
});

app.delete('/api/agents/:id', (req, res) => {
  const { id } = req.params;
  if (!agents.has(id)) return res.status(404).json({ error: 'agent not found' });
  agents.delete(id);
  res.json({ ok: true });
});

// Routes: Sessions (multi-agent)
app.post('/api/sessions', (req, res) => {
  const { agentIds, task } = req.body || {};
  if (!Array.isArray(agentIds) || agentIds.length === 0) {
    return res.status(400).json({ error: 'agentIds must be a non-empty array' });
  }
  for (const id of agentIds) {
    if (!agents.has(id)) return res.status(400).json({ error: `unknown agent id: ${id}` });
  }
  const id = nanoid();
  const session = {
    id,
    agentIds,
    messages: task ? [{ role: 'user', content: task }] : [],
    currentAgentIndex: 0
  };
  sessions.set(id, session);
  res.json(sessionToDto(session));
});

app.get('/api/sessions/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(sessionToDto(s));
});

app.post('/api/sessions/:id/step', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });

  const { userMessage, steps } = req.body || {};
  if (userMessage) {
    s.messages.push({ role: 'user', content: userMessage });
  }

  const runSteps = Math.max(1, Math.min(steps || 1, 10)); // cap to 10 per call

  try {
    let lastReply = null;
    for (let i = 0; i < runSteps; i++) {
      const agentId = s.agentIds[s.currentAgentIndex % s.agentIds.length];
      const agent = agents.get(agentId);
      if (!agent) throw new Error(`Agent ${agentId} not found`);

      const messages = [makeSystemMessageForAgent(agent), ...s.messages];

      const completion = await callOpenAIChat({
        model: agent.model || 'gpt-4o-mini',
        messages,
        temperature: 0.6,
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const assistantMsg = { role: 'assistant', content, agentId };
      s.messages.push(assistantMsg);
      lastReply = assistantMsg;
      s.currentAgentIndex = (s.currentAgentIndex + 1) % s.agentIds.length;
    }

    res.json({ session: sessionToDto(s), lastReply });
  } catch (err) {
    console.error(err?.response?.data || err);
    res.status(500).json({ error: 'openai_error', detail: err?.response?.data || String(err.message || err) });
  }
});

// Routes: Single-agent chat threads
app.post('/api/agents/:id/chat', async (req, res) => {
  const agentId = req.params.id;
  const agent = agents.get(agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  const { userMessage, threadId } = req.body || {};
  if (!userMessage) return res.status(400).json({ error: 'userMessage is required' });

  let thread = null;
  if (threadId) {
    thread = agentChats.get(threadId);
    if (!thread) return res.status(404).json({ error: 'thread not found' });
    if (thread.agentId !== agentId) return res.status(400).json({ error: 'thread belongs to another agent' });
  } else {
    thread = { id: nanoid(), agentId, messages: [] };
  }

  thread.messages.push({ role: 'user', content: userMessage });

  try {
    const messages = [makeSystemMessageForAgent(agent), ...thread.messages];
    const completion = await callOpenAIChat({
      model: agent.model || 'gpt-4o-mini',
      messages,
      temperature: 0.6,
    });
    const content = completion.choices?.[0]?.message?.content || '';
    const assistantMsg = { role: 'assistant', content };
    thread.messages.push(assistantMsg);

    agentChats.set(thread.id, thread);
    res.json({ threadId: thread.id, messages: thread.messages, reply: assistantMsg });
  } catch (err) {
    console.error(err?.response?.data || err);
    res.status(500).json({ error: 'openai_error', detail: err?.response?.data || String(err.message || err) });
  }
});

app.get('/api/agents/:id/chat/:threadId', (req, res) => {
  const { id, threadId } = req.params;
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const thread = agentChats.get(threadId);
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  if (thread.agentId !== id) return res.status(400).json({ error: 'thread belongs to another agent' });
  res.json(thread);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});