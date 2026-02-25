/**
 * TeamPresence dashboard – connects to SC-Bridge and displays presence from sidechannel + contract.
 * Loads config from config.local.js if present, otherwise config.example.js (with a reminder to copy).
 */
let TEAM_PRESENCE_CONFIG;

async function loadConfig() {
  try {
    const mod = await import('./config.local.js');
    TEAM_PRESENCE_CONFIG = mod.TEAM_PRESENCE_CONFIG || mod.default?.TEAM_PRESENCE_CONFIG;
  } catch {
    const mod = await import('./config.example.js');
    TEAM_PRESENCE_CONFIG = mod.TEAM_PRESENCE_CONFIG || mod.default?.TEAM_PRESENCE_CONFIG;
  }
  if (!TEAM_PRESENCE_CONFIG?.SC_BRIDGE_URL || !TEAM_PRESENCE_CONFIG?.SC_BRIDGE_TOKEN) {
    console.warn('Copy web/config.example.js to web/config.local.js and set SC_BRIDGE_URL and SC_BRIDGE_TOKEN.');
  }
}

const state = {
  ws: null,
  connected: false,
  presence: new Map(),
  teams: new Set(),
};

const els = {
  status: document.getElementById('connectionStatus'),
  teamFilter: document.getElementById('teamFilter'),
  peerGrid: document.getElementById('peerGrid'),
  eventLog: document.getElementById('eventLog'),
};

function logEvent(line) {
  if (!els.eventLog) return;
  const entry = document.createElement('div');
  entry.className = 'tp-log-entry';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
  els.eventLog.prepend(entry);
}

function setConnection(connected) {
  state.connected = connected;
  if (els.status) {
    els.status.textContent = connected ? 'Connected' : 'Disconnected';
    els.status.classList.toggle('tp-conn--connected', connected);
    els.status.classList.toggle('tp-conn--disconnected', !connected);
  }
}

function updateTeams() {
  if (!els.teamFilter) return;
  const prev = els.teamFilter.value;
  els.teamFilter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All teams';
  els.teamFilter.appendChild(allOpt);
  const teams = Array.from(state.teams).sort();
  teams.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    els.teamFilter.appendChild(opt);
  });
  if (teams.includes(prev)) els.teamFilter.value = prev;
  else if (TEAM_PRESENCE_CONFIG?.DEFAULT_TEAM && teams.includes(TEAM_PRESENCE_CONFIG.DEFAULT_TEAM)) {
    els.teamFilter.value = TEAM_PRESENCE_CONFIG.DEFAULT_TEAM;
  }
}

function render() {
  if (!els.peerGrid) return;
  const filterTeam = els.teamFilter?.value || '';
  els.peerGrid.innerHTML = '';

  const entries = Array.from(state.presence.entries());
  entries.sort((a, b) => {
    const av = a[1].status?.updatedAt || 0;
    const bv = b[1].status?.updatedAt || 0;
    return bv - av;
  });

  for (const [address, data] of entries) {
    const { profile, status } = data;
    if (filterTeam) {
      const teams = status?.teams || profile?.teams || [];
      if (!Array.isArray(teams) || !teams.includes(filterTeam)) continue;
    }

    const card = document.createElement('div');
    card.className = 'tp-card';

    const header = document.createElement('div');
    header.className = 'tp-card-header';
    const handle = document.createElement('div');
    handle.className = 'tp-handle';
    handle.textContent = profile?.handle || address.slice(0, 8);
    const addr = document.createElement('div');
    addr.className = 'tp-address';
    addr.textContent = address.slice(0, 10) + '…' + address.slice(-6);
    const pill = document.createElement('span');
    const stateStr = status?.state || 'OFFLINE';
    pill.className = 'tp-status-pill tp-status-' + stateStr;
    pill.textContent = stateStr;
    header.appendChild(handle);
    header.appendChild(pill);

    const body = document.createElement('div');
    body.className = 'tp-card-body';
    const tzRow = document.createElement('div');
    tzRow.innerHTML = '<span class="tp-label">TZ:</span> ' + (profile?.timezone || '—');
    const hoursRow = document.createElement('div');
    hoursRow.innerHTML = '<span class="tp-label">Hours:</span> ' + (profile ? `${profile.hours_start || '?'}–${profile.hours_end || '?'}` : '—');
    const msgRow = document.createElement('div');
    msgRow.innerHTML = '<span class="tp-label">Note:</span> <span class="tp-message">' + (status?.message || '—') + '</span>';
    body.appendChild(tzRow);
    body.appendChild(hoursRow);
    body.appendChild(msgRow);

    const tags = document.createElement('div');
    tags.className = 'tp-tags';
    const teams = status?.teams || profile?.teams || [];
    teams.forEach((t) => {
      const tag = document.createElement('span');
      tag.className = 'tp-tag tp-tag--team';
      tag.textContent = t;
      tags.appendChild(tag);
    });

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(tags);
    els.peerGrid.appendChild(card);
  }
}

function handlePresenceMessage(channel, payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.type !== 'presence_update') return;
  const addr = String(payload.address || '');
  if (!addr) return;

  let entry = state.presence.get(addr);
  if (!entry) {
    entry = { profile: null, status: null, lastSeen: 0 };
    state.presence.set(addr, entry);
  }
  if (payload.profile) {
    entry.profile = payload.profile;
    if (Array.isArray(payload.profile.teams)) payload.profile.teams.forEach((t) => state.teams.add(String(t)));
  }
  if (payload.status) {
    entry.status = payload.status;
    if (Array.isArray(payload.status.teams)) payload.status.teams.forEach((t) => state.teams.add(String(t)));
  }
  entry.lastSeen = Date.now();
  updateTeams();
  render();
}

function connect() {
  const url = TEAM_PRESENCE_CONFIG?.SC_BRIDGE_URL;
  const token = TEAM_PRESENCE_CONFIG?.SC_BRIDGE_TOKEN;
  if (!url || !token || token === 'REPLACE_WITH_YOUR_TOKEN') {
    logEvent('Set SC_BRIDGE_URL and SC_BRIDGE_TOKEN in config.local.js (copy from config.example.js).');
    return;
  }

  const ws = new WebSocket(url);
  state.ws = ws;

  ws.onopen = () => {
    setConnection(true);
    logEvent('Connected, authenticating…');
    ws.send(JSON.stringify({ type: 'auth', token }));
    ws.send(JSON.stringify({ type: 'subscribe', channels: TEAM_PRESENCE_CONFIG.CHANNELS || ['presence-global'] }));
  };

  ws.onclose = () => {
    setConnection(false);
    logEvent('Disconnected. Reconnecting in 3s…');
    setTimeout(connect, 3000);
  };

  ws.onerror = () => logEvent('WebSocket error.');
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'auth_ok') {
      logEvent('Authenticated.');
      return;
    }
    if (msg.type === 'auth_error') {
      logEvent('Auth error: ' + (msg.error || 'unknown'));
      return;
    }
    if (msg.type === 'sidechannel_message') {
      handlePresenceMessage(msg.channel, msg.message);
    }
  };
}

if (els.teamFilter) els.teamFilter.addEventListener('change', render);

loadConfig().then(() => {
  connect();
});
