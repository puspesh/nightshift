/**
 * Data-driven props system — data, rendering, and layout management.
 * Editor chrome (panel, tabs, input) lives in Editor.
 */

import type { AnchorType, TypedLocation } from '../citizens/Citizen';

// --- Types ---

export const ANCHOR_TYPES: AnchorType[] = ['work', 'rest', 'social', 'utility', 'wander'];

export interface Anchor {
  name: string;
  ox: number;
  oy: number;
  type: AnchorType;
}

export interface PropPiece {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 'below' | 'above';
  anchors?: Anchor[];
}

export type PropLayout = PropPiece[];

/** Minimum overlap (0–1) a prop must have on a tile in each axis to block it */
export const BLOCKING_OVERLAP_THRESHOLD = 0.6;

export const ANCHOR_COLORS: Record<AnchorType, string> = {
  work: '#4ade80',
  rest: '#818cf8',
  social: '#fbbf24',
  utility: '#22d3ee',
  wander: '#888888',
};

// --- Auto-anchor templates ---

const ANCHOR_TEMPLATES: Record<string, Omit<Anchor, 'name'>[]> = {
  desk:           [{ ox: 0.5, oy: -1, type: 'work' }],
  chair:          [],
  couch:          [{ ox: 0.5, oy: 0, type: 'rest' }, { ox: 1.5, oy: 0, type: 'rest' }],
  coffee_machine: [{ ox: 0.5, oy: 1.8, type: 'utility' }],
  whiteboard:     [{ ox: 1, oy: 1.5, type: 'social' }],
  bookshelf:      [],
  water_cooler:   [{ ox: 0, oy: 1.8, type: 'utility' }],
  plant:          [],
  lamp:           [],
};

function matchAnchorTemplate(id: string): Omit<Anchor, 'name'>[] | undefined {
  // Exact match first
  if (ANCHOR_TEMPLATES[id]) return ANCHOR_TEMPLATES[id];
  // Keyword match: if the props id contains a known keyword, use that template
  for (const [key, template] of Object.entries(ANCHOR_TEMPLATES)) {
    if (template.length > 0 && id.includes(key)) return template;
  }
  return undefined;
}

function autoAnchors(piece: PropPiece, index: number): Anchor[] {
  const templates = matchAnchorTemplate(piece.id);
  if (!templates || templates.length === 0) return [];
  return templates.map((t, i) => ({
    ...t,
    // Negative oy means "below the piece" — resolve to piece.h + |oy| - 1
    oy: t.oy < 0 ? piece.h + Math.abs(t.oy) - 1 : t.oy,
    name: `${piece.id}_${index}_${i}`,
  }));
}

// --- Loaded piece (internal) ---

export interface LoadedPiece extends PropPiece {
  img: HTMLImageElement;
  anchors: Anchor[];
}

// --- Main class ---

export class PropSystem {
  pieces: LoadedPiece[] = [];
  selected: Set<LoadedPiece> = new Set();
  wanderPoints: { name: string; x: number; y: number }[];

  private images: Map<string, HTMLImageElement> = new Map();
  private imageSrcs: Map<string, string> = new Map();
  private tileSize: number;
  private scale: number;
  private dragging = false;
  private dragOffsets: Map<LoadedPiece, { dx: number; dy: number }> = new Map();
  private clipboard: { id: string; w: number; h: number; layer: 'below' | 'above'; anchors: Anchor[] }[] = [];
  private onSaveCallback: (() => void) | null = null;
  private deadspaceCheck: ((col: number, row: number) => boolean) | null = null;

  constructor(tileSize: number, scale: number) {
    this.tileSize = tileSize;
    this.scale = scale;
    this.wanderPoints = [
      { name: 'wander_center', x: 7, y: 6 },
      { name: 'wander_lounge', x: 5, y: 8 },
    ];
  }

