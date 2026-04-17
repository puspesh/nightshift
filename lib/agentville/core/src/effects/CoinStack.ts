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

const VISUAL_CAP = 5;
const AUTO_COLLECT_DELAY = 60; // seconds
const COLLECT_ANIMATION_DURATION = 0.5; // seconds
const STACK_HIT_WIDTH = 20;
const STACK_HIT_HEIGHT = 24;
const COIN_RADIUS = 5;
const COIN_STACK_OFFSET = 3; // vertical offset between stacked coins

export class CoinStackSystem implements RenderLayer {
  readonly order = 18;

  private stacks: Map<string, CoinStackEntry> = new Map();
  private collectCallback: ((info: CoinStackInfo) => void) | null = null;
  private targetX = 0;
  private targetY = 0;

  /** Register callback fired when a stack finishes collecting */
  onCollect(callback: (info: CoinStackInfo) => void): void {
    this.collectCallback = callback;
  }

  /** Set the canvas-space position coins fly toward during collect animation */
  setCoinCollectTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
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
  }

  /** Render coin stacks on the canvas. Calls update() internally (ParticleSystem pattern). */
  render(ctx: CanvasRenderingContext2D, delta: number): void {
    this.update(delta);

    for (const [, stack] of this.stacks) {
      if (stack.collecting) {
        // Fly-to animation: lerp from stack position toward target
        const t = stack.collectProgress;
        const eased = 1 - (1 - t) * (1 - t); // ease-out quad
        const drawX = stack.x + (this.targetX - stack.x) * eased;
        const drawY = stack.y + (this.targetY - stack.y) * eased;
        const alpha = 1 - t;
        this.drawCoinStack(ctx, drawX, drawY, stack.visualCount, alpha);
      } else {
        this.drawCoinStack(ctx, stack.x, stack.y, stack.visualCount, 1);
      }
    }
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
