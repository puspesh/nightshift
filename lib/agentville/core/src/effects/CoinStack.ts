import type { RenderLayer } from '../renderer/Renderer.js';

export interface CoinStackInfo {
  agentId: string;
  x: number;
  y: number;
  totalCount: number;
}

export interface CoinStackEntry {
  x: number;
  y: number;
  visualCount: number;
  totalCount: number;
  timer: number;
  collecting: boolean;
  collectProgress: number;
}

export interface CoinParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  groundY: number;
  settled: boolean;
  settleX: number;
  phase: number;
  bounces: number;
  agentId?: string;
}

const VISUAL_CAP = 5;
const AUTO_COLLECT_DELAY = 60; // seconds
const COLLECT_ANIMATION_DURATION = 0.5; // seconds
const STACK_HIT_WIDTH = 20;
const STACK_HIT_HEIGHT = 24;
const COIN_RADIUS = 5;
const COIN_STACK_OFFSET = 3; // vertical offset between stacked coins

const SPRITE_COLS = 3;
const SPRITE_ROWS = 3;
const SPRITE_FRAMES = 9;
const SPIN_SPEED = 12; // frames per second
const COIN_SIZE = 12; // rendered size of each coin sprite in pixels

export class CoinStackSystem implements RenderLayer {
  readonly order = 18;

  private stacks: Map<string, CoinStackEntry> = new Map();
  private collectCallback: ((info: CoinStackInfo) => void) | null = null;
  private targetX = 0;
  private targetY = 0;
  private spriteImg: HTMLImageElement | null = null;
  private spriteFrameW = 0;
  private spriteFrameH = 0;
  private elapsed = 0;
  private particles: CoinParticle[] = [];

  /** Register callback fired when a stack finishes collecting */
  onCollect(callback: (info: CoinStackInfo) => void): void {
    this.collectCallback = callback;
  }

