import { SpriteSheet } from './SpriteSheet';

export class Animator {
  private currentAnimation = 'idle_down';
  private frame = 0;
  private elapsed = 0;
  private spriteSheet: SpriteSheet;

  constructor(spriteSheet: SpriteSheet, initialAnimation = 'idle_down') {
    this.spriteSheet = spriteSheet;
    this.currentAnimation = initialAnimation;
  }

  play(animation: string) {
    if (this.currentAnimation === animation) return;
    this.currentAnimation = animation;
    this.frame = 0;
    this.elapsed = 0;
  }

  getCurrentAnimation(): string {
    return this.currentAnimation;
  }

  update(delta: number) {
    const anim = this.spriteSheet.config.animations[this.currentAnimation];
    if (!anim) return;

    this.elapsed += delta;
    if (this.elapsed >= anim.speed) {
      this.elapsed -= anim.speed;
      this.frame = (this.frame + 1) % anim.frames;
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.spriteSheet.drawFrame(ctx, this.currentAnimation, this.frame, x, y);
  }
}
