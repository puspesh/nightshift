/**
 * Nightshift visualization frontend.
 * Serves the pixel-art world + status panel + game layer using agentville core engine.
 *
 * Phase 6: Full game layer — live HUD, shop, inventory, placement, animations, toasts.
 */
export function getFrontendHtml(devMode = false): string {
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
  display: none;
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

/* --- Game + Sidebar Layout --- */
#game-layout {
  display: flex;
  width: 100%;
  max-width: calc(720px + 280px);
  gap: 0;
}
#game-layout #canvas-container {
  flex: 1;
  min-width: 0;
}

/* --- Event Log Sidebar --- */
#event-log-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: #0d1117;
  border: 1px solid #30363d;
  border-left: none;
  border-radius: 0 8px 8px 0;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  overflow: hidden;
  align-self: stretch;
  max-height: var(--world-height);
}
#event-log-sidebar.collapsed {
  width: 32px;
}
#event-log-sidebar.collapsed #event-log-entries,
#event-log-sidebar.collapsed #event-log-header span {
  display: none;
}
#event-log-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
  padding: 0;
}
#sidebar-tabs {
  display: flex;
  flex: 1;
}
.sidebar-tab {
  flex: 1;
  padding: 10px 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #484f58;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  text-align: center;
}
.sidebar-tab:hover { color: #8b949e; }
.sidebar-tab.active {
  color: #c9d1d9;
  border-bottom-color: #58a6ff;
}
#event-log-sidebar.collapsed #sidebar-tabs {
  display: none;
}
#event-log-sidebar.collapsed #event-log-header {
  justify-content: center;
  padding: 12px 4px;
}
#sidebar-agents-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: #30363d #0d1117;
}
#sidebar-agents-list::-webkit-scrollbar { width: 6px; }
#sidebar-agents-list::-webkit-scrollbar-track { background: #0d1117; }
#sidebar-agents-list::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
#sidebar-agents-list::-webkit-scrollbar-thumb:hover { background: #484f58; }
.sidebar-agent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-bottom: 1px solid #21262d;
}
.sidebar-agent-card:last-child { border-bottom: none; }
.sidebar-agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sidebar-agent-info { flex: 1; min-width: 0; }
.sidebar-agent-name {
  font-size: 12px;
  font-weight: 600;
  color: #c9d1d9;
}
.sidebar-agent-status {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
}
.sidebar-agent-task {
  font-size: 11px;
  color: #484f58;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#event-log-toggle {
  background: none;
  border: none;
  color: #8b949e;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
}
#event-log-toggle:hover { color: #c9d1d9; }
#event-log-entries {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: #30363d #0d1117;
}
#event-log-entries::-webkit-scrollbar {
  width: 6px;
}
#event-log-entries::-webkit-scrollbar-track {
  background: #0d1117;
}
#event-log-entries::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}
#event-log-entries::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
.log-entry {
  font-size: 12px;
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  padding: 4px 0;
  border-bottom: 1px solid #21262d;
  color: #8b949e;
  line-height: 1.4;
}
.log-entry-time { color: #484f58; }
.log-entry-agent { color: #58a6ff; }
.log-entry-error { color: #f85149; }
.log-entry-drop { color: #f0c040; }
@media (max-width: 1024px) {
  #game-layout { flex-direction: column; }
  #event-log-sidebar {
    width: 100%;
    max-height: 200px;
    border-left: 1px solid #30363d;
    border-radius: 0 0 8px 8px;
  }
  #event-log-sidebar.collapsed { width: 100%; max-height: 32px; }
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

/* --- Dev Mode: Edit & Zone Overlay --- */
.dev-btn {
  background: #21262d;
  border: 1px solid #30363d;
  color: #8b949e;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: background 0.15s, color 0.15s;
}
.dev-btn:hover { background: #30363d; color: #c9d1d9; }
.dev-btn.active { background: #1f6feb; color: #fff; border-color: #1f6feb; }
#dev-toolbar {
  display: none;
  gap: 6px;
  align-items: center;
  margin-left: 12px;
}
#dev-toolbar::before {
  content: '|';
  color: #30363d;
  margin-right: 2px;
}
.edit-mode #canvas-container { cursor: crosshair; }
.edit-mode #canvas-container.dragging { cursor: grabbing; }
</style>
</head>
<body>
<h1>nightshift</h1>

<div id="game-layout">
<div id="canvas-container">
  <div id="hud">
    <div id="hud-left">
      <div class="hud-item hud-coins">
        <span class="hud-icon"><img src="/universal_assets/coin-icon.png" width="16" height="16" style="vertical-align:middle;image-rendering:pixelated" alt="coins"></span>
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
      <div id="dev-toolbar">
        <button class="dev-btn" id="dev-zones-btn" title="Toggle zone overlay (Z)">Zones</button>
        <button class="dev-btn" id="dev-walk-btn" title="Toggle walkable overlay (W)">Walk</button>
        <button class="dev-btn" id="dev-edit-btn" title="Edit mode (E)">Edit</button>
        <button class="dev-btn" id="dev-save-btn" style="display:none" title="Save world">Save</button>
      </div>
    </div>
  </div>
  <canvas id="effects-overlay"></canvas>
  <div id="placement-overlay">
    <div class="placement-hint">Click to place item &mdash; ESC to cancel</div>
  </div>
</div>
<!-- Event Log Sidebar (inside game-layout flex row) -->
<div id="event-log-sidebar">
  <div id="event-log-header">
    <div id="sidebar-tabs">
      <button class="sidebar-tab active" data-tab="activity">Activity</button>
      <button class="sidebar-tab" data-tab="agents">Agents</button>
    </div>
    <button id="event-log-toggle">&#x25C0;</button>
  </div>
  <div id="event-log-entries"></div>
  <div id="sidebar-agents-list" style="display:none"></div>
</div>
</div><!-- /game-layout -->
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

const DEV_MODE = ${devMode};

const STATE_LABELS = {
  working: 'Working', idle: 'Idle', thinking: 'Thinking',
  sleeping: 'Sleeping', error: 'Error', offline: 'Offline', speaking: 'Speaking',
};

const panel = document.getElementById('sidebar-agents-list');
const connStatus = document.getElementById('connection-status');
const container = document.getElementById('canvas-container');
const tooltip = document.getElementById('tooltip');
const agents = new Map();

// --- Sidebar tab switching ---
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const logEntriesEl = document.getElementById('event-log-entries');
const agentsListEl = document.getElementById('sidebar-agents-list');

sidebarTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    sidebarTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    logEntriesEl.style.display = which === 'activity' ? '' : 'none';
    agentsListEl.style.display = which === 'agents' ? '' : 'none';
  });
});

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

