#!/usr/bin/env node
/**
 * Generate 32x32 tile PNGs for a modern office aesthetic.
 * Uses only Node.js built-ins (no external deps).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// PNG encoder (same pattern as generate-logo.mjs)
// ---------------------------------------------------------------------------
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let cn = n;
      for (let k = 0; k < 8; k++) cn = cn & 1 ? 0xEDB88320 ^ (cn >>> 1) : cn >>> 1;
      table[n] = cn;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const combined = Buffer.concat([typeBytes, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(combined));
    return Buffer.concat([len, combined, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = width * 4 + 1;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter none
    rgba.copy(raw, y * rowBytes + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    iend,
  ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TILE = 32;

/** Simple seeded PRNG (mulberry32) for deterministic noise. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash-based noise at integer coordinates — tileable when used with modular coords. */
function hashNoise(x, y, seed) {
  // Simple integer hash
  let h = seed;
  h = ((h ^ (x * 374761393)) + (y * 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) / 4294967296);
}

/** Create a new RGBA buffer for a 32x32 tile. */
function createBuffer(w = TILE, h = TILE) {
  return Buffer.alloc(w * h * 4);
}

/** Set a pixel in an RGBA buffer. */
function setPixel(buf, w, x, y, r, g, b, a = 255) {
  const idx = (y * w + x) * 4;
  buf[idx] = Math.max(0, Math.min(255, Math.round(r)));
  buf[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
  buf[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
  buf[idx + 3] = Math.max(0, Math.min(255, Math.round(a)));
}

/** Clamp a value to [0, 255]. */
function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Fill entire buffer with a base color, then apply per-pixel noise. */
function fillWithNoise(buf, w, h, baseR, baseG, baseB, noiseAmt, seed) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (hashNoise(x, y, seed) - 0.5) * 2 * noiseAmt;
      setPixel(buf, w, x, y,
        clamp(baseR + n),
        clamp(baseG + n),
        clamp(baseB + n),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tile generators
// ---------------------------------------------------------------------------

/**
 * 1. main_floor.png — Light gray carpet/concrete with subtle noise.
 *    Base ~#DCDCDC with +-6 noise.
 */
function generateMainFloor() {
  const buf = createBuffer();
  const baseR = 0xDC, baseG = 0xDC, baseB = 0xDC;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Two octaves of noise for concrete-like texture
      const n1 = (hashNoise(x, y, 1001) - 0.5) * 2 * 6;
      const n2 = (hashNoise(x * 3, y * 3, 2002) - 0.5) * 2 * 3;
      const n = n1 + n2;
      setPixel(buf, TILE, x, y,
        clamp(baseR + n),
        clamp(baseG + n),
        clamp(baseB + n),
      );
    }
  }
  return buf;
}

/**
 * 2. main_wall.png — Clean light gray wall with subtle horizontal line at bottom.
 *    Base ~#E8E8E8 with very light noise. Bottom 2 rows slightly darker (baseboard hint).
 */
function generateMainWall() {
  const buf = createBuffer();
  const baseR = 0xE8, baseG = 0xE8, baseB = 0xE8;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = (hashNoise(x, y, 3003) - 0.5) * 2 * 3;
      let r = baseR, g = baseG, b = baseB;
      // Subtle baseboard line at the bottom 2 rows
      if (y >= 30) {
        r = 0xC8; g = 0xC8; b = 0xC8;
      }
      setPixel(buf, TILE, x, y,
        clamp(r + n),
        clamp(g + n),
        clamp(b + n),
      );
    }
  }
  return buf;
}

/**
 * 3. kitchen_wall.png — White backsplash tile with thin grid lines.
 *    Base ~#F0EFED. Thin gray grid every 8px.
 */
function generateKitchenWall() {
  const buf = createBuffer();
  const baseR = 0xF0, baseG = 0xEF, baseB = 0xED;
  const gridR = 0xD0, gridG = 0xCF, gridB = 0xCD;
  const gridSpacing = 8;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = (hashNoise(x, y, 4004) - 0.5) * 2 * 2;
      const onGrid = (x % gridSpacing === 0) || (y % gridSpacing === 0);
      if (onGrid) {
        setPixel(buf, TILE, x, y,
          clamp(gridR + n),
          clamp(gridG + n),
          clamp(gridB + n),
        );
      } else {
        setPixel(buf, TILE, x, y,
          clamp(baseR + n),
          clamp(baseG + n),
          clamp(baseB + n),
        );
      }
    }
  }
  return buf;
}

