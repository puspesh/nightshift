# Coin Spritesheet Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace primitive canvas coin drawings with a spritesheet-based spinning coin — used in HUD icon, fountain-scatter on earn, pile idle animation, and fly-to-HUD collect.

**Architecture:** Convert the 3x3 webp spritesheet (640x640, 9 frames) to a transparent PNG. Load it as an `Image()` in `CoinStackSystem`. Replace `drawCoinStack` arc drawing with sprite frames. Add a `CoinParticle` array for fountain-scatter physics (pop up, arc, bounce, settle). Frontend HUD swaps emoji for `<img>` of first frame, served as data-URI from the inline HTML.

**Tech Stack:** Canvas 2D (`drawImage` for sprites), `sips` for webp→png conversion, Node test runner + Playwright.

---

### Task 1: Convert spritesheet and extract icon

**Files:**
- Create: `worlds/agentville/universal_assets/coin-spin.png`
- Create: `worlds/agentville/universal_assets/coin-icon.png`

**Step 1: Convert webp to PNG**

```bash
sips -s format png /Users/puspesh/Downloads/pngtree-golden-coin-spinning-animation-sprite-sheet-for-2d-games-vector-png-image_18904471.webp \
  --out worlds/agentville/universal_assets/coin-spin.png
```

**Step 2: Extract first frame as icon (top-left cell, ~213x213 → scale to 32x32)**

The spritesheet is 640x640, 3x3 grid, so each frame is ~213x213. Extract the front-facing coin (row 1, col 1 = center cell, the most circular view) and scale to 32x32 for HUD:

```bash
sips -c 213 213 --cropOffset 213 213 worlds/agentville/universal_assets/coin-spin.png \
  --out /tmp/coin-frame-center.png
sips -z 32 32 /tmp/coin-frame-center.png --out worlds/agentville/universal_assets/coin-icon.png
```

Verify visually with `Read` tool.

**Step 3: Commit**

```bash
git add worlds/agentville/universal_assets/coin-spin.png worlds/agentville/universal_assets/coin-icon.png
git commit -m "feat(issue-55): add coin spritesheet and icon assets"
```

---

### Task 2: Load spritesheet in CoinStackSystem

**Files:**
- Modify: `lib/agentville/core/src/effects/CoinStack.ts`
- Test: `tests/agentville-coin-stack.test.ts`

**Step 1: Write failing test — spritesheet loading**

Add to `tests/agentville-coin-stack.test.ts`:

```typescript
describe('sprite loading', () => {
  it('reports not loaded before loadSprite is called', () => {
    assert.equal(system.isSpriteLoaded(), false);
  });

  it('falls back to canvas primitives when sprite not loaded', () => {
    // addStack + update should not throw without sprite
    system.addStack('agent-1', 100, 200, 3);
    system.update(0.016);
    assert.equal(system.getStacks().size, 1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test 2>&1 | grep -A2 "sprite loading"
```
Expected: FAIL — `isSpriteLoaded` not a function.

**Step 3: Add sprite loading to CoinStackSystem**

In `CoinStack.ts`, add:

```typescript
// After existing constants
const SPRITE_COLS = 3;
const SPRITE_ROWS = 3;
const SPRITE_FRAMES = 9;
const SPIN_SPEED = 12; // frames per second

// In the class, add fields:
private spriteImg: HTMLImageElement | null = null;
private spriteFrameW = 0;
private spriteFrameH = 0;

/** Load the coin spritesheet. Rendering falls back to primitives if not loaded. */
loadSprite(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      this.spriteImg = img;
      this.spriteFrameW = img.width / SPRITE_COLS;
      this.spriteFrameH = img.height / SPRITE_ROWS;
      resolve();
    };
    img.onerror = () => resolve(); // graceful fallback
    img.src = src;
  });
}

isSpriteLoaded(): boolean {
  return this.spriteImg !== null;
}
```

**Step 4: Run tests — all should pass**

```bash
npm test 2>&1 | grep "CoinStackSystem"
```

**Step 5: Commit**

```bash
git add lib/agentville/core/src/effects/CoinStack.ts tests/agentville-coin-stack.test.ts
git commit -m "feat(issue-55): add spritesheet loading to CoinStackSystem"
```