// --- Event Log Sidebar ---
const LOG_DOM_CAP = 500;
const SCROLL_BOTTOM_THRESHOLD = 20;
const SCROLL_TOP_TRIGGER = 40;

const logSidebar = document.getElementById('event-log-sidebar');
const logEntries = document.getElementById('event-log-entries');
const logToggle = document.getElementById('event-log-toggle');
let logReachedStart = false; // true when no more older entries to load
let logLoadingOlder = false; // debounce for infinite scroll

function formatLogTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}

function shortAgentName(key) {
  if (!key) return 'unknown';
  const parts = key.split('/');
  return parts[parts.length - 1];
}

function renderLogEntry(entry) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  if (entry.type === 'agent:error') div.classList.add('log-entry-error');
  if (entry.data && entry.data.drop) div.classList.add('log-entry-drop');
  div.dataset.id = String(entry.id);
  div.dataset.agent = entry.agentKey || '';
  div.innerHTML =
    '<span class="log-entry-time">[' + formatLogTime(entry.timestamp) + ']</span> ' +
    '<span class="log-entry-agent">' + esc(shortAgentName(entry.agentKey)) + '</span>: ' +
    esc(entry.summary);
  return div;
}

function isLogAtBottom() {
  return logEntries.scrollTop + logEntries.clientHeight >= logEntries.scrollHeight - SCROLL_BOTTOM_THRESHOLD;
}

