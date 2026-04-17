export interface ObjectConfig {
  id: string;
  type: 'intercom' | 'whiteboard' | 'monitor' | 'coffee_machine' | 'generic';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export class InteractiveObject {
  readonly config: ObjectConfig;
  private active = false;
  private shakeTimer = 0;
  private glowing = false;
  private displayText = '';

  constructor(config: ObjectConfig) {
    this.config = config;
  }

  activate() {
    this.active = true;
    this.shakeTimer = 1;
  }

  deactivate() {
    this.active = false;
    this.shakeTimer = 0;
  }

  setGlow(on: boolean) {
    this.glowing = on;
  }

  setText(text: string) {
    this.displayText = text;
  }

  isActive(): boolean {
    return this.active;
  }

  containsPoint(px: number, py: number): boolean {
    const { x, y, width, height } = this.config;
    return px >= x && px <= x + width && py >= y && py <= y + height;
  }

  update(delta: number) {
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      if (this.shakeTimer <= 0) {
        this.active = false;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height, type } = this.config;

    let drawX = x;
    const drawY = y;

    // Shake effect
    if (this.shakeTimer > 0) {
      drawX += Math.sin(this.shakeTimer * 30) * 1;
    }

    // Glow effect for monitors
    if (this.glowing) {
      ctx.save();
      ctx.shadowColor = '#66aaff';
      ctx.shadowBlur = 4;
      ctx.fillStyle = 'rgba(100, 170, 255, 0.15)';
      ctx.fillRect(drawX - 1, drawY - 1, width + 2, height + 2);
      ctx.restore();
    }

    // Draw based on type
    ctx.save();
    switch (type) {
      case 'intercom':
        ctx.fillStyle = '#666666';
        ctx.fillRect(drawX, drawY, width, height);
        ctx.fillStyle = '#aaaaaa';
        ctx.fillRect(drawX + 1, drawY + 1, width - 2, height - 2);
        if (this.active) {
          ctx.fillStyle = '#ff4444';
          ctx.beginPath();
          ctx.arc(drawX + width / 2, drawY + 4, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'whiteboard':
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(drawX, drawY, width, height);
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(drawX, drawY, width, height);
        if (this.displayText) {
          ctx.fillStyle = '#333333';
          ctx.font = '8px monospace';
          ctx.fillText(this.displayText.substring(0, 20), drawX + 4, drawY + height / 2 + 2);
        }
        break;

      case 'coffee_machine':
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(drawX, drawY, width, height);
        ctx.fillStyle = '#654321';
        ctx.fillRect(drawX + 2, drawY + 2, width - 4, height - 4);
        break;

      default:
        ctx.fillStyle = '#888888';
        ctx.fillRect(drawX, drawY, width, height);
        break;
    }
    ctx.restore();
  }
}