  async loadSprite(id: string, src: string): Promise<void> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load sprite: ${src}`));
      el.src = src;
    });
    this.images.set(id, img);
    this.imageSrcs.set(id, src);
  }

  getImageSrcs(): Map<string, string> { return this.imageSrcs; }
  getTileSize(): number { return this.tileSize; }
  getScale(): number { return this.scale; }

  setLayout(layout: PropLayout) {
    this.pieces = layout.map((p, i) => ({
      ...p,
      img: this.images.get(p.id)!,
      anchors: p.anchors ?? autoAnchors(p, i),
    })).filter(p => p.img);
  }

  getLayout(): PropLayout {
    return this.pieces.map(({ id, x, y, w, h, layer, anchors }) => ({
      id, x, y, w, h, layer,
      anchors: anchors.length > 0 ? anchors : undefined,
    }));
  }

  getLocations(): TypedLocation[] {
    const locs: TypedLocation[] = [];
    for (const p of this.pieces) {
      for (const a of p.anchors) {
        locs.push({
          name: a.name,
          x: Math.round(p.x + a.ox),
          y: Math.round(p.y + a.oy),
          type: a.type,
        });
      }
    }
    for (const wp of this.wanderPoints) {
      locs.push({ name: wp.name, x: wp.x, y: wp.y, type: 'wander' });
    }
    return locs;
  }

  getLocationMap(): Record<string, { x: number; y: number; label: string }> {
    const map: Record<string, { x: number; y: number; label: string }> = {};
    for (const loc of this.getLocations()) {
      map[loc.name] = { x: loc.x, y: loc.y, label: loc.name };
    }
    return map;
  }

  onSave(callback: () => void) { this.onSaveCallback = callback; }

  setDeadspaceCheck(check: (col: number, row: number) => boolean) {
    this.deadspaceCheck = check;
  }

  occupiesTile(col: number, row: number): boolean {
    for (const p of this.pieces) {
      if (col >= Math.floor(p.x) && col < Math.ceil(p.x + p.w) &&
          row >= Math.floor(p.y) && row < Math.ceil(p.y + p.h)) {
        return true;
      }
    }
    return false;
  }

  private overlapsDeadspace(x: number, y: number, w: number, h: number): boolean {
    if (!this.deadspaceCheck) return false;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.ceil(x + w);
    const y1 = Math.ceil(y + h);
    for (let r = y0; r < y1; r++) {
      for (let c = x0; c < x1; c++) {
        if (this.deadspaceCheck(c, r)) return true;
      }
    }
    return false;
  }

  getBlockedTiles(): Set<string> {
    const blocked = new Set<string>();
    // Only block tiles the prop substantially covers. Props placed at fractional
    // positions create marginal overlaps on edge tiles (e.g., a desk at x=4.5
    // barely touches x=4 with 0.5 overlap). Without a threshold these marginal
    // tiles form false walls that block pathfinding.
    const threshold = BLOCKING_OVERLAP_THRESHOLD;
    for (const p of this.pieces) {
      const x0 = Math.floor(p.x);
      const y0 = Math.floor(p.y);
      const x1 = Math.ceil(p.x + p.w);
      const y1 = Math.ceil(p.y + p.h);
      for (let y = y0; y < y1; y++) {
        const overlapY = Math.min(p.y + p.h, y + 1) - Math.max(p.y, y);
        if (overlapY < threshold) continue;
        for (let x = x0; x < x1; x++) {
          const overlapX = Math.min(p.x + p.w, x + 1) - Math.max(p.x, x);
          if (overlapX < threshold) continue;
          blocked.add(`${x},${y}`);
        }
      }
    }
    return blocked;
  }

  setWanderPoints(points: { name: string; x: number; y: number }[]) {
    this.wanderPoints = points;
  }

  save() {
    console.log('[props] Layout updated');
    this.onSaveCallback?.();
  }

  addPiece(id: string): LoadedPiece | null {
    const img = this.images.get(id);
    if (!img) return null;
    const aspect = img.naturalWidth / img.naturalHeight;
    const h = 2;
    const w = Math.round(h * aspect * 10) / 10;

    let px = 6, py = 5;
    if (this.overlapsDeadspace(px, py, w, h)) {
      let found = false;
      for (let r = 1; r < 20 && !found; r++) {
        for (let c = 1; c < 20 && !found; c++) {
          if (!this.overlapsDeadspace(c, r, w, h)) {
            px = c; py = r; found = true;
          }
        }
      }
    }

    const index = this.pieces.length;
    const piece: LoadedPiece = {
      id, img,
      x: px, y: py,
      w, h,
      layer: id === 'chair' ? 'above' : 'below',
      anchors: autoAnchors({ id, x: 6, y: 5, w, h, layer: 'below' }, index),
    };
    this.pieces.push(piece);
    return piece;
  }

  removePiece(piece: LoadedPiece) {
    this.pieces = this.pieces.filter(p => p !== piece);
    this.selected.delete(piece);
  }

  // --- Rendering ---

  renderBelow(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    const T = this.tileSize;
    for (const p of this.pieces) {
      if (p.layer === 'below') {
        ctx.drawImage(p.img, p.x * T, p.y * T, p.w * T, p.h * T);
      }
    }
  }

  renderAbove(ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
    const T = this.tileSize;
    for (const p of this.pieces) {
      if (p.layer === 'above') {
        ctx.drawImage(p.img, p.x * T, p.y * T, p.w * T, p.h * T);
      }
    }
  }

  // --- Mouse interaction (world pixel coords) ---

  handleMouseDown(wx: number, wy: number, shiftKey = false): boolean {
    const hit = this.pieceAt(wx, wy);
    if (hit) {
      if (shiftKey) {
        if (this.selected.has(hit)) {
          this.selected.delete(hit);
        } else {
          this.selected.add(hit);
        }
      } else if (!this.selected.has(hit)) {
        this.selected.clear();
        this.selected.add(hit);
      }
      this.dragging = true;
      this.dragOffsets.clear();
      for (const p of this.selected) {
        this.dragOffsets.set(p, {
          dx: wx - p.x * this.tileSize,
          dy: wy - p.y * this.tileSize,
        });
      }
      return true;
    }
    if (!shiftKey) this.selected.clear();
    return false;
  }

  handleMouseMove(wx: number, wy: number) {
    if (!this.dragging || this.selected.size === 0) return;
    const T = this.tileSize;

    const moves: { piece: LoadedPiece; nx: number; ny: number }[] = [];
    for (const p of this.selected) {
      const off = this.dragOffsets.get(p);
      if (!off) continue;
      const nx = this.snap((wx - off.dx) / T);
      const ny = this.snap((wy - off.dy) / T);
      if (this.overlapsDeadspace(nx, ny, p.w, p.h)) return;
      moves.push({ piece: p, nx, ny });
    }

    for (const m of moves) {
      m.piece.x = m.nx;
      m.piece.y = m.ny;
    }
  }

  handleMouseUp() { this.dragging = false; }

  handleKey(e: KeyboardEvent): boolean {
    // Copy: Ctrl/Cmd+C
    if ((e.metaKey || e.ctrlKey) && e.key === 'c' && this.selected.size > 0) {
      this.clipboard = [...this.selected].map(p => ({
        id: p.id, w: p.w, h: p.h, layer: p.layer,
        anchors: p.anchors.map(a => ({ ...a })),
      }));
      return true;
    }

    // Paste: Ctrl/Cmd+V
    if ((e.metaKey || e.ctrlKey) && e.key === 'v' && this.clipboard.length > 0) {
      this.selected.clear();
      for (const item of this.clipboard) {
        const img = this.images.get(item.id);
        if (!img) continue;
        const index = this.pieces.length;
        const piece: LoadedPiece = {
          id: item.id, img,
          x: 4 + Math.random() * 2, y: 4 + Math.random() * 2,
          w: item.w, h: item.h,
          layer: item.layer,
          anchors: item.anchors.map((a, i) => ({
            ...a, name: `${item.id}_${index}_${i}`,
          })),
        };
        this.pieces.push(piece);
        this.selected.add(piece);
      }
      return true;
    }

    if (this.selected.size === 0) return false;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      for (const p of this.selected) {
        this.pieces = this.pieces.filter(pp => pp !== p);
      }
      this.selected.clear();
      return true;
    }

    if (e.key === 'l' || e.key === 'L') {
      for (const p of this.selected) {
        p.layer = p.layer === 'below' ? 'above' : 'below';
      }
      return true;
    }

    if (e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 1 : 0.25;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;
      for (const s of this.selected) {
        if (this.overlapsDeadspace(s.x + dx, s.y + dy, s.w, s.h)) return true;
      }
      for (const s of this.selected) {
        s.x += dx;
        s.y += dy;
      }
      e.preventDefault();
      return true;
    }

    if (e.key === '=' || e.key === '+') {
      for (const p of this.selected) { p.w += 0.1; p.h += 0.1; }
      return true;
    }
    if (e.key === '-') {
      for (const p of this.selected) {
        p.w = Math.max(0.5, p.w - 0.1);
        p.h = Math.max(0.5, p.h - 0.1);
      }
      return true;
    }

    return false;
  }

  // --- Helpers ---

  pieceAt(wx: number, wy: number): LoadedPiece | null {
    const T = this.tileSize;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      const px = p.x * T, py = p.y * T, pw = p.w * T, ph = p.h * T;
      if (wx >= px && wx <= px + pw && wy >= py && wy <= py + ph) {
        return p;
      }
    }
    return null;
  }

  private snap(v: number): number {
    return Math.round(v * 4) / 4;
  }
}