---

### Task 3: Replace primitive coin drawing with sprite frames

**Files:**
- Modify: `lib/agentville/core/src/effects/CoinStack.ts`

**Step 1: Add sprite frame drawing method**

Replace `drawCoinStack` with a method that uses the spritesheet when loaded, falls back to arcs otherwise. Each coin in the pile gets a different animation phase so they don't all spin in sync.

```typescript
/** Draw a single coin sprite frame */
private drawCoinSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
  size: number,
  alpha: number,
): void {
  if (!this.spriteImg) return;
  const col = frame % SPRITE_COLS;
  const row = Math.floor(frame / SPRITE_COLS);
  const sx = col * this.spriteFrameW;
  const sy = row * this.spriteFrameH;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(
    this.spriteImg,
    sx, sy, this.spriteFrameW, this.spriteFrameH,
    x - size / 2, y - size / 2, size, size,
  );
  ctx.restore();
}
```

**Step 2: Update render method to use sprites**

Add an `elapsed` field to the class (initialized to 0), increment in `update(delta)`:
```typescript
this.elapsed += delta;
```

In `render()`, replace `drawCoinStack` calls with:
- For idle stacks: draw each coin in pile with slow spin (phase offset per coin index)
- For collecting: draw spinning coin flying to target

```typescript
// In render(), replace the drawing section:
for (const [, stack] of this.stacks) {
  if (stack.collecting) {
    const t = stack.collectProgress;
    const eased = 1 - (1 - t) * (1 - t);
    const drawX = stack.x + (this.targetX - stack.x) * eased;
    const drawY = stack.y + (this.targetY - stack.y) * eased;
    const alpha = 1 - t;
    const frame = Math.floor(this.elapsed * SPIN_SPEED * 3) % SPRITE_FRAMES; // fast spin
    if (this.spriteImg) {
      this.drawCoinSprite(ctx, drawX, drawY, frame, COIN_SIZE, alpha);
    } else {
      this.drawCoinStack(ctx, drawX, drawY, 1, alpha);
    }
  } else {
    // Idle pile: each coin has offset phase for visual variety
    for (let i = 0; i < stack.visualCount; i++) {
      const coinY = stack.y - i * COIN_STACK_OFFSET;
      const phase = (this.elapsed * SPIN_SPEED + i * 2) % SPRITE_FRAMES;
      const frame = Math.floor(phase) % SPRITE_FRAMES;
      if (this.spriteImg) {
        this.drawCoinSprite(ctx, stack.x, coinY, frame, COIN_SIZE, 1);
      } else {
        this.drawCoinStack(ctx, stack.x, stack.y, stack.visualCount, 1);
        break; // old method draws all at once
      }
    }
  }
}
```

Where `COIN_SIZE = 12` (constant — size of each coin sprite on canvas in pixels).

**Step 3: Run tests**

```bash
npm test 2>&1 | grep "CoinStackSystem"
```

**Step 4: Commit**

```bash
git add lib/agentville/core/src/effects/CoinStack.ts
git commit -m "feat(issue-55): render coin piles with spritesheet frames"
```

---

### Task 4: Add fountain-scatter particle system

**Files:**
- Modify: `lib/agentville/core/src/effects/CoinStack.ts`
- Test: `tests/agentville-coin-stack.test.ts`

**Step 1: Write failing test — fountain particles**

```typescript
describe('fountain scatter', () => {
  it('creates particles when spawnFountain is called', () => {
    system.spawnFountain(100, 200, 5);
    const particles = system._getParticles();
    assert.equal(particles.length, 5);
  });

  it('particles settle after physics completes', () => {
    system.spawnFountain(100, 200, 3);
    // Advance time well past settling (2+ seconds)
    for (let i = 0; i < 60; i++) system.update(0.05);
    const particles = system._getParticles();
    // All should be settled (vy ≈ 0, on ground)
    for (const p of particles) {
      assert.ok(p.settled, 'particle should be settled');
    }
  });

  it('settled particles are removed after auto-collect delay', () => {
    system.spawnFountain(100, 200, 3);
    // Settle them
    for (let i = 0; i < 60; i++) system.update(0.05);
    // Advance past auto-collect (60s)
    system.update(61);
    // Advance past collect animation
    system.update(1);
    const particles = system._getParticles();
    assert.equal(particles.length, 0);
  });
});
```

