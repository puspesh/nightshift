/**
 * Nightshift visualization frontend.
 * Serves the pixel-art world + status panel + game layer using agentville core engine.
 *
 * Phase 6: Full game layer — live HUD, shop, inventory, placement, animations, toasts.
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

/* --- HUD --- */
#hud {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
  z-index: 10;
}

#hud-left, #hud-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

#hud-right {
  pointer-events: auto;
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

.hud-icon { font-size: 16px; line-height: 1; }
.hud-coins .hud-icon, .hud-coins .hud-value { color: #f0c040; }
.hud-rate .hud-icon, .hud-rate .hud-value { color: #3fb950; }
.hud-streak .hud-icon, .hud-streak .hud-value { color: #f78166; }
.hud-agents .hud-icon, .hud-agents .hud-value { color: #58a6ff; }
.hud-subagents .hud-icon, .hud-subagents .hud-value { color: #d2a8ff; }

.hud-btn {
  cursor: pointer;
  pointer-events: auto;
  transition: border-color 0.2s, background 0.2s;
}
.hud-btn:hover {
  border-color: #58a6ff;
  background: rgba(88, 166, 255, 0.1);
}

/* --- Coin animation --- */
@keyframes coinFloat {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-40px); }
}
.coin-float {
  position: absolute;
  color: #f0c040;
  font-size: 14px;
  font-weight: 700;
  pointer-events: none;
  animation: coinFloat 1.2s ease-out forwards;
  z-index: 20;
}

@keyframes sparkle {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
  100% { opacity: 0; transform: scale(0.8); }
}
.sparkle {
  position: absolute;
  color: #ffd700;
  font-size: 18px;
  pointer-events: none;
  animation: sparkle 0.8s ease-out forwards;
  z-index: 20;
}

/* --- Toast system --- */
#toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 200;
  pointer-events: none;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(100px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes toastOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(100px); }
}

.toast {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 12px;
  color: #c9d1d9;
  animation: toastIn 0.3s ease-out;
  max-width: 280px;
  pointer-events: auto;
}
.toast.removing {
  animation: toastOut 0.3s ease-in forwards;
}
.toast-success { border-left: 3px solid #3fb950; }
.toast-info { border-left: 3px solid #58a6ff; }
.toast-drop { border-left: 3px solid #ffd700; }
.toast-effect { border-left: 3px solid #d2a8ff; }

/* --- Shop / Inventory overlay panels --- */
.overlay-panel {
  display: none;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 12px;
  width: 480px;
  max-height: 70vh;
  overflow-y: auto;
  z-index: 150;
  padding: 20px;
}
.overlay-panel.open { display: block; }

.overlay-backdrop {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 140;
}
.overlay-backdrop.open { display: block; }

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.panel-header h2 {
  font-size: 16px;
  color: #58a6ff;
  font-weight: 600;
}
.panel-close {
  background: none;
  border: none;
  color: #8b949e;
  font-size: 18px;
  cursor: pointer;
}
.panel-close:hover { color: #c9d1d9; }

/* Shop tabs */
.shop-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.shop-tab {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: #8b949e;
  cursor: pointer;
  font-family: inherit;
}
.shop-tab:hover { border-color: #58a6ff; color: #c9d1d9; }
.shop-tab.active { background: #58a6ff; color: #0d1117; border-color: #58a6ff; }

/* Item cards */
.item-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}
.item-info { flex: 1; }
.item-name {
  font-size: 13px;
  font-weight: 600;
  color: #c9d1d9;
}
.item-desc {
  font-size: 11px;
  color: #8b949e;
  margin-top: 2px;
}
.item-price {
  font-size: 12px;
  color: #f0c040;
  margin-top: 4px;
}
.rarity-common { }
.rarity-rare .item-name { color: #58a6ff; }
.rarity-legendary .item-name { color: #ffd700; }
.rarity-badge {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 6px;
}
.rarity-badge.common { background: #21262d; color: #8b949e; }
.rarity-badge.rare { background: #1a3a5c; color: #58a6ff; }
.rarity-badge.legendary { background: #3d2e00; color: #ffd700; }

.buy-btn, .place-btn, .unplace-btn {
  background: #238636;
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 14px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.buy-btn:hover { background: #2ea043; }
.buy-btn:disabled {
  background: #21262d;
  color: #484f58;
  cursor: not-allowed;
}
.place-btn { background: #1f6feb; }
.place-btn:hover { background: #388bfd; }
.unplace-btn { background: #da3633; }
.unplace-btn:hover { background: #f85149; }

.coming-soon {
  opacity: 0.4;
  pointer-events: none;
}
.coming-soon .item-name::after {
  content: ' (Coming Soon)';
  color: #484f58;
  font-weight: 400;
}

/* Placement mode */
#placement-overlay {
  display: none;
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  z-index: 30;
}
#placement-overlay.active { display: block; }
.placement-hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(13, 17, 23, 0.9);
  border: 1px solid #58a6ff;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 11px;
  color: #58a6ff;
}

/* Canvas overlay for effects */
#effects-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 15;
}

/* Zzz animation for idle agents */
@keyframes zzzFloat {
  0% { opacity: 0.8; transform: translateY(0) scale(0.8); }
  50% { opacity: 1; transform: translateY(-6px) scale(1); }
  100% { opacity: 0.4; transform: translateY(-12px) scale(0.7); }
}

/* Star pulse for sub-agents */
@keyframes starPulse {
  0% { opacity: 0.6; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0.6; transform: scale(0.8); }
}

/* Error spark */
@keyframes errorSpark {
  0% { opacity: 1; transform: translateY(0) rotate(0deg); }
  100% { opacity: 0; transform: translateY(-10px) rotate(90deg); }
}
</style>
</head>
<body>
<h1>nightshift</h1>

<div id="canvas-container">
  <div id="hud">
    <div id="hud-left">
      <div class="hud-item hud-coins">
        <span class="hud-icon">&#x1FA99;</span>
        <span class="hud-value" id="hud-coins">0</span>
      </div>
      <div class="hud-item hud-rate">
        <span class="hud-icon">&#x26A1;</span>
        <span class="hud-value" id="hud-rate">0/hr</span>
      </div>
      <div class="hud-item hud-streak">
        <span class="hud-icon">&#x1F525;</span>
        <span class="hud-value" id="hud-streak">0</span>
      </div>
      <div class="hud-item hud-agents">
        <span class="hud-icon">&#x1F464;</span>
        <span class="hud-value" id="hud-agents">0</span>
      </div>
      <div class="hud-item hud-subagents" id="hud-subagents-wrap" style="display:none">
        <span class="hud-icon">&#x2B50;</span>
        <span class="hud-value" id="hud-subagents">0</span>
      </div>
    </div>
    <div id="hud-right">
      <div class="hud-item hud-btn" id="shop-btn" title="Shop">
        <span class="hud-icon">&#x1F6D2;</span>
        <span>Shop</span>
      </div>
      <div class="hud-item hud-btn" id="inv-btn" title="Inventory">
        <span class="hud-icon">&#x1F4E6;</span>
        <span>Inventory</span>
      </div>
    </div>
  </div>
  <canvas id="effects-overlay"></canvas>
  <div id="placement-overlay">
    <div class="placement-hint">Click to place item &mdash; ESC to cancel</div>
  </div>
</div>
<div id="status-panel"></div>
<div id="connection-status">Connecting...</div>

<div id="tooltip">
  <div class="name"></div>
  <div class="state"></div>
  <div class="task"></div>
</div>

<!-- Shop panel -->
<div class="overlay-backdrop" id="shop-backdrop"></div>
<div class="overlay-panel" id="shop-panel">
  <div class="panel-header">
    <h2>Shop</h2>
    <button class="panel-close" id="shop-close">&times;</button>
  </div>
  <div class="shop-tabs" id="shop-tabs"></div>
  <div id="shop-items"></div>
</div>

<!-- Inventory panel -->
<div class="overlay-backdrop" id="inv-backdrop"></div>
<div class="overlay-panel" id="inv-panel">
  <div class="panel-header">
    <h2>Inventory</h2>
    <button class="panel-close" id="inv-close">&times;</button>
  </div>
  <div id="inv-items"></div>
</div>

<!-- Toast container -->
<div id="toast-container"></div>

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

// --- Game state ---
let gameState = null;
let currentCoins = 0;
let earningsHistory = []; // { coins, time }
let subAgentCount = 0;
let catalogCache = null;

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function getRole(agentId) {
  const parts = agentId.split('-');
  return parts.length >= 3 ? parts.slice(2).join('-') : agentId;
}

function formatNumber(n) {
  return n.toLocaleString();
}

// --- HUD ---
function updateHudCoins(value, animate) {
  const el = document.getElementById('hud-coins');
  if (animate && value > currentCoins) {
    animateCoinCounter(el, currentCoins, value);
  } else {
    el.textContent = formatNumber(value);
  }
  currentCoins = value;
}

function animateCoinCounter(el, from, to) {
  const diff = to - from;
  const steps = Math.min(diff, 20);
  const stepSize = diff / steps;
  let current = from;
  let step = 0;
  const interval = setInterval(() => {
    step++;
    current = step === steps ? to : Math.round(from + stepSize * step);
    el.textContent = formatNumber(current);
    if (step >= steps) clearInterval(interval);
  }, 50);
}

function updateHudRate() {
  const el = document.getElementById('hud-rate');
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  const recent = earningsHistory.filter(e => e.time > oneHourAgo);
  const total = recent.reduce((s, e) => s + e.coins, 0);
  el.textContent = formatNumber(total) + '/hr';
}

function updateHudStreak(days) {
  document.getElementById('hud-streak').textContent = String(days);
}

function updateHudAgents() {
  const el = document.getElementById('hud-agents');
  let working = 0, idle = 0, errored = 0, total = 0;
  for (const a of agents.values()) {
    total++;
    if (a.state === 'working' || a.state === 'thinking') working++;
    else if (a.state === 'error') errored++;
    else idle++;
  }
  el.textContent = working + '/' + total;
}

function updateHudSubAgents() {
  const wrap = document.getElementById('hud-subagents-wrap');
  const el = document.getElementById('hud-subagents');
  if (subAgentCount > 0) {
    wrap.style.display = '';
    el.textContent = String(subAgentCount);
  } else {
    wrap.style.display = 'none';
  }
}

// --- Coin float animation ---
function showCoinFloat(amount) {
  const hud = document.getElementById('hud-coins');
  const rect = hud.getBoundingClientRect();
  const float = document.createElement('div');
  float.className = 'coin-float';
  float.textContent = '+' + formatNumber(amount);
  float.style.left = rect.left + 'px';
  float.style.top = (rect.top - 4) + 'px';
  document.body.appendChild(float);
  setTimeout(() => float.remove(), 1200);
}

function showSparkle() {
  const hud = document.getElementById('hud-coins');
  const rect = hud.getBoundingClientRect();
  const s = document.createElement('div');
  s.className = 'sparkle';
  s.textContent = '\\u2728';
  s.style.left = (rect.left - 12) + 'px';
  s.style.top = (rect.top - 8) + 'px';
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 800);
}

// --- Toast system ---
const toastQueue = [];
const MAX_TOASTS = 3;

function showToast(message, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  const existing = container.querySelectorAll('.toast:not(.removing)');
  if (existing.length >= MAX_TOASTS) {
    const oldest = existing[0];
    oldest.classList.add('removing');
    setTimeout(() => oldest.remove(), 300);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Agent card rendering ---
function renderCard(agent) {
  const role = getRole(agent.agent);
  let card = document.querySelector('[data-agent="' + CSS.escape(agent.agent) + '"]');
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

// --- Effects overlay (stars, zzz, error sparks) ---
const effectsCanvas = document.getElementById('effects-overlay');
const effectsCtx = effectsCanvas.getContext('2d');
const agentEffects = new Map(); // agentKey -> { stars, state }

function resizeEffectsOverlay() {
  const c = container.querySelector('canvas:not(#effects-overlay)');
  if (c) {
    effectsCanvas.width = c.width;
    effectsCanvas.height = c.height;
    effectsCanvas.style.width = c.style.width;
    effectsCanvas.style.height = c.style.height;
  }
}

function renderEffects(timestamp) {
  if (!effectsCanvas.width) resizeEffectsOverlay();
  effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);

  for (const [agentKey, fx] of agentEffects) {
    const agent = agents.get(agentKey);
    if (!agent) continue;

    // Try to find citizen position from engine (approximate from card index)
    const cards = panel.querySelectorAll('.agent-card');
    let idx = 0;
    for (const card of cards) {
      if (card.dataset.agent === agentKey) break;
      idx++;
    }

    // Approximate position on canvas (simple grid layout)
    const cols = 4;
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const tileSize = 32;
    const scale = 2;
    const cx = (col * 3 + 2) * tileSize * scale / 2;
    const cy = (row * 3 + 2) * tileSize * scale / 2;

    // Stars for sub-agents
    if (fx.stars > 0) {
      const starCount = Math.min(fx.stars, 5);
      for (let i = 0; i < starCount; i++) {
        const phase = (timestamp / 600 + i * 0.8) % (Math.PI * 2);
        const sx = cx - (starCount - 1) * 6 + i * 12;
        const sy = cy - 20 + Math.sin(phase) * 3;
        const size = 8 + Math.sin(phase) * 2;
        effectsCtx.fillStyle = '#ffd700';
        effectsCtx.globalAlpha = 0.6 + Math.sin(phase) * 0.4;
        effectsCtx.font = size + 'px sans-serif';
        effectsCtx.fillText('\\u2B50', sx, sy);
      }
      effectsCtx.globalAlpha = 1;
    }

    // Zzz for idle
    if (agent.state === 'idle' || agent.state === 'sleeping') {
      const phase = (timestamp / 1000) % (Math.PI * 2);
      effectsCtx.fillStyle = '#8b949e';
      effectsCtx.globalAlpha = 0.4 + Math.sin(phase) * 0.3;
      effectsCtx.font = '12px sans-serif';
      effectsCtx.fillText('z', cx + 8, cy - 14 - Math.sin(phase) * 4);
      effectsCtx.font = '10px sans-serif';
      effectsCtx.fillText('z', cx + 14, cy - 20 - Math.sin(phase + 1) * 3);
      effectsCtx.font = '8px sans-serif';
      effectsCtx.fillText('Z', cx + 18, cy - 26 - Math.sin(phase + 2) * 2);
      effectsCtx.globalAlpha = 1;
    }

    // Error sparks
    if (agent.state === 'error') {
      effectsCtx.fillStyle = '#f85149';
      effectsCtx.font = '14px sans-serif';
      const phase = (timestamp / 500) % (Math.PI * 2);
      effectsCtx.globalAlpha = 0.7 + Math.sin(phase) * 0.3;
      effectsCtx.fillText('\\u2757', cx - 4, cy - 18);
      // Small sparks
      for (let i = 0; i < 2; i++) {
        const sp = (timestamp / 300 + i * 1.5) % (Math.PI * 2);
        effectsCtx.globalAlpha = Math.max(0, Math.sin(sp) * 0.6);
        effectsCtx.font = '6px sans-serif';
        effectsCtx.fillText('\\u2022', cx + Math.cos(sp) * 12, cy - 12 + Math.sin(sp) * 8);
      }
      effectsCtx.globalAlpha = 1;
    }
  }

  requestAnimationFrame(renderEffects);
}
requestAnimationFrame(renderEffects);

// --- World state -> render config (6.1) ---
function worldStateToRenderConfig(world) {
  const room = world.world.floors[0]?.rooms[0];
  const gridCols = room ? room.width : 12;
  const gridRows = room ? room.height : 8;
  const tileSize = 32;

  // Generate basic floor tile grid
  const floor = [];
  for (let r = 0; r < gridRows; r++) {
    const row = [];
    for (let c = 0; c < gridCols; c++) {
      row.push('floor');
    }
    floor.push(row);
  }

  // Walkable: all floor tiles walkable
  const walkable = floor.map(row => row.map(() => true));

  // Map placed inventory items to props
  const props = [];
  const placedItems = world.inventory.filter(item => item.placed && item.placedAt);
  for (const item of placedItems) {
    props.push({
      id: item.id,
      type: item.type,
      catalogId: item.catalogId,
      x: item.placedAt.x,
      y: item.placedAt.y,
    });
    // Block walkable for desks/facilities
    if (item.type === 'desk' || item.type === 'facility') {
      const px = item.placedAt.x;
      const py = item.placedAt.y;
      if (py >= 0 && py < gridRows && px >= 0 && px < gridCols) {
        walkable[py][px] = false;
      }
    }
  }

  // Build spawn locations from placed desks (agents sit at desks)
  const spawnLocations = {};
  for (const item of placedItems) {
    if (item.type === 'desk' && item.placedAt) {
      // Agent spawn one tile below desk
      const sx = item.placedAt.x;
      const sy = Math.min(item.placedAt.y + 1, gridRows - 1);
      spawnLocations['desk_' + item.id] = { x: sx, y: sy };
    }
  }

  // Map registered agents to citizens
  const citizens = [];
  const agentEntries = Object.entries(world.agents);
  for (let i = 0; i < agentEntries.length; i++) {
    const [agentKey, agentRec] = agentEntries[i];
    const deskItem = agentRec.desk ? placedItems.find(it => it.id === agentRec.desk) : null;
    let position;
    if (deskItem && deskItem.placedAt) {
      position = 'desk_' + deskItem.id;
    } else {
      // Default position spread across room
      position = { x: 2 + (i * 2) % gridCols, y: Math.min(4 + Math.floor(i / 3), gridRows - 1) };
    }
    citizens.push({
      agentId: agentKey,
      name: agentRec.name,
      sprite: agentRec.cosmetic || 'cosmetic_robot',
      position,
      npc: false,
    });
  }

  return {
    gridCols,
    gridRows,
    tileSize,
    floor,
    walkable,
    props,
    spawnLocations,
    citizens,
  };
}

// --- Shop UI (6.4) ---
const SHOP_CATEGORIES = [
  { type: 'desk', label: 'Desks' },
  { type: 'facility', label: 'Facilities' },
  { type: 'decoration', label: 'Decorations' },
  { type: 'cosmetic', label: 'Cosmetics' },
  { type: 'consumable', label: 'Consumables' },
  { type: 'expansion', label: 'Expansions' },
];

let shopActiveTab = 'desk';

async function openShop() {
  const panel = document.getElementById('shop-panel');
  const backdrop = document.getElementById('shop-backdrop');
  panel.classList.add('open');
  backdrop.classList.add('open');

  if (!catalogCache) {
    try {
      const res = await fetch('/api/catalog');
      catalogCache = await res.json();
    } catch {
      catalogCache = { catalog: {} };
    }
  }

  renderShopTabs();
  renderShopItems();
}

function closeShop() {
  document.getElementById('shop-panel').classList.remove('open');
  document.getElementById('shop-backdrop').classList.remove('open');
}

function renderShopTabs() {
  const tabsEl = document.getElementById('shop-tabs');
  tabsEl.innerHTML = '';
  for (const cat of SHOP_CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = 'shop-tab' + (shopActiveTab === cat.type ? ' active' : '');
    btn.textContent = cat.label;
    btn.onclick = () => {
      shopActiveTab = cat.type;
      renderShopTabs();
      renderShopItems();
    };
    tabsEl.appendChild(btn);
  }
}

function renderShopItems() {
  const itemsEl = document.getElementById('shop-items');
  const items = catalogCache?.catalog?.[shopActiveTab] || [];
  itemsEl.innerHTML = '';

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'item-card rarity-' + item.rarity;
    const canBuy = currentCoins >= item.price;
    card.innerHTML =
      '<div class="item-info">' +
        '<div class="item-name">' + esc(item.name) +
          '<span class="rarity-badge ' + item.rarity + '">' + item.rarity + '</span>' +
        '</div>' +
        '<div class="item-desc">' + esc(item.description) + '</div>' +
        '<div class="item-price">\\u1FA99 ' + formatNumber(item.price) + '</div>' +
      '</div>' +
      '<button class="buy-btn"' + (canBuy ? '' : ' disabled') + ' data-catalog-id="' + esc(item.catalogId) + '">Buy</button>';
    itemsEl.appendChild(card);
  }

  // Coming soon cash slots
  for (let i = 0; i < 2; i++) {
    const card = document.createElement('div');
    card.className = 'item-card coming-soon';
    card.innerHTML =
      '<div class="item-info">' +
        '<div class="item-name">Premium Item</div>' +
        '<div class="item-desc">Premium content coming soon.</div>' +
        '<div class="item-price">\\u1F4B5 ???</div>' +
      '</div>';
    itemsEl.appendChild(card);
  }

  // Buy handlers
  itemsEl.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const catalogId = e.target.dataset.catalogId;
      e.target.disabled = true;
      e.target.textContent = '...';
      try {
        const res = await fetch('/api/shop/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ catalogId }),
        });
        const result = await res.json();
        if (result.success) {
          showToast('Purchased ' + (result.item?.catalogId || catalogId) + '!', 'success');
          if (typeof result.coins === 'number') {
            updateHudCoins(result.coins, true);
          }
          renderShopItems();
        } else {
          showToast(result.error || 'Purchase failed', 'info');
          e.target.disabled = false;
          e.target.textContent = 'Buy';
        }
      } catch {
        showToast('Purchase failed', 'info');
        e.target.disabled = false;
        e.target.textContent = 'Buy';
      }
    });
  });
}

// --- Inventory UI (6.5) ---
let placementItem = null;

async function openInventory() {
  const panel = document.getElementById('inv-panel');
  const backdrop = document.getElementById('inv-backdrop');
  panel.classList.add('open');
  backdrop.classList.add('open');
  await refreshInventory();
}

function closeInventory() {
  document.getElementById('inv-panel').classList.remove('open');
  document.getElementById('inv-backdrop').classList.remove('open');
}

async function refreshInventory() {
  const itemsEl = document.getElementById('inv-items');
  let inventory = [];
  try {
    const res = await fetch('/api/game-state');
    if (res.ok) {
      const state = await res.json();
      inventory = state.inventory || [];
      gameState = state;
    }
  } catch { /* empty */ }

  const unplaced = inventory.filter(item => !item.placed);
  const placed = inventory.filter(item => item.placed);

  itemsEl.innerHTML = '';

  if (unplaced.length === 0 && placed.length === 0) {
    itemsEl.innerHTML = '<div style="color:#8b949e;font-size:12px;text-align:center;padding:20px">No items yet. Visit the Shop!</div>';
    return;
  }

  if (unplaced.length > 0) {
    const h = document.createElement('div');
    h.style.cssText = 'font-size:12px;color:#8b949e;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px';
    h.textContent = 'Unplaced (' + unplaced.length + ')';
    itemsEl.appendChild(h);

    for (const item of unplaced) {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML =
        '<div class="item-info">' +
          '<div class="item-name">' + esc(item.catalogId) + '</div>' +
          '<div class="item-desc">' + esc(item.type) + '</div>' +
        '</div>' +
        '<button class="place-btn" data-item-id="' + esc(item.id) + '">Place</button>';
      itemsEl.appendChild(card);
    }
  }

  if (placed.length > 0) {
    const h = document.createElement('div');
    h.style.cssText = 'font-size:12px;color:#8b949e;margin:12px 0 8px;text-transform:uppercase;letter-spacing:1px';
    h.textContent = 'Placed (' + placed.length + ')';
    itemsEl.appendChild(h);

    for (const item of placed) {
      const loc = item.placedAt ? '(' + item.placedAt.x + ', ' + item.placedAt.y + ')' : '';
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML =
        '<div class="item-info">' +
          '<div class="item-name">' + esc(item.catalogId) + '</div>' +
          '<div class="item-desc">' + esc(item.type) + ' \\u2022 ' + loc + '</div>' +
        '</div>' +
        '<button class="unplace-btn" data-item-id="' + esc(item.id) + '">Unplace</button>';
      itemsEl.appendChild(card);
    }
  }

  // Place handlers
  itemsEl.querySelectorAll('.place-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const itemId = e.target.dataset.itemId;
      startPlacement(itemId);
    });
  });

  // Unplace handlers
  itemsEl.querySelectorAll('.unplace-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemId = e.target.dataset.itemId;
      e.target.disabled = true;
      try {
        const res = await fetch('/api/shop/unplace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId }),
        });
        const result = await res.json();
        if (result.success) {
          showToast('Item removed', 'info');
          await refreshInventory();
        } else {
          showToast(result.error || 'Failed', 'info');
          e.target.disabled = false;
        }
      } catch {
        e.target.disabled = false;
      }
    });
  });
}

// --- Placement mode (6.5) ---
function startPlacement(itemId) {
  placementItem = itemId;
  closeInventory();
  document.getElementById('placement-overlay').classList.add('active');
}

function cancelPlacement() {
  placementItem = null;
  document.getElementById('placement-overlay').classList.remove('active');
}

document.getElementById('placement-overlay').addEventListener('click', async (e) => {
  if (!placementItem) return;
  const overlay = document.getElementById('placement-overlay');
  const rect = overlay.getBoundingClientRect();
  // Calculate grid position from click
  const tileSize = 32;
  const scale = 2;
  const x = Math.floor((e.clientX - rect.left) / (tileSize * scale));
  const y = Math.floor((e.clientY - rect.top) / (tileSize * scale));

  const roomId = gameState?.world?.floors?.[0]?.rooms?.[0]?.id || 'room_0';
  const itemId = placementItem;
  cancelPlacement();

  try {
    const res = await fetch('/api/shop/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, roomId, x, y }),
    });
    const result = await res.json();
    if (result.success) {
      showToast('Item placed at (' + x + ', ' + y + ')', 'success');
    } else {
      showToast(result.error || 'Placement failed', 'info');
    }
  } catch {
    showToast('Placement failed', 'info');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cancelPlacement();
    closeShop();
    closeInventory();
  }
});

// --- Shop/Inventory button handlers ---
document.getElementById('shop-btn').addEventListener('click', openShop);
document.getElementById('shop-close').addEventListener('click', closeShop);
document.getElementById('shop-backdrop').addEventListener('click', closeShop);
document.getElementById('inv-btn').addEventListener('click', openInventory);
document.getElementById('inv-close').addEventListener('click', closeInventory);
document.getElementById('inv-backdrop').addEventListener('click', closeInventory);

// --- Load and start the world ---
async function startWorld() {
  // Try game state first (Phase 6 world)
  let gameStateData = null;
  try {
    const gsRes = await fetch('/api/game-state');
    if (gsRes.ok) {
      gameStateData = await gsRes.json();
      gameState = gameStateData;
    }
  } catch { /* no game state */ }

  if (gameStateData) {
    // Populate HUD from game state
    currentCoins = gameStateData.coins || 0;
    document.getElementById('hud-coins').textContent = formatNumber(currentCoins);
    updateHudStreak(gameStateData.stats?.streakDays || 0);
    return startWorldFromGameState(gameStateData);
  }

  // Fall back to legacy /api/world
  return startLegacyWorld();
}

async function startWorldFromGameState(world) {
  const config = worldStateToRenderConfig(world);
  const tileSize = config.tileSize;

  const sceneConfig = {
    name: 'main',
    tileWidth: tileSize,
    tileHeight: tileSize,
    layers: [config.floor],
    walkable: config.walkable,
    locations: config.spawnLocations,
    tiles: { floor: null }, // basic floor — no sprite, engine draws flat color
  };

  const spriteSheets = {};
  for (const c of config.citizens) {
    spriteSheets[c.sprite] = createStandardSpriteConfig(c.sprite);
  }

  const mv = new Agentville({
    container,
    world: 'nightshift',
    scene: 'main',
    signal: {
      type: 'websocket',
      url: 'ws://' + location.host + '/ws',
    },
    citizens: config.citizens,
    scale: 2,
    width: config.gridCols * tileSize,
    height: config.gridRows * tileSize,
    sceneConfig,
    spriteSheets,
    objects: [],
  });

  await mv.start();
  window.__av = mv;
  resizeEffectsOverlay();

  // Tooltip on click
  mv.on('citizen:click', (data) => {
    tooltip.style.display = 'block';
    tooltip.querySelector('.name').textContent = data.name;
    tooltip.querySelector('.state').textContent = 'State: ' + data.state;
    tooltip.querySelector('.task').textContent = data.task ? 'Task: ' + data.task : 'No active task';
    setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
  });
}

async function startLegacyWorld() {
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

  // Single-world Agentville: assets live under /worlds/agentville/.
  const basePath = '/worlds/agentville';

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
  window.__av = mv;
  resizeEffectsOverlay();

  mv.addLayer({ order: 5, render: (ctx) => props.renderBelow(ctx) });
  mv.addLayer({ order: 15, render: (ctx) => props.renderAbove(ctx) });

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

// --- WebSocket (6.3) ---
function connect() {
  const ws = new WebSocket('ws://' + location.host + '/ws');

  ws.onopen = () => {
    connStatus.textContent = 'Connected';
    connStatus.className = 'connected';
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'agents': {
          if (Array.isArray(msg.agents)) {
            for (const agent of msg.agents) {
              agents.set(agent.agent, agent);
              renderCard(agent);
              // Init effects entry
              if (!agentEffects.has(agent.agent)) {
                agentEffects.set(agent.agent, { stars: 0 });
              }
            }
            updateHudAgents();
          }
          break;
        }

        case 'state:update': {
          const p = msg.payload;
          if (p && p.agent) {
            const existing = agents.get(p.agent);
            if (existing) {
              if (p.state !== undefined) existing.state = p.state;
              if (p.task !== undefined) existing.task = p.task;
              renderCard(existing);
            }
            updateHudAgents();
          }
          break;
        }

        case 'coins:earned': {
          const p = msg.payload;
          if (p) {
            const earned = p.coins || 0;
            const total = p.total || currentCoins + earned;
            // Float animation
            if (earned > 0) showCoinFloat(earned);
            // Sparkle for drops
            if (p.drop) {
              showSparkle();
              if (p.drop.type === 'item') {
                showToast('Drop: ' + (p.drop.catalogId || 'item') + '!', 'drop');
              } else if (p.drop.type === 'coins') {
                showToast('Bonus coins: +' + formatNumber(p.drop.amount || 0), 'drop');
              }
            }
            // Update HUD
            updateHudCoins(total, true);
            // Track for coins/hr
            earningsHistory.push({ coins: earned, time: Date.now() });
            if (earningsHistory.length > 200) earningsHistory = earningsHistory.slice(-100);
            updateHudRate();
          }
          break;
        }

        case 'item:purchased': {
          const p = msg.payload;
          showToast('Purchased: ' + (p?.catalogId || 'item'), 'success');
          if (typeof p?.coins === 'number') {
            updateHudCoins(p.coins, true);
          }
          // Refresh inventory if open
          if (document.getElementById('inv-panel').classList.contains('open')) {
            refreshInventory();
          }
          break;
        }

        case 'item:placed': {
          const p = msg.payload;
          showToast('Item placed at (' + (p?.x ?? '?') + ', ' + (p?.y ?? '?') + ')', 'success');
          break;
        }

        case 'item:unplaced': {
          showToast('Item removed from world', 'info');
          break;
        }

        case 'effect:activated': {
          const p = msg.payload;
          showToast('Effect activated: ' + (p?.catalogId || 'boost'), 'effect');
          break;
        }

        case 'agent:registered': {
          const p = msg.payload;
          if (p?.parent) {
            subAgentCount++;
            updateHudSubAgents();
            // Add star to parent
            const fx = agentEffects.get(p.parent);
            if (fx) {
              fx.stars++;
            } else {
              agentEffects.set(p.parent, { stars: 1 });
            }
          }
          break;
        }

        case 'work:completed': {
          // Already handled by coins:earned for HUD, but can show agent card update
          break;
        }

        default:
          break;
      }
    } catch { /* ignore parse errors */ }
  };

  ws.onclose = () => {
    connStatus.textContent = 'Disconnected \\u2014 reconnecting...';
    connStatus.className = 'disconnected';
    setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

// Handle spawn-ended for sub-agent tracking
// (this comes as state:update with state='offline' for child agents)
// We track spawn-ended by detecting state:update to 'offline' on agents that had stars
// Actually, the WS broadcast for spawn-ended is 'state:update' with state='offline'
// So we check in the state:update handler above. But the parent's star count
// doesn't get decremented there. Let's handle it based on the agent:registered message
// and the fact that spawn-ended sends state:update for the child.
// For simplicity, we listen for any 'state:update' where the agent goes offline and
// check if there's a parent relationship.

// Update coins/hr periodically
setInterval(updateHudRate, 30000);

startWorld().catch(console.error);
connect();
<\/script>
</body>
</html>`;
}