/**
 * 4. green_wall_accent.png — Muted sage green accent wall.
 *    Base ~#A3B89E with subtle noise.
 */
function generateGreenWallAccent() {
  const buf = createBuffer();
  const baseR = 0xA3, baseG = 0xB8, baseB = 0x9E;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n1 = (hashNoise(x, y, 5005) - 0.5) * 2 * 5;
      const n2 = (hashNoise(x * 2, y * 2, 5506) - 0.5) * 2 * 3;
      const n = n1 + n2;
      setPixel(buf, TILE, x, y,
        clamp(baseR + n),
        clamp(baseG + n),
        clamp(baseB + n),
      );
    }
  }
  return buf;
}

/**
 * 5. office_wall_accent.png — Dark blue-gray feature wall.
 *    Base ~#3A4556 with subtle noise.
 */
function generateOfficeWallAccent() {
  const buf = createBuffer();
  const baseR = 0x3A, baseG = 0x45, baseB = 0x56;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n1 = (hashNoise(x, y, 6006) - 0.5) * 2 * 4;
      const n2 = (hashNoise(x * 2, y * 2, 6607) - 0.5) * 2 * 2;
      const n = n1 + n2;
      setPixel(buf, TILE, x, y,
        clamp(baseR + n),
        clamp(baseG + n),
        clamp(baseB + n),
      );
    }
  }
  return buf;
}

/**
 * 6. chevron_accent.png — Modern geometric chevron/herringbone pattern.
 *    Alternating light & mid tones in a V-shaped chevron pattern.
 */
function generateChevronAccent() {
  const buf = createBuffer();
  const colA = { r: 0xC0, g: 0xBE, b: 0xBA }; // warm light gray
  const colB = { r: 0xA8, g: 0xA5, b: 0xA0 }; // warm mid gray
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Chevron: V-shaped pattern that tiles.
      // Use modular arithmetic to create repeating chevrons.
      const chevronSize = 8;
      const mx = x % (chevronSize * 2);
      const my = y % (chevronSize * 2);
      // Create a V-pattern: the diagonal determines which color band
      const diag = ((mx < chevronSize ? mx : chevronSize * 2 - 1 - mx) + my) % (chevronSize * 2);
      const band = Math.floor(diag / chevronSize);
      const col = band === 0 ? colA : colB;
      const n = (hashNoise(x, y, 7007) - 0.5) * 2 * 3;
      setPixel(buf, TILE, x, y,
        clamp(col.r + n),
        clamp(col.g + n),
        clamp(col.b + n),
      );
    }
  }
  return buf;
}

/**
 * 7. moss_wall.png — Soft green-gray wall.
 *    Base ~#8BA888 with organic-feeling noise.
 */
function generateMossWall() {
  const buf = createBuffer();
  const baseR = 0x8B, baseG = 0xA8, baseB = 0x88;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n1 = (hashNoise(x, y, 8008) - 0.5) * 2 * 6;
      const n2 = (hashNoise(x * 2 + 1, y * 2 + 1, 8509) - 0.5) * 2 * 4;
      const n3 = (hashNoise(x * 5, y * 5, 8810) - 0.5) * 2 * 2;
      const n = n1 + n2 + n3;
      setPixel(buf, TILE, x, y,
        clamp(baseR + n * 0.8),
        clamp(baseG + n),
        clamp(baseB + n * 0.9),
      );
    }
  }
  return buf;
}

/**
 * 8. moss_wall_accent.png — Slightly darker green-gray variant.
 *    Base ~#7A9878 — darker than moss_wall.
 */
function generateMossWallAccent() {
  const buf = createBuffer();
  const baseR = 0x7A, baseG = 0x98, baseB = 0x78;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n1 = (hashNoise(x, y, 9009) - 0.5) * 2 * 6;
      const n2 = (hashNoise(x * 2 + 1, y * 2 + 1, 9510) - 0.5) * 2 * 4;
      const n3 = (hashNoise(x * 5, y * 5, 9811) - 0.5) * 2 * 2;
      const n = n1 + n2 + n3;
      setPixel(buf, TILE, x, y,
        clamp(baseR + n * 0.8),
        clamp(baseG + n),
        clamp(baseB + n * 0.9),
      );
    }
  }
  return buf;
}