function appendLogEntry(entry) {
  const atBottom = isLogAtBottom();
  const div = renderLogEntry(entry);
  logEntries.appendChild(div);

  // Cap DOM entries
  while (logEntries.children.length > LOG_DOM_CAP) {
    logEntries.removeChild(logEntries.firstChild);
  }

  if (atBottom) {
    logEntries.scrollTop = logEntries.scrollHeight;
  }
}

async function loadEventLog() {
  try {
    const res = await fetch('/api/event-log?limit=200');
    if (!res.ok) return;
    const data = await res.json();
    const entries = data.entries || [];
    logEntries.innerHTML = '';
    for (const entry of entries) {
      logEntries.appendChild(renderLogEntry(entry));
    }
    // Scroll to bottom initially
    logEntries.scrollTop = logEntries.scrollHeight;
    if (entries.length < 200) logReachedStart = true;
  } catch { /* ignore */ }
}

async function loadOlderEntries() {
  if (logReachedStart || logLoadingOlder) return;
  const firstEntry = logEntries.querySelector('.log-entry');
  if (!firstEntry) return;
  const beforeId = firstEntry.dataset.id;
  if (!beforeId) return;

  logLoadingOlder = true;
  try {
    const res = await fetch('/api/event-log?before=' + beforeId + '&limit=50');
    if (!res.ok) return;
    const data = await res.json();
    const entries = data.entries || [];
    if (entries.length < 50) logReachedStart = true;
    if (entries.length === 0) return;

    // Preserve scroll position
    const prevHeight = logEntries.scrollHeight;
    const prevTop = logEntries.scrollTop;

    for (let i = entries.length - 1; i >= 0; i--) {
      logEntries.insertBefore(renderLogEntry(entries[i]), logEntries.firstChild);
    }

    logEntries.scrollTop = prevTop + (logEntries.scrollHeight - prevHeight);
  } catch { /* ignore */ } finally {
    logLoadingOlder = false;
  }
}

// Infinite scroll — load older when scrolled to top
logEntries.addEventListener('scroll', () => {
  if (logEntries.scrollTop < SCROLL_TOP_TRIGGER) {
    loadOlderEntries();
  }
});

// Collapse/expand toggle
function initSidebarState() {
  const collapsed = localStorage.getItem('event-log-collapsed') === '1';
  if (collapsed) {
    logSidebar.classList.add('collapsed');
    logToggle.innerHTML = '&#x25B6;';
  }
}

logToggle.addEventListener('click', () => {
  const isCollapsed = logSidebar.classList.toggle('collapsed');
  logToggle.innerHTML = isCollapsed ? '&#x25B6;' : '&#x25C0;';
  localStorage.setItem('event-log-collapsed', isCollapsed ? '1' : '0');
});

initSidebarState();
loadEventLog();

