/**
 * Nightshift visualization frontend.
 * Serves the pixel-art world + status panel using @miniverse/core.
 */
export function getFrontendHtml(wsPort: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nightshift</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  background: #0d1117;
  color: #c9d1d9;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
}

h1 {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #58a6ff;
  margin-bottom: 16px;
}

#canvas-container {
  border: 1px solid #30363d;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 24px;
  image-rendering: pixelated;
}

#status-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 720px;
}

.agent-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px;
  transition: border-color 0.3s;
}

.agent-card .name {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.agent-card .status {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.agent-card .task {
  font-size: 11px;
  color: #8b949e;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Role colors are applied dynamically from agent state via renderCard() */

.status-working { color: #58a6ff; }
.status-idle { color: #8b949e; }
.status-thinking { color: #d2a8ff; }
.status-sleeping { color: #484f58; }
.status-error { color: #f85149; }
.status-offline { color: #484f58; }
.status-speaking { color: #ffa657; }

#connection-status {
  font-size: 11px;
  color: #484f58;
  margin-top: 16px;
}
.connected { color: #3fb950 !important; }
.disconnected { color: #f85149 !important; }

#tooltip {
  display: none;
  position: fixed;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 11px;
  pointer-events: none;
  z-index: 100;
}
#tooltip .name { font-weight: 600; color: #58a6ff; }
#tooltip .state { color: #8b949e; margin-top: 2px; }
#tooltip .task { color: #c9d1d9; margin-top: 2px; }

#team-selector {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
#team-selector label { color: #8b949e; }
#team-select {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 12px;
}
#team-empty { color: #484f58; font-size: 12px; }
</style>
</head>
<body>
<h1>nightshift</h1>

<div id="team-selector">
  <label for="team-select">Team:</label>
  <select id="team-select"></select>
  <span id="team-empty" style="display:none">No teams available</span>
</div>

<div id="canvas-container"></div>
<div id="status-panel"></div>
<div id="connection-status">Connecting...</div>

<div id="tooltip">
  <div class="name"></div>
  <div class="state"></div>
  <div class="task"></div>
</div>

<script type="module">
import { Miniverse, PropSystem, createStandardSpriteConfig } from '/miniverse-core.js';

const STATE_LABELS = {
  working: 'Working', idle: 'Idle', thinking: 'Thinking',
  sleeping: 'Sleeping', error: 'Error', offline: 'Offline', speaking: 'Speaking',
};

const panel = document.getElementById('status-panel');
const connStatus = document.getElementById('connection-status');
const container = document.getElementById('canvas-container');
const tooltip = document.getElementById('tooltip');
const agents = new Map();

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

let currentTeam = null;

function getRole(agentId) {
  const parts = agentId.split('-');
  return parts.length >= 3 ? parts.slice(2).join('-') : agentId;
}

function getTeam(agentId) {
  const parts = agentId.split('-');
  return parts.length >= 3 ? parts[1] : null;
}

function renderCard(agent) {
  // Only render agents matching the current team
  if (currentTeam && getTeam(agent.agent) !== currentTeam) return;

  const role = getRole(agent.agent);
  let card = document.querySelector('[data-agent="' + agent.agent + '"]');
  if (!card) {
    card = document.createElement('div');
    card.className = 'agent-card';
    card.dataset.agent = agent.agent;
    card.dataset.role = role;
    card.innerHTML = '<div class="name">' + esc(agent.name || role) + '</div><div class="status"></div><div class="task"></div>';
    panel.appendChild(card);
  }
  const agentColor = agent.color || '#8b949e';
  card.style.borderLeft = '3px solid ' + agentColor;
  card.querySelector('.name').style.color = agentColor;
  const state = agent.state || 'offline';
  card.querySelector('.status').textContent = STATE_LABELS[state] || state;
  card.querySelector('.status').className = 'status status-' + state;
  card.querySelector('.task').textContent = agent.task || '';
}

function refreshStatusPanel() {
  panel.innerHTML = '';
  for (const agent of agents.values()) {
    renderCard(agent);
  }
}

let currentMv = null;

// --- Load world and start miniverse ---
async function startWorld(teamId) {
  // Destroy previous Miniverse instance if it exists
  if (currentMv) {
    try { currentMv.destroy?.() || currentMv.stop?.(); } catch {}
    currentMv = null;
  }
  container.innerHTML = '';

  let worldData;
  try {
    const url = teamId ? '/api/world?team=' + encodeURIComponent(teamId) : '/api/world';
    worldData = await fetch(url).then(r => r.json());
  } catch {
    console.warn('No world data available');
    return;
  }

  const gridCols = worldData.gridCols || 16;
  const gridRows = worldData.gridRows || 12;
  const tileSize = 32;
  const basePath = '/worlds/' + (teamId || '');

  // Build scene config
  const floor = worldData.floor || Array.from({ length: gridRows }, () => Array(gridCols).fill(''));
  const walkable = [];
  for (let r = 0; r < gridRows; r++) {
    walkable[r] = [];
    for (let c = 0; c < gridCols; c++) {
      walkable[r][c] = (floor[r]?.[c] ?? '') !== '';
    }
  }

  const tiles = { ...(worldData.tiles || {}) };
  for (const [key, src] of Object.entries(tiles)) {
    if (/^(blob:|data:|https?:\\/\\/)/.test(src)) continue;
    tiles[key] = basePath + '/' + (src.startsWith('/') ? src.slice(1) : src);
  }

  const sceneConfig = {
    name: 'main',
    tileWidth: tileSize,
    tileHeight: tileSize,
    layers: [floor],
    walkable,
    locations: {},
    tiles,
  };

  // Citizens from world data
  const citizenDefs = worldData.citizens || [];
  const citizens = citizenDefs.map(def => ({
    agentId: def.agentId || def.id,
    name: def.name,
    sprite: def.sprite,
    position: def.position,
    npc: def.type === 'npc',
  }));

  const spriteSheets = {};
  for (const def of citizenDefs) {
    spriteSheets[def.sprite] = createStandardSpriteConfig(def.sprite);
  }

  const mv = new Miniverse({
    container,
    world: 'nightshift',
    scene: 'main',
    signal: {
      type: 'websocket',
      url: 'ws://' + location.host + '/ws',
    },
    citizens,
    scale: 2,
    width: gridCols * tileSize,
    height: gridRows * tileSize,
    sceneConfig,
    spriteSheets,
    objects: [],
  });

  // Props
  const props = new PropSystem(tileSize, 2);
  const propImages = worldData.propImages || {};
  await Promise.all(
    Object.entries(propImages).map(([id, src]) => {
      const clean = src.startsWith('/') ? src.slice(1) : src;
      return props.loadSprite(id, basePath + '/' + clean);
    })
  );
  props.setLayout(worldData.props || []);
  if (worldData.wanderPoints) props.setWanderPoints(worldData.wanderPoints);

  props.setDeadspaceCheck((col, row) => {
    const f = mv.getFloorLayer();
    return f?.[row]?.[col] === '';
  });

  mv.setTypedLocations(props.getLocations());
  mv.updateWalkability(props.getBlockedTiles());

  await mv.start();
  currentMv = mv;

  mv.addLayer({ order: 5, render: (ctx) => props.renderBelow(ctx) });
  mv.addLayer({ order: 15, render: (ctx) => props.renderAbove(ctx) });

  // Tooltip on click
  mv.on('citizen:click', (data) => {
    tooltip.style.display = 'block';
    tooltip.querySelector('.name').textContent = data.name;
    tooltip.querySelector('.state').textContent = 'State: ' + data.state;
    tooltip.querySelector('.task').textContent = data.task ? 'Task: ' + data.task : 'No active task';
    setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
  });

  container.addEventListener('mousemove', (e) => {
    tooltip.style.left = e.clientX + 12 + 'px';
    tooltip.style.top = e.clientY + 12 + 'px';
  });
}

// --- WebSocket for status panel ---
function connect() {
  const ws = new WebSocket('ws://' + location.host + '/ws');

  ws.onopen = () => {
    connStatus.textContent = 'Connected';
    connStatus.className = 'connected';
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'agents' && Array.isArray(msg.agents)) {
        for (const agent of msg.agents) {
          agents.set(agent.agent, agent);
          renderCard(agent);
        }
      }
    } catch {}
  };

  ws.onclose = () => {
    connStatus.textContent = 'Disconnected — reconnecting...';
    connStatus.className = 'disconnected';
    setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

// --- Team selector setup ---
async function initTeamSelector() {
  const select = document.getElementById('team-select');
  const empty = document.getElementById('team-empty');
  let worlds = [];
  try {
    const res = await fetch('/api/worlds');
    const data = await res.json();
    worlds = data.worlds || [];
  } catch {}

  if (worlds.length === 0) {
    select.style.display = 'none';
    empty.style.display = 'inline';
    return;
  }

  for (const w of worlds) {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.id + ' (' + w.agents + ' agents)';
    select.appendChild(opt);
  }

  // Check URL for initial team selection
  const urlTeam = new URLSearchParams(location.search).get('team');
  if (urlTeam && worlds.some(w => w.id === urlTeam)) {
    select.value = urlTeam;
  }

  currentTeam = select.value;
  refreshStatusPanel();
  startWorld(currentTeam).catch(console.error);

  select.addEventListener('change', () => {
    currentTeam = select.value;
    history.replaceState(null, '', '?team=' + encodeURIComponent(currentTeam));
    refreshStatusPanel();
    startWorld(currentTeam).catch(console.error);
  });
}

initTeamSelector().catch(console.error);
connect();
</script>
</body>
</html>`;
}
