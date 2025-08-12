import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import axios from 'axios';
import multer from 'multer';
import { MongoClient } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

// MongoDB connection
let db;
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'multi_agent_openai';

async function connectDB() {
  try {
    const client = new MongoClient(mongoUrl);
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');
    
    // Create indexes for better performance
    await db.collection('agents').createIndex({ name: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ id: 1 });
    await db.collection('chat_threads').createIndex({ id: 1 });
    await db.collection('chat_threads').createIndex({ agentId: 1 });
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
}

// Initialize DB connection
connectDB();

// Basic validation
if (!process.env.OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY is not set. Set it in your environment or in a .env file.');
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

// MongoDB collections (replacing in-memory stores)
// const agents = new Map(); // id -> { id, name, model, systemPrompt }
// const sessions = new Map(); // id -> { id, agentIds, messages, currentAgentIndex }
// const agentChats = new Map(); // threadId -> { id, agentId, messages }

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

/**
 * Convert an uploaded file into content suitable for OpenAI messages.
 * - For images (png, jpg, jpeg, gif, webp), returns an image_url content item using a data URL.
 * - For PDFs, extracts text and returns a text content item.
 */
async function fileToMessageContent(file) {
  if (!file) return null;
  const mime = file.mimetype || '';
  const base64 = file.buffer.toString('base64');

  const isImage = /^image\/(png|jpe?g|gif|webp)$/i.test(mime);
  if (isImage) {
    const dataUrl = `data:${mime};base64,${base64}`;
    // OpenAI multimodal message format (image_url)
    return { type: 'image_url', image_url: { url: dataUrl } };
  }

  if (mime === 'application/pdf') {
    try {
      const { default: pdfParse } = await import('pdf-parse');
      const parsed = await pdfParse(file.buffer);
      const text = parsed.text || '';
      return { type: 'text', text: `Extracted text from uploaded PDF (first 20k chars):\n\n${text.slice(0, 20000)}` };
    } catch (err) {
      const nodeVersion = process.versions?.node || 'unknown';
      return { type: 'text', text: `Could not parse PDF on this server (Node ${nodeVersion}). Please upgrade to Node 18+ or try a different PDF. Error: ${String(err && err.message || err)}` };
    }
  }

  // Fallback: treat as attachment reference
  return { type: 'text', text: `Received unsupported file type (${mime}).` };
}

// Routes: Agents
app.get('/api/agents', async (req, res) => {
  const agentsCollection = db.collection('agents');
  const agents = await agentsCollection.find({}).toArray();
  res.json(agents);
});

app.post('/api/agents', async (req, res) => {
  const { name, systemPrompt, model } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid();
  const agent = { id, name, systemPrompt: systemPrompt || '', model: model || 'gpt-4o-mini' };
  const agentsCollection = db.collection('agents');
  await agentsCollection.insertOne(agent);
  res.json(agent);
});

app.delete('/api/agents/:id', async (req, res) => {
  const { id } = req.params;
  const agentsCollection = db.collection('agents');
  const result = await agentsCollection.deleteOne({ id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'agent not found' });
  res.json({ ok: true });
});

// Routes: Sessions (multi-agent)
app.post('/api/sessions', async (req, res) => {
  const { agentIds, task } = req.body || {};
  if (!Array.isArray(agentIds) || agentIds.length === 0) {
    return res.status(400).json({ error: 'agentIds must be a non-empty array' });
  }
  for (const id of agentIds) {
    const agentsCollection = db.collection('agents');
    const agent = await agentsCollection.findOne({ id });
    if (!agent) return res.status(400).json({ error: `unknown agent id: ${id}` });
  }
  const id = nanoid();
  const session = {
    id,
    agentIds,
    messages: task ? [{ role: 'user', content: task }] : [],
    currentAgentIndex: 0
  };
  const sessionsCollection = db.collection('sessions');
  await sessionsCollection.insertOne(session);
  res.json(sessionToDto(session));
});

app.get('/api/sessions/:id', async (req, res) => {
  const sessionsCollection = db.collection('sessions');
  const session = await sessionsCollection.findOne({ id: req.params.id });
  if (!session) return res.status(404).json({ error: 'session not found' });
  res.json(sessionToDto(session));
});

app.post('/api/sessions/:id/step', upload.single('file'), async (req, res) => {
  const sessionsCollection = db.collection('sessions');
  const session = await sessionsCollection.findOne({ id: req.params.id });
  if (!session) return res.status(404).json({ error: 'session not found' });

  const { userMessage, steps } = req.body || {};
  const attachmentContent = await fileToMessageContent(req.file);

  if (userMessage || attachmentContent) {
    if (attachmentContent) {
      session.messages.push({ role: 'user', content: [ { type: 'text', text: String(userMessage || '') }, attachmentContent ] });
    } else {
      session.messages.push({ role: 'user', content: String(userMessage) });
    }
  }

  const runSteps = Math.max(1, Math.min(steps || 1, 10)); // cap to 10 per call

  try {
    let lastReply = null;
    for (let i = 0; i < runSteps; i++) {
      const agentId = session.agentIds[session.currentAgentIndex % session.agentIds.length];
      const agentsCollection = db.collection('agents');
      const agent = await agentsCollection.findOne({ id: agentId });
      if (!agent) throw new Error(`Agent ${agentId} not found`);

      const messages = [makeSystemMessageForAgent(agent), ...session.messages];

      const completion = await callOpenAIChat({
        model: agent.model || 'gpt-4o-mini',
        messages,
        temperature: 0.6,
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const assistantMsg = { role: 'assistant', content, agentId };
      session.messages.push(assistantMsg);
      lastReply = assistantMsg;
      session.currentAgentIndex = (session.currentAgentIndex + 1) % session.agentIds.length;
    }

    await sessionsCollection.updateOne({ id: session.id }, { $set: session });
    res.json({ session: sessionToDto(session), lastReply });
  } catch (err) {
    console.error(err?.response?.data || err);
    res.status(500).json({ error: 'openai_error', detail: err?.response?.data || String(err.message || err) });
  }
});

// Routes: Single-agent chat threads
app.post('/api/agents/:id/chat', upload.single('file'), async (req, res) => {
  const agentsCollection = db.collection('agents');
  const agent = await agentsCollection.findOne({ id: req.params.id });
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  const { threadId } = req.body || {};
  const userMessage = (req.body && req.body.userMessage) || '';
  const attachmentContent = await fileToMessageContent(req.file);
  if (!userMessage && !attachmentContent) return res.status(400).json({ error: 'userMessage or file is required' });

  let thread = null;
  if (threadId) {
    const agentChatsCollection = db.collection('chat_threads');
    thread = await agentChatsCollection.findOne({ id: threadId });
    if (!thread) return res.status(404).json({ error: 'thread not found' });
    if (thread.agentId !== agent.id) return res.status(400).json({ error: 'thread belongs to another agent' });
  } else {
    thread = { id: nanoid(), agentId: agent.id, messages: [] };
  }

  if (attachmentContent) {
    thread.messages.push({ role: 'user', content: [ { type: 'text', text: String(userMessage || '') }, attachmentContent ] });
  } else {
    thread.messages.push({ role: 'user', content: String(userMessage) });
  }

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

    const agentChatsCollection = db.collection('chat_threads');
    if (threadId) {
      // Update existing thread
      await agentChatsCollection.updateOne({ id: thread.id }, { $set: thread });
    } else {
      // Insert new thread
      await agentChatsCollection.insertOne(thread);
    }
    res.json({ threadId: thread.id, messages: thread.messages, reply: assistantMsg });
  } catch (err) {
    console.error(err?.response?.data || err);
    res.status(500).json({ error: 'openai_error', detail: err?.response?.data || String(err.message || err) });
  }
});

app.get('/api/agents/:id/chat/:threadId', async (req, res) => {
  const { id, threadId } = req.params;
  const agentsCollection = db.collection('agents');
  const agent = await agentsCollection.findOne({ id });
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  const agentChatsCollection = db.collection('chat_threads');
  const thread = await agentChatsCollection.findOne({ id: threadId });
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  if (thread.agentId !== id) return res.status(400).json({ error: 'thread belongs to another agent' });
  res.json(thread);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});