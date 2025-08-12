const apiBase = '';

let AGENTS = [];
let CURRENT_SESSION = null;
let CHAT_THREAD_ID = null;
let HYDRATED_FROM_LOCAL = false;

const LS_KEY_AGENTS = 'multi_agent_openai_saved_agents_v1';

const agentsListEl = document.getElementById('agentsList');
const agentSelectionEl = document.getElementById('agentSelection');

const agentNameEl = document.getElementById('agentName');
const agentModelEl = document.getElementById('agentModel');
const agentSystemEl = document.getElementById('agentSystem');
const createAgentBtn = document.getElementById('createAgentBtn');
const refreshAgentsBtn = document.getElementById('refreshAgentsBtn');

const sessionTaskEl = document.getElementById('sessionTask');
const startSessionBtn = document.getElementById('startSessionBtn');

const nextTurnBtn = document.getElementById('nextTurnBtn');
const auto5Btn = document.getElementById('auto5Btn');
const userMessageEl = document.getElementById('userMessage');
const sendUserMsgBtn = document.getElementById('sendUserMsgBtn');
const sessionFileInput = document.getElementById('sessionFile');

const transcriptEl = document.getElementById('sessionTranscript');

// Single agent chat elements
const chatAgentSelect = document.getElementById('chatAgentSelect');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatTranscript = document.getElementById('chatTranscript');
const chatFileInput = document.getElementById('chatFile');

function toast(msg, type = 'info') {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type === 'error' ? 'danger' : type} position-fixed top-0 end-0 m-3`;
  alert.textContent = msg;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 3000);
}

function loadSavedAgents() {
  try {
    const raw = localStorage.getItem(LS_KEY_AGENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function saveAgentsToLocal(defs) {
  try {
    localStorage.setItem(LS_KEY_AGENTS, JSON.stringify(defs || []));
  } catch (_e) {
    // ignore storage errors
  }
}

function upsertSavedAgent(def) {
  const defs = loadSavedAgents();
  const idx = defs.findIndex(a => a.name === def.name);
  if (idx >= 0) defs[idx] = def; else defs.push(def);
  saveAgentsToLocal(defs);
}

function removeSavedAgentByName(name) {
  const defs = loadSavedAgents();
  saveAgentsToLocal(defs.filter(a => a.name !== name));
}

async function fetchAgents() {
  const res = await fetch(`${apiBase}/api/agents`);
  AGENTS = await res.json();
  renderAgents();
  renderAgentSelection();
  renderChatAgentSelect();
  // Hydrate from localStorage once if server has no agents
  if (!HYDRATED_FROM_LOCAL && AGENTS.length === 0) {
    HYDRATED_FROM_LOCAL = true;
    const saved = loadSavedAgents();
    if (saved.length) {
      for (const def of saved) {
        try {
          await fetch(`${apiBase}/api/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: def.name, model: def.model, systemPrompt: def.systemPrompt })
          });
        } catch (_e) {}
      }
      const r = await fetch(`${apiBase}/api/agents`);
      AGENTS = await r.json();
      renderAgents();
      renderAgentSelection();
      renderChatAgentSelect();
    }
  }
}

function renderAgents() {
  agentsListEl.innerHTML = '';
  if (!AGENTS.length) {
    agentsListEl.innerHTML = '<div class="text-muted">No agents created yet.</div>';
    return;
  }
  for (const agent of AGENTS) {
    const col = document.createElement('div');
    col.className = 'col-12 col-md-6';
    col.innerHTML = `
      <div class="border rounded p-3 h-100">
        <div class="d-flex align-items-start justify-content-between">
          <div>
            <div class="fw-bold">${escapeHtml(agent.name)}</div>
            <div class="small text-muted">Model: ${escapeHtml(agent.model)}</div>
          </div>
          <button class="btn btn-sm btn-outline-danger" data-id="${agent.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="small mt-2 text-muted">${escapeHtml(agent.systemPrompt || '')}</div>
      </div>
    `;
    const btn = col.querySelector('button');
    btn.addEventListener('click', async () => {
      await fetch(`${apiBase}/api/agents/${agent.id}`, { method: 'DELETE' });
      removeSavedAgentByName(agent.name);
      fetchAgents();
    });
    agentsListEl.appendChild(col);
  }
}

function renderAgentSelection() {
  agentSelectionEl.innerHTML = '';
  for (const agent of AGENTS) {
    const div = document.createElement('div');
    div.className = 'form-check';
    div.innerHTML = `
      <input class="form-check-input" type="checkbox" value="${agent.id}" id="chk_${agent.id}">
      <label class="form-check-label" for="chk_${agent.id}">
        ${escapeHtml(agent.name)} <span class="text-muted small">(${escapeHtml(agent.model)})</span>
      </label>
    `;
    agentSelectionEl.appendChild(div);
  }
}

function renderChatAgentSelect() {
  chatAgentSelect.innerHTML = '';
  for (const agent of AGENTS) {
    const opt = document.createElement('option');
    opt.value = agent.id;
    opt.textContent = `${agent.name} (${agent.model})`;
    chatAgentSelect.appendChild(opt);
  }
}