/**
 * 9. rug_pattern.png — Modern geometric rug in dark tones.
 *    Dark base ~#4A4A50 with a subtle diamond/cross pattern in slightly lighter tone.
 */
function generateRugPattern() {
  const buf = createBuffer();
  const baseR = 0x4A, baseG = 0x4A, baseB = 0x50;
  const patR = 0x58, patG = 0x56, patB = 0x5E;
  const borderR = 0x3E, borderG = 0x3C, borderB = 0x44;

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = (hashNoise(x, y, 10010) - 0.5) * 2 * 3;
      let r = baseR, g = baseG, b = baseB;

      // Border: 1px frame
      if (x === 0 || x === 31 || y === 0 || y === 31) {
        r = borderR; g = borderG; b = borderB;
      } else {
        // Diamond pattern centered in tile
        const cx = x - 16;
        const cy = y - 16;
        const diamond = Math.abs(cx) + Math.abs(cy);
        // Concentric diamond rings
        if (diamond % 6 < 2) {
          r = patR; g = patG; b = patB;
        }
      }

      setPixel(buf, TILE, x, y,
        clamp(r + n),
        clamp(g + n),
        clamp(b + n),
      );
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Main: generate all tiles and the combined tileset
// ---------------------------------------------------------------------------
const tilesDir = new URL('../worlds/nightshift/world_assets/tiles/', import.meta.url).pathname;
mkdirSync(tilesDir, { recursive: true });

const tiles = [
  { name: 'main_floor.png', gen: generateMainFloor },
  { name: 'main_wall.png', gen: generateMainWall },
  { name: 'kitchen_wall.png', gen: generateKitchenWall },
  { name: 'green_wall_accent.png', gen: generateGreenWallAccent },
  { name: 'office_wall_accent.png', gen: generateOfficeWallAccent },
  { name: 'chevron_accent.png', gen: generateChevronAccent },
  { name: 'moss_wall.png', gen: generateMossWall },
  { name: 'moss_wall_accent.png', gen: generateMossWallAccent },
  { name: 'rug_pattern.png', gen: generateRugPattern },
];

// Generate individual tiles
const tileBuffers = [];
for (const tile of tiles) {
  const rgba = tile.gen();
  tileBuffers.push(rgba);
  const png = encodePNG(TILE, TILE, rgba);
  const outPath = new URL(`../worlds/nightshift/world_assets/tiles/${tile.name}`, import.meta.url).pathname;
  writeFileSync(outPath, png);
  console.log(`  Generated ${tile.name} (${TILE}x${TILE}) -> ${outPath}`);
}

// Generate combined tileset (16 slots of 32px = 512px wide, 32px tall)
const TILESET_SLOTS = 16;
const TILESET_W = TILESET_SLOTS * TILE; // 512
const TILESET_H = TILE;                 // 32
const tilesetBuf = Buffer.alloc(TILESET_W * TILESET_H * 4);

// Copy each tile into the tileset at its slot position
for (let i = 0; i < tileBuffers.length; i++) {
  const srcBuf = tileBuffers[i];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const srcIdx = (y * TILE + x) * 4;
      const dstX = i * TILE + x;
      const dstIdx = (y * TILESET_W + dstX) * 4;
      tilesetBuf[dstIdx] = srcBuf[srcIdx];
      tilesetBuf[dstIdx + 1] = srcBuf[srcIdx + 1];
      tilesetBuf[dstIdx + 2] = srcBuf[srcIdx + 2];
      tilesetBuf[dstIdx + 3] = srcBuf[srcIdx + 3];
    }
  }
}

// Fill remaining slots (9..15) with transparent black (already zeroed by alloc)

const tilesetPath = new URL('../worlds/nightshift/world_assets/tiles/tileset.png', import.meta.url).pathname;
const tilesetPng = encodePNG(TILESET_W, TILESET_H, tilesetBuf);
writeFileSync(tilesetPath, tilesetPng);
console.log(`  Generated tileset.png (${TILESET_W}x${TILESET_H}, ${tiles.length}/${TILESET_SLOTS} slots) -> ${tilesetPath}`);

console.log(`\nDone — ${tiles.length} tiles + 1 tileset generated.`);