  /** Set the canvas-space position coins fly toward during collect animation */
  setCoinCollectTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  /** Load the coin spritesheet image */
  loadSprite(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.spriteImg = img;
        this.spriteFrameW = img.width / SPRITE_COLS;
        this.spriteFrameH = img.height / SPRITE_ROWS;
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load coin sprite: ${src}`));
      img.src = src;
    });
  }

  /** Check if the spritesheet has been loaded */
  isSpriteLoaded(): boolean {
    return this.spriteImg !== null;
  }

  /** Spawn a fountain of coin particles that scatter and settle */
  spawnFountain(x: number, y: number, count: number, agentId?: string): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 60 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        groundY: y,
        settled: false,
        settleX: x + (Math.random() - 0.5) * 20,
        phase: Math.random() * SPRITE_FRAMES,
        bounces: 0,
        agentId,
      });
    }
  }

  /** Get current particles (for testing) */
  _getParticles(): CoinParticle[] {
    return this.particles;
  }

  /** Add coins to an agent's stack (or create a new one) */
  addStack(agentId: string, x: number, y: number, amount: number): void {
    const existing = this.stacks.get(agentId);
    if (existing) {
      existing.totalCount += amount;
      existing.visualCount = Math.min(existing.totalCount, VISUAL_CAP);
      existing.timer = 0; // reset auto-collect timer
    } else {
      this.stacks.set(agentId, {
        x,
        y,
        visualCount: Math.min(amount, VISUAL_CAP),
        totalCount: amount,
        timer: 0,
        collecting: false,
        collectProgress: 0,
      });
    }
  }

  /** Begin collecting a specific agent's stack. Returns info for animation, or null. */
  collectStack(agentId: string): CoinStackInfo | null {
    const stack = this.stacks.get(agentId);
    if (!stack || stack.collecting) return null;

    stack.collecting = true;
    stack.collectProgress = 0;

    return {
      agentId,
      x: stack.x,
      y: stack.y,
      totalCount: stack.totalCount,
    };
  }

  /** Collect all stacks at once. Returns info for each. */
  collectAll(): CoinStackInfo[] {
    const results: CoinStackInfo[] = [];
    for (const [agentId, stack] of this.stacks) {
      if (stack.collecting) continue;
      stack.collecting = true;
      stack.collectProgress = 0;
      results.push({
        agentId,
        x: stack.x,
        y: stack.y,
        totalCount: stack.totalCount,
      });
    }
    return results;
  }

  /** Hit-test: returns agentId if (worldX, worldY) is within a stack's bounds, else null */
  containsPoint(worldX: number, worldY: number): string | null {
    for (const [agentId, stack] of this.stacks) {
      if (stack.collecting) continue;
      const halfW = STACK_HIT_WIDTH / 2;
      const halfH = STACK_HIT_HEIGHT / 2;
      if (
        worldX >= stack.x - halfW && worldX <= stack.x + halfW &&
        worldY >= stack.y - halfH && worldY <= stack.y + halfH
      ) {
        return agentId;
      }
    }
    return null;
  }

  /** Get current stacks (for testing / debug) */
  getStacks(): Map<string, CoinStackEntry> {
    return this.stacks;
  }

  /** Advance timers, trigger auto-collect, animate collecting stacks */
  update(delta: number): void {
    this.elapsed += delta;

    const toRemove: string[] = [];

    for (const [agentId, stack] of this.stacks) {
      if (stack.collecting) {
        // Advance collect animation
        stack.collectProgress += delta / COLLECT_ANIMATION_DURATION;
        if (stack.collectProgress >= 1) {
          // Animation complete — fire callback and mark for removal
          this.collectCallback?.({
            agentId,
            x: stack.x,
            y: stack.y,
            totalCount: stack.totalCount,
          });
          toRemove.push(agentId);
        }
      } else {
        // Advance auto-collect timer
        stack.timer += delta;
        if (stack.timer >= AUTO_COLLECT_DELAY) {
          // Start collecting animation — the collecting branch above
          // handles the callback + removal when collectProgress >= 1
          stack.collecting = true;
          stack.collectProgress = 0;
        }
      }
    }

    for (const id of toRemove) {
      this.stacks.delete(id);
    }

    // Particle physics
    for (const p of this.particles) {
      if (p.settled) continue;
      p.vy += 120 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;

      if (p.y >= p.groundY) {
        if (p.bounces < 1) {
          p.vy = -p.vy * 0.3;
          p.y = p.groundY;
          p.bounces++;
        } else {
          // Settle
          p.settled = true;
          p.x = p.settleX;
          p.y = p.groundY;
          p.vx = 0;
          p.vy = 0;
        }
      }
    }

    // Merge settled particles with agentId into stacks
    const agentIds = new Set<string>();
    for (const p of this.particles) {
      if (p.agentId) agentIds.add(p.agentId);
    }

    for (const aid of agentIds) {
      const agentParticles = this.particles.filter(p => p.agentId === aid);
      const allSettled = agentParticles.every(p => p.settled);
      if (allSettled && agentParticles.length > 0) {
        let sumX = 0, sumY = 0;
        for (const p of agentParticles) {
          sumX += p.x;
          sumY += p.y;
        }
        const avgX = sumX / agentParticles.length;
        const avgY = sumY / agentParticles.length;
        this.addStack(aid, avgX, avgY, agentParticles.length);
        this.particles = this.particles.filter(p => p.agentId !== aid);
      }
    }
  }

  /** Render coin stacks on the canvas. Calls update() internally (ParticleSystem pattern). */
  render(ctx: CanvasRenderingContext2D, delta: number): void {
    this.update(delta);

    // Render particles
    for (const p of this.particles) {
      if (this.spriteImg) {
        const frame = Math.floor(p.phase + this.elapsed * SPIN_SPEED) % SPRITE_FRAMES;
        this.drawCoinSprite(ctx, p.x, p.y, frame, 1);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, COIN_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#f5c842';
        ctx.fill();
      }
    }

    for (const [, stack] of this.stacks) {
      if (stack.collecting) {
        // Fly-to animation: lerp from stack position toward target
        const t = stack.collectProgress;
        const eased = 1 - (1 - t) * (1 - t); // ease-out quad
        const drawX = stack.x + (this.targetX - stack.x) * eased;
        const drawY = stack.y + (this.targetY - stack.y) * eased;
        const alpha = 1 - t;
        if (this.spriteImg) {
          // Fast spin during collect
          const frame = Math.floor(this.elapsed * SPIN_SPEED * 2) % SPRITE_FRAMES;
          this.drawCoinSprite(ctx, drawX, drawY, frame, alpha);
        } else {
          this.drawCoinStack(ctx, drawX, drawY, stack.visualCount, alpha);
        }
      } else {
        if (this.spriteImg) {
          // Idle stacks: draw each coin with slow spin, phase offset per coin
          for (let i = 0; i < stack.visualCount; i++) {
            const coinY = stack.y - i * COIN_STACK_OFFSET;
            const frame = Math.floor(this.elapsed * SPIN_SPEED + i * 2) % SPRITE_FRAMES;
            this.drawCoinSprite(ctx, stack.x, coinY, frame, 1);
          }
        } else {
          this.drawCoinStack(ctx, stack.x, stack.y, stack.visualCount, 1);
        }
      }
    }
  }

  /** Draw a single frame from the coin spritesheet */
  private drawCoinSprite(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    frame: number,
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
      x - COIN_SIZE / 2, y - COIN_SIZE / 2, COIN_SIZE, COIN_SIZE,
    );
    ctx.restore();
  }

  /** Draw a stack of gold coins (pixel-art style circles) */
  private drawCoinStack(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    count: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    for (let i = 0; i < count; i++) {
      const coinY = y - i * COIN_STACK_OFFSET;

      // Gold coin body
      ctx.beginPath();
      ctx.arc(x, coinY, COIN_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#f5c842';
      ctx.fill();
      ctx.strokeStyle = '#c49b1a';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Highlight arc (top-left)
      ctx.beginPath();
      ctx.arc(x - 1, coinY - 1, COIN_RADIUS * 0.5, Math.PI, Math.PI * 1.5);
      ctx.strokeStyle = '#ffe680';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    ctx.restore();
  }
}