createAgentBtn.addEventListener('click', async () => {
  const name = agentNameEl.value.trim();
  const model = agentModelEl.value;
  const systemPrompt = agentSystemEl.value.trim();
  if (!name) return toast('Please enter an agent name', 'warning');
  const res = await fetch(`${apiBase}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, model, systemPrompt })
  });
  if (!res.ok) return toast('Failed to create agent', 'error');
  upsertSavedAgent({ name, model, systemPrompt });
  agentNameEl.value = '';
  agentSystemEl.value = '';
  await fetchAgents();
  toast('Agent created', 'success');
});

refreshAgentsBtn.addEventListener('click', fetchAgents);

startSessionBtn.addEventListener('click', async () => {
  const selected = Array.from(agentSelectionEl.querySelectorAll('input:checked')).map(i => i.value);
  if (!selected.length) return toast('Select at least one agent', 'warning');
  const task = sessionTaskEl.value.trim();
  const res = await fetch(`${apiBase}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentIds: selected, task })
  });
  if (!res.ok) return toast('Failed to start session', 'error');
  CURRENT_SESSION = await res.json();
  renderSession();
  toggleSessionControls(true);
  toast('Session started', 'success');
});

nextTurnBtn.addEventListener('click', async () => {
  await stepSession(1);
});

auto5Btn.addEventListener('click', async () => {
  await stepSession(5);
});

sendUserMsgBtn.addEventListener('click', async () => {
  const msg = userMessageEl.value.trim();
  if (!msg) return;
  await stepSession(1, msg);
  userMessageEl.value = '';
});

async function stepSession(steps = 1, userMessage) {
  if (!CURRENT_SESSION) return;
  toggleActionButtons(false);
  const hasFile = sessionFileInput && sessionFileInput.files && sessionFileInput.files[0];
  let res;
  if (hasFile) {
    const form = new FormData();
    form.append('steps', String(steps));
    if (userMessage) form.append('userMessage', userMessage);
    form.append('file', sessionFileInput.files[0]);
    res = await fetch(`${apiBase}/api/sessions/${CURRENT_SESSION.id}/step`, {
      method: 'POST',
      body: form
    });
    sessionFileInput.value = '';
  } else {
    res = await fetch(`${apiBase}/api/sessions/${CURRENT_SESSION.id}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps, userMessage })
    });
  }
  toggleActionButtons(true);
  if (!res.ok) return toast('Failed to step session', 'error');
  const data = await res.json();
  CURRENT_SESSION = data.session;
  renderSession();
}

function renderSession() {
  transcriptEl.innerHTML = '';
  if (!CURRENT_SESSION) return;
  for (const m of CURRENT_SESSION.messages) {
    const div = document.createElement('div');
    div.className = 'mb-3';
    const agentName = m.agentId ? (AGENTS.find(a => a.id === m.agentId)?.name || 'Agent') : 'User';
    const badge = m.role === 'assistant' ? `<span class="badge bg-primary me-2">${escapeHtml(agentName)}</span>` : `<span class="badge bg-secondary me-2">User</span>`;
    div.innerHTML = `
      <div>${badge}<span class="fw-semibold text-muted small">${m.role}</span></div>
      <div class="mt-1 prewrap">${formatMessage(m.content)}</div>
    `;
    transcriptEl.appendChild(div);
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function toggleSessionControls(enabled) {
  nextTurnBtn.disabled = !enabled;
  auto5Btn.disabled = !enabled;
  sendUserMsgBtn.disabled = !enabled;
}

function toggleActionButtons(enabled) {
  nextTurnBtn.disabled = !enabled;
  auto5Btn.disabled = !enabled;
  sendUserMsgBtn.disabled = !enabled;
}

// Single agent chat handlers
chatSendBtn.addEventListener('click', async () => {
  const agentId = chatAgentSelect.value;
  const msg = chatInput.value.trim();
  if (!agentId) return toast('Select an agent', 'warning');
  if (!msg) return;

  renderChatMessage({ role: 'user', content: msg });
  chatInput.value = '';

  try {
    const hasFile = chatFileInput && chatFileInput.files && chatFileInput.files[0];
    let res;
    if (hasFile) {
      const form = new FormData();
      form.append('userMessage', msg);
      if (CHAT_THREAD_ID) form.append('threadId', CHAT_THREAD_ID);
      form.append('file', chatFileInput.files[0]);
      res = await fetch(`${apiBase}/api/agents/${agentId}/chat`, {
        method: 'POST',
        body: form
      });
      chatFileInput.value = '';
    } else {
      res = await fetch(`${apiBase}/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: msg, threadId: CHAT_THREAD_ID || undefined })
      });
    }
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    CHAT_THREAD_ID = data.threadId;
    renderChatMessage(data.reply);
  } catch (e) {
    toast('Chat failed', 'error');
  }
});

function renderChatMessage(m) {
  const div = document.createElement('div');
  div.className = 'mb-3';
  const badge = m.role === 'assistant' ? `<span class="badge bg-primary me-2">Agent</span>` : `<span class="badge bg-secondary me-2">User</span>`;
  div.innerHTML = `
    <div>${badge}<span class="fw-semibold text-muted small">${m.role}</span></div>
    <div class="mt-1 prewrap">${formatMessage(m.content)}</div>
  `;
  chatTranscript.appendChild(div);
  chatTranscript.scrollTop = chatTranscript.scrollHeight;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function formatMessage(s) {
  const text = escapeHtml(s);
  return text
    .replace(/```([\s\S]*?)```/g, (m, c) => `<pre class="code-block">${c}</pre>`) 
    .replace(/\n/g, '<br/>');
}

// init
fetchAgents().catch(() => toast('Could not load agents', 'error'));