**Step 2: Run to verify it fails**

```bash
npm test 2>&1 | grep -A2 "fountain scatter"
```

**Step 3: Implement fountain particles**

Add to `CoinStack.ts`:

```typescript
interface CoinParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  groundY: number;     // y position to settle at
  settled: boolean;
  settleX: number;     // final x position when settled
  phase: number;       // animation phase offset (for desynchronized spin)
  bounces: number;
}

// In the class:
private particles: CoinParticle[] = [];

/** Spawn a fountain of coins that pop up and settle near (x, y) */
spawnFountain(x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 40,  // horizontal scatter
      vy: -(50 + Math.random() * 30),   // upward pop
      groundY: y + (Math.random() - 0.5) * 8,
      settled: false,
      settleX: x + (Math.random() - 0.5) * 20,
      phase: Math.random() * SPRITE_FRAMES,
      bounces: 0,
    });
  }
}

_getParticles(): CoinParticle[] {
  return this.particles;
}
```

In `update(delta)`, add particle physics:

```typescript
// Update fountain particles
for (const p of this.particles) {
  if (p.settled) continue;
  p.vy += 120 * delta; // gravity
  p.x += p.vx * delta;
  p.y += p.vy * delta;
  // Bounce off ground
  if (p.y >= p.groundY) {
    p.y = p.groundY;
    if (p.bounces < 1 && Math.abs(p.vy) > 10) {
      p.vy = -p.vy * 0.3; // soft bounce
      p.vx *= 0.5;
      p.bounces++;
    } else {
      p.settled = true;
      p.x = p.settleX;
      p.y = p.groundY;
      p.vx = 0;
      p.vy = 0;
    }
  }
}
```

In `render()`, draw particles:

```typescript
// Draw fountain particles
for (const p of this.particles) {
  const frame = Math.floor((this.elapsed * SPIN_SPEED + p.phase) % SPRITE_FRAMES);
  if (this.spriteImg) {
    this.drawCoinSprite(ctx, p.x, p.y, frame, COIN_SIZE, 1);
  } else {
    // Fallback: small gold circle
    ctx.beginPath();
    ctx.arc(p.x, p.y, COIN_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#f5c842';
    ctx.fill();
  }
}
```

**Step 4: Run tests**

```bash
npm test 2>&1 | grep "CoinStackSystem"
```

**Step 5: Commit**

```bash
git add lib/agentville/core/src/effects/CoinStack.ts tests/agentville-coin-stack.test.ts
git commit -m "feat(issue-55): add fountain-scatter coin particles with physics"
```

---

### Task 5: Wire fountain to earnCoinVisual and add settled→pile transition

**Files:**
- Modify: `lib/agentville/core/src/effects/CoinStack.ts`
- Modify: `lib/agentville/core/src/index.ts:501-507`
- Test: `tests/agentville-coin-stack.test.ts`

**Step 1: Write failing test — settled particles convert to stack**

```typescript
it('settled particles merge into agent stack', () => {
  system.spawnFountain(100, 200, 3, 'agent-1');
  // Settle them
  for (let i = 0; i < 60; i++) system.update(0.05);
  // All settled particles should become a stack entry
  const stacks = system.getStacks();
  assert.equal(stacks.has('agent-1'), true);
  assert.equal(stacks.get('agent-1')!.totalCount, 3);
  // Particles should be cleared
  assert.equal(system._getParticles().length, 0);
});
```

**Step 2: Run to verify it fails**

**Step 3: Implement**

Update `spawnFountain` signature to accept `agentId`:
```typescript
spawnFountain(x: number, y: number, count: number, agentId?: string): void {
  // ... same as before but add agentId to each particle
}
```

Add `agentId?: string` to `CoinParticle` interface.