// --- Agent card rendering (sidebar) ---
function renderCard(agent) {
  // Skip sub-agents — they show as star count in the HUD instead
  if (agent.agent && agent.agent.includes('/sub-')) return;
  const role = getRole(agent.agent);
  let card = panel.querySelector('[data-agent="' + CSS.escape(agent.agent) + '"]');
  if (!card) {
    card = document.createElement('div');
    card.className = 'sidebar-agent-card';
    card.dataset.agent = agent.agent;
    card.dataset.role = role;
    card.innerHTML = '<div class="sidebar-agent-dot"></div>'
      + '<div class="sidebar-agent-info">'
      + '<div class="sidebar-agent-name"></div>'
      + '<div class="sidebar-agent-status"></div>'
      + '<div class="sidebar-agent-task"></div>'
      + '</div>';
    panel.appendChild(card);
  }
  const agentColor = agent.color || '#8b949e';
  const state = agent.state || 'offline';
  const dot = card.querySelector('.sidebar-agent-dot');
  dot.style.background = agentColor;
  card.querySelector('.sidebar-agent-name').textContent = agent.name || role;
  card.querySelector('.sidebar-agent-name').style.color = agentColor;
  const statusEl = card.querySelector('.sidebar-agent-status');
  statusEl.textContent = STATE_LABELS[state] || state;
  statusEl.className = 'sidebar-agent-status status-' + state;
  card.querySelector('.sidebar-agent-task').textContent = agent.task || '';
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
    const cards = panel.querySelectorAll('.sidebar-agent-card');
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
  if (window.__av) window.__av.collectAllStacks();
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
  if (window.__av) window.__av.collectAllStacks();
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
  // Load game state for economy HUD (coins, streak, inventory)
  try {
    const gsRes = await fetch('/api/game-state');
    if (gsRes.ok) {
      const gameStateData = await gsRes.json();
      gameState = gameStateData;
      currentCoins = gameStateData.coins || 0;
      document.getElementById('hud-coins').textContent = formatNumber(currentCoins);
      updateHudStreak(gameStateData.stats?.streakDays || 0);
    }
  } catch { /* no game state */ }

  // Render world from /api/world (base world + placed inventory merged server-side)
  try {
    const wRes = await fetch('/api/world');
    if (wRes.ok) {
      const wd = await wRes.json();
      if (!wd.error) {
        await startLegacyWorld(wd);
        return;
      }
    }
  } catch { /* no world data */ }

  console.warn('No world data available — UI will show status panel only');
}

