/**
 * Nightshift visualization frontend.
 * Serves the pixel-art world + status panel using agentville core engine.
 */
export function getFrontendHtml(): string {
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
  position: relative;
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

#hud {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  z-index: 10;
}

.hud-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(13, 17, 23, 0.85);
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.hud-icon {
  font-size: 16px;
  line-height: 1;
}

.hud-coins .hud-icon { color: #f0c040; }
.hud-coins .hud-value { color: #f0c040; }

.hud-energy .hud-icon { color: #3fb950; }
.hud-energy .hud-value { color: #3fb950; }
</style>
</head>
<body>
<h1>nightshift</h1>

<div id="canvas-container">
  <div id="hud">
    <div class="hud-item hud-coins">
      <span class="hud-icon">&#x1FA99;</span>
      <span class="hud-value" id="hud-coins">1,250</span>
    </div>
    <div class="hud-item hud-energy">
      <span class="hud-icon">&#x26A1;</span>
      <span class="hud-value" id="hud-energy">850</span>
    </div>
  </div>
</div>
<div id="status-panel"></div>
<div id="connection-status">Connecting...</div>

<div id="tooltip">
  <div class="name"></div>
  <div class="state"></div>
  <div class="task"></div>
</div>

<script type="module">
import { Agentville, PropSystem, createStandardSpriteConfig } from '/agentville-core.js';

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

function getRole(agentId) {
  const parts = agentId.split('-');
  return parts.length >= 3 ? parts.slice(2).join('-') : agentId;
}

function renderCard(agent) {
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

// --- Load and start the single world ---
async function startWorld() {
  let worldData;
  try {
    worldData = await fetch('/api/world').then(r => r.json());
  } catch {
    console.warn('No world data available');
    return;
  }

  if (worldData.error) {
    console.warn('No world data:', worldData.error);
    return;
  }

  const gridCols = worldData.gridCols || 16;
  const gridRows = worldData.gridRows || 12;
  const tileSize = 32;

  // Determine base path for assets — use first available world key from /api/worlds
  let basePath = '/worlds/';
  try {
    const worldsRes = await fetch('/api/worlds');
    const worldsData = await worldsRes.json();
    if (worldsData.repos && worldsData.repos.length > 0) {
      const r = worldsData.repos[0];
      if (r.teams && r.teams.length > 0) {
        basePath = '/worlds/' + r.repo + '/' + r.teams[0].id;
      }
    }
  } catch { /* use default */ }

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

  // Build spawn locations from citizen positions
  const spawnLocations = {};
  const citizenDefs = worldData.citizens || [];
  for (const def of citizenDefs) {
    const pos = def.position;
    if (pos && typeof pos === 'object' && !Array.isArray(pos) && typeof pos.x === 'number' && typeof pos.y === 'number') {
      const locName = '_spawn_' + pos.x + '_' + pos.y;
      spawnLocations[locName] = { x: pos.x, y: pos.y };
    }
  }

  const sceneConfig = {
    name: 'main',
    tileWidth: tileSize,
    tileHeight: tileSize,
    layers: [floor],
    walkable,
    locations: spawnLocations,
    tiles,
  };

  // Citizens from world data
  const citizens = citizenDefs.map(def => {
    let pos = def.position;
    if (pos && typeof pos === 'object' && !Array.isArray(pos) && typeof pos.x === 'number' && typeof pos.y === 'number') {
      pos = '_spawn_' + pos.x + '_' + pos.y;
    }
    return {
      agentId: def.agentId || def.id,
      name: def.name,
      sprite: def.sprite,
      position: pos,
      npc: def.type === 'npc',
    };
  });

  const spriteSheets = {};
  for (const def of citizenDefs) {
    spriteSheets[def.sprite] = createStandardSpriteConfig(def.sprite);
  }

  const mv = new Agentville({
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
}

container.addEventListener('mousemove', (e) => {
  tooltip.style.left = e.clientX + 12 + 'px';
  tooltip.style.top = e.clientY + 12 + 'px';
});

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

startWorld().catch(console.error);
connect();
</script>
</body>
</html>`;
}