In `update()`, after particle physics, check if all particles for an agent are settled:
```typescript
// Check if all particles for an agent are settled → merge into stack
const agentParticles = new Map<string, CoinParticle[]>();
for (const p of this.particles) {
  if (p.agentId && p.settled) {
    const arr = agentParticles.get(p.agentId) || [];
    arr.push(p);
    agentParticles.set(p.agentId, arr);
  }
}
for (const [agentId, settled] of agentParticles) {
  const allForAgent = this.particles.filter(p => p.agentId === agentId);
  if (settled.length === allForAgent.length) {
    // All settled — merge into stack
    const avgX = settled.reduce((s, p) => s + p.x, 0) / settled.length;
    const avgY = settled.reduce((s, p) => s + p.y, 0) / settled.length;
    this.addStack(agentId, avgX, avgY, settled.length);
    this.particles = this.particles.filter(p => p.agentId !== agentId);
  }
}
```

**Step 4: Update `earnCoinVisual` in `index.ts`**

Change from `addStack` to `spawnFountain`:

```typescript
earnCoinVisual(agentId: string, amount: number): void {
  const citizen = this.citizens.find(r => r.agentId === agentId);
  if (!citizen) return;
  const offsetX = this.scene.config.tileWidth;
  const coinCount = Math.min(Math.ceil(amount / 20), 8); // 1-8 coins based on amount
  this.coinStacks.spawnFountain(citizen.x + offsetX, citizen.y, coinCount, agentId);
}
```

**Step 5: Run tests**

```bash
npm test 2>&1 | grep "CoinStackSystem"
```

**Step 6: Commit**

```bash
git add lib/agentville/core/src/effects/CoinStack.ts lib/agentville/core/src/index.ts tests/agentville-coin-stack.test.ts
git commit -m "feat(issue-55): wire fountain scatter to earnCoinVisual with pile transition"
```

---

### Task 6: Load spritesheet in frontend and update HUD icon

**Files:**
- Modify: `lib/agentville/server/frontend.ts:528` (HUD icon HTML)
- Modify: `lib/agentville/server/frontend.ts:1430` (after engine init, load sprite)

**Step 1: Replace HUD emoji with coin-icon.png**

In `frontend.ts` line 528, change:
```html
<span class="hud-icon">&#x1FA99;</span>
```
to:
```html
<span class="hud-icon"><img src="/universal_assets/coin-icon.png" width="16" height="16" style="vertical-align: middle; image-rendering: pixelated;" alt="coins"></span>
```

**Step 2: Load spritesheet after engine init**

After line 1431 (`window.__av = mv;`), add:
```javascript
mv.loadCoinSprite('/universal_assets/coin-spin.png');
```

**Step 3: Expose `loadCoinSprite` on Agentville class**

In `lib/agentville/core/src/index.ts`, add:
```typescript
/** Load the coin spritesheet for animated coin stacks */
loadCoinSprite(src: string): Promise<void> {
  return this.coinStacks.loadSprite(src);
}
```

**Step 4: Build and run e2e tests**

```bash
npm run build && npx playwright test tests/e2e/game-world.spec.ts
```

**Step 5: Commit**

```bash
git add lib/agentville/server/frontend.ts lib/agentville/core/src/index.ts
git commit -m "feat(issue-55): HUD coin icon from spritesheet, load sprite in engine"
```

---

### Task 7: Build, visual verification, and e2e test run

**Step 1: Build**
```bash
npm run build
```

**Step 2: Run unit tests**
```bash
npm test 2>&1 | grep "CoinStackSystem"
```
Expected: All pass.

**Step 3: Run e2e tests with screenshots**
```bash
mkdir -p /tmp/ns-screenshots-55-sprites
npx playwright test tests/e2e/game-world.spec.ts --output /tmp/ns-screenshots-55-sprites/
```

**Step 4: Visually verify screenshots**

Read key screenshots with `Read` tool. Check:
- HUD shows coin-icon.png instead of emoji
- Coin piles near agents use sprite frames (not plain circles)
- Activity sidebar still shows coin drop entries

**Step 5: Commit screenshots and push**

```bash
SCREENSHOT_DIR="screenshots/issue-55"
# Copy new screenshots over old ones
cp /tmp/ns-screenshots-55-sprites/game-world-game-world-loads-and-shows-agent-with-coins-chromium/test-finished-1.png "$SCREENSHOT_DIR/coin-spritesheet-hud.png"
git add "$SCREENSHOT_DIR"
git commit -m "test(issue-55): update screenshots with spritesheet coins"
git push origin issue-55-coin-pileup
```