async function startLegacyWorld(prefetched) {
  let worldData;
  if (prefetched) {
    worldData = prefetched;
  } else try {
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

  // Set sidebar max-height to match the canvas display height (scale 2×)
  document.getElementById('game-layout').style.setProperty('--world-height', (gridRows * tileSize * 2) + 'px');

  // Use the worldId from the API response to construct the correct asset path.
  // When worldId is set (legacy repo/team path), use it. Otherwise root-level world.json.
  const basePath = worldData.worldId ? '/worlds/' + worldData.worldId : '/worlds';

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
      return props.loadSprite(id, basePath + '/' + clean).catch(() => {
        // Sprite not found — prop will render without an image
      });
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

  try {
    await mv.start();
  } catch (err) {
    console.error('Agentville engine failed to start:', err);
    container.innerHTML = '<div style="color:red;padding:20px;font-size:14px">Engine failed: ' + err.message + '</div>';
    return;
  }
  window.__av = mv;
  window.__worldData = worldData;
  window.__props = props;
  window.__tileSize = tileSize;
  window.__gridCols = gridCols;
  window.__gridRows = gridRows;
  mv.loadCoinSprite('/universal_assets/coin-spin.png').catch(() => {});
  resizeEffectsOverlay();

  // Coin stack fly-to target: HUD coins element position in canvas-space
  function updateCoinCollectTarget() {
    const hudCoinsEl = document.getElementById('hud-coins');
    if (hudCoinsEl && window.__av) {
      const hudRect = hudCoinsEl.getBoundingClientRect();
      const canvasRect = container.getBoundingClientRect();
      const scale = window.__av.getScale();
      window.__av.setCoinCollectTarget(
        (hudRect.left - canvasRect.left) / scale,
        (hudRect.top - canvasRect.top) / scale,
      );
    }
  }
  updateCoinCollectTarget();
  window.addEventListener('resize', updateCoinCollectTarget);

  // Auto-collect coin stacks when clicking the game canvas
  container.addEventListener('click', () => {
    if (document.body.classList.contains('edit-mode')) return;
    if (window.__av) window.__av.collectAllStacks();
  });

  // TODO(#55): add sparkle/pulse at HUD coin counter on collect
  // mv.onCoinCollect(() => { ... });

  mv.addLayer({ order: 5, render: (ctx) => props.renderBelow(ctx) });
  mv.addLayer({ order: 15, render: (ctx) => props.renderAbove(ctx) });

  // --- Wall clock live time overlay (order 16, above all props) ---
  {
    // Inline from lib/agentville/clock.ts — keep in sync
    function formatClockTime(timezone, now) {
      const date = now || new Date();
      return date.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: timezone,
      });
    }

    const worldTimezone = worldData.timezone;
    const clockProp = (worldData.props || []).find(p => p.catalogId === 'wall_clock_basic');

    if (clockProp && worldTimezone) {
      let cachedTime = '';
      let lastMinute = -1;

      mv.addLayer({
        order: 16,
        render(ctx) {
          const now = new Date();
          const minute = now.getMinutes();
          if (minute !== lastMinute) {
            cachedTime = formatClockTime(worldTimezone, now);
            lastMinute = minute;
          }
          ctx.save();
          ctx.font = '5px monospace';
          ctx.fillStyle = '#1a1a2e';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const cx = (clockProp.x + (clockProp.w || 1) / 2) * tileSize;
          const cy = (clockProp.y + (clockProp.h || 1) / 2) * tileSize;
          ctx.fillText(cachedTime, cx, cy);
          ctx.restore();
        },
      });
    }
  }

  mv.on('citizen:click', (data) => {
    tooltip.style.display = 'block';
    tooltip.querySelector('.name').textContent = data.name;
    tooltip.querySelector('.state').textContent = 'State: ' + data.state;
    tooltip.querySelector('.task').textContent = data.task ? 'Task: ' + data.task : 'No active task';
    setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
  });

  // Init dev layers if dev mode is active
  if (window.__devInitLayers) window.__devInitLayers();
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
            // Visual coin stack on agent desk
            if (window.__av && p.agentKey && earned > 0) {
              window.__av.earnCoinVisual(p.agentKey, earned);
            }
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

        case 'log:entry': {
          if (msg.entry) {
            appendLogEntry(msg.entry);
          }
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

// --- Dev Mode: Zone Overlay + Edit Mode ---
if (DEV_MODE) {
  document.getElementById('dev-toolbar').style.display = 'flex';

  const ZONE_COLORS = { work: '#4ade80', rest: '#818cf8', utility: '#22d3ee' };
  const ZONE_LABELS = { work: 'Office', rest: 'Lounge', utility: 'Kitchen' };
  let showZones = false;
  let showWalkable = false;
  let editMode = false;
  let selectedProp = null; // index into worldData.props
  let selectedWander = null; // index into worldData.wanderPoints
  let dragOffset = null; // { dx, dy }
  let isDragging = false;
  let worldDirty = false;

  const zonesBtn = document.getElementById('dev-zones-btn');
  const walkBtn = document.getElementById('dev-walk-btn');
  const editBtn = document.getElementById('dev-edit-btn');
  const saveBtn = document.getElementById('dev-save-btn');

  // --- Zone computation (reads from engine when available, falls back to prop scan) ---
  function computeZones() {
    const mv = window.__av;

    // Prefer engine-computed zones — they match the actual citizen movement logic
    if (mv && typeof mv.computeZones === 'function') {
      const engineZones = mv.computeZones();
      const result = [];
      if (engineZones.work) {
        const z = engineZones.work;
        result.push({
          type: 'work', x: z.minX, y: z.minY,
          w: z.maxX - z.minX, h: z.maxY - z.minY,
          label: ZONE_LABELS['work'] || 'Office',
          color: ZONE_COLORS['work'],
        });
      }
      if (engineZones.recreation) {
        // Split recreation into sub-zones by scanning props for rest vs utility
        const wd = window.__worldData;
        const hasRest = wd?.props?.some(p => p.anchors?.some(a => a.type === 'rest'));
        const hasUtility = wd?.props?.some(p => p.anchors?.some(a => a.type === 'utility'));
        const z = engineZones.recreation;
        if (hasRest) {
          result.push({
            type: 'rest', x: z.minX, y: z.minY,
            w: z.maxX - z.minX, h: z.maxY - z.minY,
            label: ZONE_LABELS['rest'] || 'Lounge',
            color: ZONE_COLORS['rest'],
          });
        }
        if (hasUtility) {
          // Show utility sub-zone from utility anchors only
          const utilProps = wd.props.filter(p => p.anchors?.some(a => a.type === 'utility'));
          if (utilProps.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of utilProps) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x + (p.w || 1));
              maxY = Math.max(maxY, p.y + (p.h || 1));
            }
            result.push({
              type: 'utility', x: Math.max(0, minX - 0.5), y: Math.max(0, minY - 0.5),
              w: maxX - minX + 1, h: maxY - minY + 1,
              label: ZONE_LABELS['utility'] || 'Kitchen',
              color: ZONE_COLORS['utility'],
            });
          }
        }
      }
      return result;
    }

    // Fallback: scan props directly (engine not yet initialized)
    const wd = window.__worldData;
    if (!wd || !wd.props) return [];
    const groups = {};
    for (const prop of wd.props) {
      if (!prop.anchors) continue;
      for (const a of prop.anchors) {
        if (!ZONE_COLORS[a.type]) continue;
        if (!groups[a.type]) groups[a.type] = [];
        groups[a.type].push({ x: prop.x, y: prop.y, w: prop.w || 1, h: prop.h || 1 });
      }
    }
    const zones = [];
    for (const [type, rects] of Object.entries(groups)) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const r of rects) {
        if (r.x < minX) minX = r.x;
        if (r.y < minY) minY = r.y;
        if (r.x + r.w > maxX) maxX = r.x + r.w;
        if (r.y + r.h > maxY) maxY = r.y + r.h;
      }
      const pad = 0.5;
      zones.push({
        type,
        x: Math.max(0, minX - pad),
        y: Math.max(0, minY - pad),
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
        label: ZONE_LABELS[type] || type,
        color: ZONE_COLORS[type],
      });
    }
    return zones;
  }

  // --- Zone overlay render layer ---
  function initDevLayers() {
    const mv = window.__av;
    const ts = window.__tileSize;
    if (!mv || !ts) return;

    // Zone overlay layer (order 17 — above clock)
    mv.addLayer({
      order: 17,
      render(ctx) {
        if (!showZones && !editMode) return;
        const zones = computeZones();
        for (const z of zones) {
          const x = z.x * ts;
          const y = z.y * ts;
          const w = z.w * ts;
          const h = z.h * ts;
          // Fill
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = z.color;
          ctx.fillRect(x, y, w, h);
          // Border
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = z.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x, y, w, h);
          // Label
          ctx.globalAlpha = 0.8;
          ctx.setLineDash([]);
          ctx.font = '5px sans-serif';
          ctx.fillStyle = z.color;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(z.label, x + 2, y + 1.5);
          ctx.restore();
        }

        // Wander points
        if (editMode) {
          const wd = window.__worldData;
          if (wd && wd.wanderPoints) {
            for (let i = 0; i < wd.wanderPoints.length; i++) {
              const wp = wd.wanderPoints[i];
              const wx = wp.x * ts;
              const wy = wp.y * ts;
              ctx.save();
              ctx.globalAlpha = selectedWander === i ? 0.9 : 0.5;
              ctx.fillStyle = '#888';
              // Diamond shape
              ctx.beginPath();
              ctx.moveTo(wx, wy - 3);
              ctx.lineTo(wx + 3, wy);
              ctx.lineTo(wx, wy + 3);
              ctx.lineTo(wx - 3, wy);
              ctx.closePath();
              ctx.fill();
              if (selectedWander === i) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 0.5;
                ctx.stroke();
              }
              // Label
              ctx.globalAlpha = 0.6;
              ctx.font = '3px sans-serif';
              ctx.fillStyle = '#ccc';
              ctx.textAlign = 'center';
              ctx.fillText(wp.name, wx, wy + 7);
              ctx.restore();
            }
          }
        }

        // Edit mode: prop outlines
        if (editMode) {
          const wd = window.__worldData;
          if (wd && wd.props) {
            for (let i = 0; i < wd.props.length; i++) {
              const p = wd.props[i];
              const px = p.x * ts;
              const py = p.y * ts;
              const pw = (p.w || 1) * ts;
              const ph = (p.h || 1) * ts;
              ctx.save();
              if (selectedProp === i) {
                ctx.strokeStyle = '#58a6ff';
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.9;
              } else {
                ctx.strokeStyle = '#c9d1d9';
                ctx.lineWidth = 0.5;
                ctx.globalAlpha = 0.3;
                ctx.setLineDash([3, 2]);
              }
              ctx.strokeRect(px, py, pw, ph);
              // Anchor dot
              if (selectedProp === i && p.anchors) {
                for (const a of p.anchors) {
                  const ax = (p.x + a.ox) * ts;
                  const ay = (p.y + a.oy) * ts;
                  ctx.globalAlpha = 0.9;
                  ctx.setLineDash([]);
                  ctx.beginPath();
                  ctx.arc(ax, ay, 2, 0, Math.PI * 2);
                  ctx.fillStyle = ZONE_COLORS[a.type] || '#fff';
                  ctx.fill();
                }
              }
              ctx.restore();
            }
          }
        }
      },
    });

    // Walkable overlay layer (order 18 — above zones)
    mv.addLayer({
      order: 18,
      render(ctx) {
        if (!showWalkable) return;
        const grid = mv.getWalkableGrid();
        if (!grid) return;
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
            ctx.fillStyle = grid[r][c]
              ? 'rgba(255, 255, 100, 0.3)'
              : 'rgba(255, 50, 50, 0.4)';
            ctx.fillRect(c * ts, r * ts, ts, ts);
            // Draw cell border for clarity
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(c * ts, r * ts, ts, ts);
          }
        }
        // Show citizen tile positions as cyan circles + state label
        for (const c of mv.getCitizens()) {
          if (!c.visible) continue;
          const tp = c.getTilePosition();
          ctx.strokeStyle = 'cyan';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(tp.x * ts + ts / 2, tp.y * ts + ts / 2, ts / 3, 0, Math.PI * 2);
          ctx.stroke();
          // State label
          ctx.font = '5px monospace';
          ctx.fillStyle = 'cyan';
          ctx.fillText(c.state, tp.x * ts + 2, tp.y * ts + ts - 2);
        }
      },
    });
  }

  // --- Mouse interaction for edit mode ---
  function canvasToWorld(e) {
    const ts = window.__tileSize;
    const scale = window.__av?.getScale() || 2;
    const rect = container.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / scale;
    const cy = (e.clientY - rect.top) / scale;
    return { wx: cx / ts, wy: cy / ts };
  }

  function snap(v) {
    return Math.round(v * 4) / 4; // 0.25 grid snap
  }

  container.addEventListener('mousedown', (e) => {
    if (!editMode) return;
    const { wx, wy } = canvasToWorld(e);
    const wd = window.__worldData;
    if (!wd) return;

    // Check wander points first (small hit area)
    if (wd.wanderPoints) {
      for (let i = 0; i < wd.wanderPoints.length; i++) {
        const wp = wd.wanderPoints[i];
        if (Math.abs(wx - wp.x) < 0.5 && Math.abs(wy - wp.y) < 0.5) {
          selectedWander = i;
          selectedProp = null;
          dragOffset = { dx: wp.x - wx, dy: wp.y - wy };
          isDragging = true;
          container.classList.add('dragging');
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }

    // Check props (reverse order so topmost is picked first)
    // Only base-world props are draggable — inventory items (desks/chairs)
    // are managed via shop placement to keep game state in sync.
    if (wd.props) {
      for (let i = wd.props.length - 1; i >= 0; i--) {
        const p = wd.props[i];
        if (p.fromInventory) continue;
        const pw = p.w || 1;
        const ph = p.h || 1;
        if (wx >= p.x && wx <= p.x + pw && wy >= p.y && wy <= p.y + ph) {
          selectedProp = i;
          selectedWander = null;
          dragOffset = { dx: p.x - wx, dy: p.y - wy };
          isDragging = true;
          container.classList.add('dragging');
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }

    // Clicked empty space — deselect
    selectedProp = null;
    selectedWander = null;
  });

  container.addEventListener('mousemove', (e) => {
    if (!editMode || !isDragging) return;
    const { wx, wy } = canvasToWorld(e);
    const wd = window.__worldData;
    if (!wd) return;

    const cols = window.__gridCols || 20;
    const rows = window.__gridRows || 11;

    if (selectedWander !== null && wd.wanderPoints) {
      wd.wanderPoints[selectedWander].x = Math.max(0, Math.min(cols - 1, snap(wx + dragOffset.dx)));
      wd.wanderPoints[selectedWander].y = Math.max(0, Math.min(rows - 1, snap(wy + dragOffset.dy)));
      worldDirty = true;
    } else if (selectedProp !== null && wd.props) {
      const pw = wd.props[selectedProp].w || 1;
      const ph = wd.props[selectedProp].h || 1;
      wd.props[selectedProp].x = Math.max(0, Math.min(cols - pw, snap(wx + dragOffset.dx)));
      wd.props[selectedProp].y = Math.max(0, Math.min(rows - ph, snap(wy + dragOffset.dy)));
      worldDirty = true;
      // Update prop system layout live
      const props = window.__props;
      if (props) {
        props.setLayout(wd.props);
        if (wd.wanderPoints) props.setWanderPoints(wd.wanderPoints);
      }
    }
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    container.classList.remove('dragging');
    // Update prop system after wander point drag too
    if (selectedWander !== null) {
      const props = window.__props;
      const wd = window.__worldData;
      if (props && wd && wd.wanderPoints) props.setWanderPoints(wd.wanderPoints);
    }
    if (worldDirty) {
      saveBtn.style.display = '';
    }
  });

  // --- Toggle handlers ---
  zonesBtn.addEventListener('click', () => {
    showZones = !showZones;
    zonesBtn.classList.toggle('active', showZones);
  });

  walkBtn.addEventListener('click', () => {
    showWalkable = !showWalkable;
    walkBtn.classList.toggle('active', showWalkable);
  });

  editBtn.addEventListener('click', () => {
    editMode = !editMode;
    editBtn.classList.toggle('active', editMode);
    document.body.classList.toggle('edit-mode', editMode);
    if (editMode) {
      showZones = true;
      zonesBtn.classList.add('active');
    }
    selectedProp = null;
    selectedWander = null;
  });

  // --- Save handler ---
  saveBtn.addEventListener('click', async () => {
    const wd = window.__worldData;
    if (!wd) return;
    const baseProps = (wd.props || []).filter(p => !p.fromInventory);
    const payload = {
      props: baseProps,
      wanderPoints: wd.wanderPoints || [],
    };
    try {
      const res = await fetch('/api/world/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        worldDirty = false;
        saveBtn.style.display = 'none';
        showToast('World saved', 'success');
      } else {
        showToast('Save failed: ' + (await res.text()), 'error');
      }
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    }
  });

  // --- Keyboard shortcuts ---
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'z' || e.key === 'Z') {
      zonesBtn.click();
    } else if (e.key === 'w' || e.key === 'W') {
      walkBtn.click();
    } else if (e.key === 'e' || e.key === 'E') {
      editBtn.click();
    } else if (e.key === 'Escape' && editMode) {
      if (isDragging) {
        isDragging = false;
        container.classList.remove('dragging');
      } else {
        editBtn.click(); // exit edit mode
      }
    }
  });

  // Init dev layers after world loads
  window.__devInitLayers = initDevLayers;
}

startWorld().catch(err => {
  console.error('startWorld failed:', err);
  document.getElementById('canvas-container').innerHTML = '<div style="color:red;padding:20px;font-size:14px">World load failed: ' + err.message + '</div>';
});
connect();
<\/script>
</body>
</html>`;
}
