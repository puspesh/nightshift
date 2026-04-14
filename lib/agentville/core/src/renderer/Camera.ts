export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  private targetX = 0;
  private targetY = 0;
  private smoothing = 0.1;

  setPosition(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  snapTo(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
  }

  update() {
    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;
  }

  apply(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, -this.x * this.zoom, -this.y * this.zoom);
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX / this.zoom + this.x,
      y: screenY / this.zoom + this.y,
    };
  }
}
