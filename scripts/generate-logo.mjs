#!/usr/bin/env node
/**
 * Generate a pixel-art "nightshift" neon logo PNG.
 * Uses only Node.js built-ins (no external deps).
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Simple 5x7 pixel font for lowercase letters
const FONT = {
  n: [
    '10001',
    '11001',
    '10101',
    '10011',
    '10001',
    '10001',
    '10001',
  ],
  i: [
    '111',
    '010',
    '010',
    '010',
    '010',
    '010',
    '111',
  ],
  g: [
    '01110',
    '10001',
    '10000',
    '10111',
    '10001',
    '10001',
    '01110',
  ],
  h: [
    '10001',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001',
  ],
  t: [
    '11111',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100',
  ],
  s: [
    '01111',
    '10000',
    '10000',
    '01110',
    '00001',
    '00001',
    '11110',
  ],
  f: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '10000',
  ],
};

const text = 'nightshift';
const SCALE = 8;        // Each font pixel = 8x8 real pixels
const SPACING = 2;      // Pixels between chars (in font units)
const PADDING_X = 6;    // Padding left/right (font units)
const PADDING_Y = 4;    // Padding top/bottom (font units)

// Calculate total dimensions in font units
let totalFontWidth = PADDING_X * 2;
for (let i = 0; i < text.length; i++) {
  const ch = FONT[text[i]];
  if (!ch) continue;
  totalFontWidth += ch[0].length;
  if (i < text.length - 1) totalFontWidth += SPACING;
}
const totalFontHeight = 7 + PADDING_Y * 2;

const WIDTH = totalFontWidth * SCALE;
const HEIGHT = totalFontHeight * SCALE;

// Create RGBA pixel buffer
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

// Neon blue color: #58a6ff
const NEON_R = 0x58, NEON_G = 0xa6, NEON_B = 0xff;

// Fill background with dark translucent
for (let i = 0; i < WIDTH * HEIGHT; i++) {
  pixels[i * 4 + 0] = 0x12;
  pixels[i * 4 + 1] = 0x16;
  pixels[i * 4 + 2] = 0x1e;
  pixels[i * 4 + 3] = 200;
}

// Render text pixels into a boolean grid first (for glow calculation)
const grid = new Uint8Array(totalFontWidth * totalFontHeight);
let cursorX = PADDING_X;
for (const ch of text) {
  const glyph = FONT[ch];
  if (!glyph) continue;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < glyph[row].length; col++) {
      if (glyph[row][col] === '1') {
        grid[(PADDING_Y + row) * totalFontWidth + cursorX + col] = 1;
      }
    }
  }
  cursorX += glyph[0].length + SPACING;
}

// Apply glow: for each pixel, check distance to nearest lit pixel
function setPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = (y * WIDTH + x) * 4;
  // Alpha blend
  const srcA = a / 255;
  const dstA = pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  pixels[idx + 0] = Math.min(255, Math.round((r * srcA + pixels[idx + 0] * dstA * (1 - srcA)) / outA));
  pixels[idx + 1] = Math.min(255, Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA));
  pixels[idx + 2] = Math.min(255, Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA));
  pixels[idx + 3] = Math.min(255, Math.round(outA * 255));
}

// Draw glow layers (larger, dimmer circles around each lit pixel)
const GLOW_RADIUS = 3; // in font units
for (let gy = 0; gy < totalFontHeight; gy++) {
  for (let gx = 0; gx < totalFontWidth; gx++) {
    if (!grid[gy * totalFontWidth + gx]) continue;
    // Draw glow
    for (let dy = -GLOW_RADIUS; dy <= GLOW_RADIUS; dy++) {
      for (let dx = -GLOW_RADIUS; dx <= GLOW_RADIUS; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > GLOW_RADIUS) continue;
        const intensity = Math.max(0, 1 - dist / GLOW_RADIUS);
        const alpha = Math.round(intensity * 80);
        // Fill the scaled pixel block
        for (let py = 0; py < SCALE; py++) {
          for (let px = 0; px < SCALE; px++) {
            setPixel(
              (gx + dx) * SCALE + px,
              (gy + dy) * SCALE + py,
              NEON_R, NEON_G, NEON_B, alpha
            );
          }
        }
      }
    }
  }
}

// Draw the actual text pixels (bright neon)
for (let gy = 0; gy < totalFontHeight; gy++) {
  for (let gx = 0; gx < totalFontWidth; gx++) {
    if (!grid[gy * totalFontWidth + gx]) continue;
    for (let py = 0; py < SCALE; py++) {
      for (let px = 0; px < SCALE; px++) {
        const x = gx * SCALE + px;
        const y = gy * SCALE + py;
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
          const idx = (y * WIDTH + x) * 4;
          pixels[idx + 0] = 220;
          pixels[idx + 1] = 230;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }
      }
    }
  }
}

// Encode as PNG using raw zlib (minimal PNG encoder)
function encodePNG(width, height, rgba) {
  // PNG signature
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

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: filter each row (filter type 0 = None)
  const rowBytes = width * 4 + 1;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter none
    rgba.copy(raw, y * rowBytes + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });

  // IEND
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    iend,
  ]);
}

const pngBuffer = encodePNG(WIDTH, HEIGHT, Buffer.from(pixels));
const outPath = new URL('../worlds/nightshift/world_assets/props/prop_17_logo_neon.png', import.meta.url).pathname;
writeFileSync(outPath, pngBuffer);
console.log(`Generated nightshift logo: ${WIDTH}x${HEIGHT} -> ${outPath}`);
