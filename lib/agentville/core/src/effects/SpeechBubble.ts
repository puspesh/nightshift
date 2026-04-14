import type { RenderLayer } from '../renderer/Renderer';

interface BubbleTarget {
  x: number;
  y: number;
  getSittingOffset(): number;
}

interface Bubble {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  target?: BubbleTarget;
  offsetX: number;
  offsetY: number;
}

export class SpeechBubbleSystem implements RenderLayer {
  readonly order = 25;
  private bubbles: Bubble[] = [];

  show(x: number, y: number, text: string, duration = 3, target?: BubbleTarget) {
    // Remove existing bubble for same target or position
    if (target) {
      this.bubbles = this.bubbles.filter(b => b.target !== target);
    } else {
      this.bubbles = this.bubbles.filter(b => !(Math.abs(b.x - x) < 1 && Math.abs(b.y - y) < 1));
    }
    const offsetX = target ? x - target.x : 0;
    const offsetY = target ? y - target.y : 0;
    this.bubbles.push({ x, y, text, life: duration, maxLife: duration, target, offsetX, offsetY });
  }

  clear() {
    this.bubbles = [];
  }

  render(ctx: CanvasRenderingContext2D, delta: number) {
    for (const b of this.bubbles) {
      b.life -= delta;
    }
    this.bubbles = this.bubbles.filter(b => b.life > 0);

    for (const b of this.bubbles) {
      // Track target position
      if (b.target) {
        b.x = b.target.x + b.offsetX;
        b.y = b.target.y + b.offsetY - b.target.getSittingOffset();
      }

      const alpha = Math.min(1, b.life / 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.font = '9px monospace';
      const metrics = ctx.measureText(b.text);
      const textWidth = Math.min(metrics.width, 120);
      const padding = 6;
      const bw = textWidth + padding * 2;
      const bh = 18;
      const bx = b.x - bw / 2;
      const by = b.y - bh - 8;

      // Bubble background
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.stroke();

      // Tail
      ctx.beginPath();
      ctx.moveTo(b.x - 4, by + bh);
      ctx.lineTo(b.x, by + bh + 6);
      ctx.lineTo(b.x + 4, by + bh);
      ctx.fill();

      // Text
      ctx.fillStyle = '#333333';
      ctx.fillText(b.text.substring(0, 20), bx + padding, by + bh - 5);

      ctx.restore();
    }
  }
}
