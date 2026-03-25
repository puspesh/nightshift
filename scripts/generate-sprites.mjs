#!/usr/bin/env node
/**
 * Generate programmatic citizen sprite sheet PNGs for 5 roles.
 * Uses only Node.js built-ins (no external deps).
 *
 * Each role gets two 256x256 sprite sheets (4x4 grid of 64x64 frames):
 *   - {role}_walk.png   — walk cycle (down, up, left, right)
 *   - {role}_actions.png — working, sleeping, talking, idle
 *
 * AI Generation Prompts (for manual/semi-automated sprite creation):
 *
 * CITIZEN WALK SHEET: "Isometric chibi character sprite sheet, 256x256 PNG,
 * 4x4 grid of 64x64 frames. [ROLE DESCRIPTION]. Walk cycle:
 * Row 1 walk down, Row 2 walk up, Row 3 walk left, Row 4 walk right.
 * 4 frames per direction. Semi-realistic style, clean lines."
 *
 * CITIZEN ACTIONS SHEET: "Isometric chibi character sprite sheet, 256x256 PNG,
 * 4x4 grid of 64x64 frames. [ROLE DESCRIPTION]. Actions:
 * Row 1 working at desk (4 frames), Row 2 sleeping (2 frames),
 * Row 3 talking/gesturing (4 frames), Row 4 idle standing (4 frames)."
 *
 * Role-specific prompts:
 *
 * PRODUCER: "Isometric chibi character, cyan (#00cccc) polo shirt, slightly
 * broader shoulders, confident stance. Skin tone #E8C4A0, dark hair #333333.
 * Professional but approachable look. Clean pixel-art style on transparent
 * background, each frame 64x64 pixels."
 *
 * PLANNER: "Isometric chibi character, yellow (#cccc00) sweater/blazer combo,
 * holding a small notepad. Skin tone #E8C4A0, dark hair #333333. Thoughtful
 * analytical appearance. Clean pixel-art style on transparent background,
 * each frame 64x64 pixels."
 *
 * REVIEWER: "Isometric chibi character, magenta (#cc00cc) suit jacket,
 * wearing small rectangular glasses. Skin tone #E8C4A0, dark hair #333333.
 * Formal meticulous appearance. Clean pixel-art style on transparent
 * background, each frame 64x64 pixels."
 *
 * CODER: "Isometric chibi character, blue (#0066cc) hoodie with hood shape
 * visible on head, relaxed slouched posture. Skin tone #E8C4A0, dark hair
 * #333333. Casual developer look. Clean pixel-art style on transparent
 * background, each frame 64x64 pixels."
 *
 * TESTER: "Isometric chibi character, green (#00cc00) t-shirt with utility
 * vest (visible vest detail lines), practical look. Skin tone #E8C4A0, dark
 * hair #333333. Ready-for-action appearance. Clean pixel-art style on
 * transparent background, each frame 64x64 pixels."
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// PNG encoder (same as generate-logo.mjs)
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
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rowBytes = width * 4 + 1;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0;
    rgba.copy(raw, y * rowBytes + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), iend]);
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
function parseHex(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function darken(color, factor = 0.6) {
  return {
    r: Math.round(color.r * factor),
    g: Math.round(color.g * factor),
    b: Math.round(color.b * factor),
  };
}

function lighten(color, factor = 1.3) {
  return {
    r: Math.min(255, Math.round(color.r * factor)),
    g: Math.min(255, Math.round(color.g * factor)),
    b: Math.min(255, Math.round(color.b * factor)),
  };
}

// ---------------------------------------------------------------------------
// Drawing primitives — work on a 64x64 RGBA buffer
// ---------------------------------------------------------------------------
const FRAME_SIZE = 64;

function createFrame() {
  return Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4); // transparent
}

function setPixel(buf, x, y, r, g, b, a = 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= FRAME_SIZE || y < 0 || y >= FRAME_SIZE) return;
  const idx = (y * FRAME_SIZE + x) * 4;
  if (a >= 255) {
    buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
  } else if (a > 0) {
    const srcA = a / 255;
    const dstA = buf[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    buf[idx]     = Math.round((r * srcA + buf[idx]     * dstA * (1 - srcA)) / outA);
    buf[idx + 1] = Math.round((g * srcA + buf[idx + 1] * dstA * (1 - srcA)) / outA);
    buf[idx + 2] = Math.round((b * srcA + buf[idx + 2] * dstA * (1 - srcA)) / outA);
    buf[idx + 3] = Math.round(outA * 255);
  }
}

function fillRect(buf, x, y, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(buf, x + dx, y + dy, r, g, b, a);
    }
  }
}

function fillCircle(buf, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        setPixel(buf, cx + dx, cy + dy, r, g, b, a);
      }
    }
  }
}

function fillEllipse(buf, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
        setPixel(buf, cx + dx, cy + dy, r, g, b, a);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------
const SKIN = parseHex('#E8C4A0');
const HAIR_COLOR = parseHex('#333333');
const SHOE_COLOR = parseHex('#222222');
const EYE_COLOR = parseHex('#1a1a1a');

const ROLES = {
  producer: {
    color: parseHex('#00cccc'),
    // Polo shirt, slightly broader shoulders
    drawAttire(buf, cx, cy, bodyTop, bodyW, bodyH, shade) {
      // Broader shoulders: extend body rect by 1 on each side
      fillRect(buf, cx - bodyW / 2 - 1, bodyTop, bodyW + 2, 3, shade.r, shade.g, shade.b);
      // Collar detail (polo)
      fillRect(buf, cx - 2, bodyTop - 1, 4, 2, shade.r, shade.g, shade.b);
      // Center button line
      setPixel(buf, cx, bodyTop + 3, shade.r, shade.g, shade.b);
      setPixel(buf, cx, bodyTop + 5, shade.r, shade.g, shade.b);
    },
  },
  planner: {
    color: parseHex('#cccc00'),
    // Sweater/blazer, notepad detail
    drawAttire(buf, cx, cy, bodyTop, bodyW, bodyH, shade) {
      // Blazer lapels
      const lapelColor = darken(shade, 0.8);
      fillRect(buf, cx - bodyW / 2, bodyTop, 2, bodyH - 2, lapelColor.r, lapelColor.g, lapelColor.b);
      fillRect(buf, cx + bodyW / 2 - 2, bodyTop, 2, bodyH - 2, lapelColor.r, lapelColor.g, lapelColor.b);
      // Notepad in left hand area
      fillRect(buf, cx - bodyW / 2 - 3, bodyTop + 4, 3, 5, 255, 255, 240);
      // Notepad lines
      setPixel(buf, cx - bodyW / 2 - 2, bodyTop + 5, 100, 100, 100);
      setPixel(buf, cx - bodyW / 2 - 2, bodyTop + 7, 100, 100, 100);
    },
  },
  reviewer: {
    color: parseHex('#cc00cc'),
    // Suit jacket, glasses
    drawAttire(buf, cx, cy, bodyTop, bodyW, bodyH, shade) {
      // Suit jacket center line
      fillRect(buf, cx, bodyTop, 1, bodyH - 1, shade.r, shade.g, shade.b);
      // Jacket pocket (left)
      fillRect(buf, cx - bodyW / 2 + 1, bodyTop + bodyH - 5, 3, 1, shade.r, shade.g, shade.b);
    },
    // Glasses drawn on head
    drawHead(buf, cx, headCY) {
      // Glasses: two small rectangles on either side of center
      fillRect(buf, cx - 4, headCY - 1, 3, 2, 80, 80, 80);
      fillRect(buf, cx + 1, headCY - 1, 3, 2, 80, 80, 80);
      // Bridge
      fillRect(buf, cx - 1, headCY - 1, 2, 1, 80, 80, 80);
    },
  },
  coder: {
    color: parseHex('#0066cc'),
    // Hoodie (hood shape on head), relaxed posture
    drawAttire(buf, cx, cy, bodyTop, bodyW, bodyH, shade) {
      // Hoodie pocket (kangaroo pocket)
      fillRect(buf, cx - 3, bodyTop + bodyH - 5, 6, 3, shade.r, shade.g, shade.b);
      // Hood strings
      setPixel(buf, cx - 1, bodyTop + 1, shade.r, shade.g, shade.b);
      setPixel(buf, cx + 1, bodyTop + 1, shade.r, shade.g, shade.b);
      setPixel(buf, cx - 1, bodyTop + 2, shade.r, shade.g, shade.b);
      setPixel(buf, cx + 1, bodyTop + 2, shade.r, shade.g, shade.b);
    },
    // Hood shape on head
    drawHead(buf, cx, headCY, color) {
      // Hood outline — a slightly larger arc over the top of the head
      const hoodColor = darken(color, 0.85);
      for (let angle = -Math.PI; angle <= 0; angle += 0.1) {
        const hx = Math.round(cx + Math.cos(angle) * 9);
        const hy = Math.round(headCY + Math.sin(angle) * 8 - 1);
        setPixel(buf, hx, hy, hoodColor.r, hoodColor.g, hoodColor.b);
        setPixel(buf, hx, hy - 1, hoodColor.r, hoodColor.g, hoodColor.b);
      }
    },
  },
  tester: {
    color: parseHex('#00cc00'),
    // T-shirt with utility vest
    drawAttire(buf, cx, cy, bodyTop, bodyW, bodyH, shade) {
      // Vest detail lines (vertical lines on either side)
      const vestColor = darken(shade, 0.7);
      fillRect(buf, cx - bodyW / 2 + 1, bodyTop + 1, 1, bodyH - 3, vestColor.r, vestColor.g, vestColor.b);
      fillRect(buf, cx + bodyW / 2 - 2, bodyTop + 1, 1, bodyH - 3, vestColor.r, vestColor.g, vestColor.b);
      // Vest pockets
      fillRect(buf, cx - bodyW / 2 + 1, bodyTop + 4, 3, 2, vestColor.r, vestColor.g, vestColor.b);
      fillRect(buf, cx + bodyW / 2 - 4, bodyTop + 4, 3, 2, vestColor.r, vestColor.g, vestColor.b);
      // Zipper line
      fillRect(buf, cx, bodyTop, 1, bodyH - 2, vestColor.r, vestColor.g, vestColor.b);
    },
  },
};

// ---------------------------------------------------------------------------
// Character drawing — a chibi character ~24x40px centered in 64x64
// ---------------------------------------------------------------------------

/**
 * Draws a complete character on a 64x64 frame buffer.
 *
 * @param {Buffer} buf - 64x64 RGBA buffer
 * @param {object} role - role config from ROLES
 * @param {object} opts - drawing options
 *   facing: 'down' | 'up' | 'left' | 'right'
 *   leftFoot: number (-2 to 2) offset for left foot
 *   rightFoot: number (-2 to 2) offset for right foot
 *   bodyOffsetX: horizontal shift
 *   bodyOffsetY: vertical shift
 *   headTilt: small head offset for animation
 *   armLeft: left arm vertical offset
 *   armRight: right arm vertical offset
 *   showEyes: boolean
 *   mouthOpen: boolean
 *   hunchForward: number (pixels to lean forward)
 */
function drawCharacter(buf, role, opts = {}) {
  const {
    facing = 'down',
    leftFoot = 0,
    rightFoot = 0,
    bodyOffsetX = 0,
    bodyOffsetY = 0,
    headTilt = 0,
    armLeftDY = 0,
    armRightDY = 0,
    showEyes = true,
    mouthOpen = false,
    hunchForward = 0,
  } = opts;

  const color = role.color;
  const shade = darken(color, 0.65);
  const highlight = lighten(color, 1.2);

  // Center of character in the 64x64 frame
  let cx = 32 + bodyOffsetX;
  const baseY = 54; // feet bottom line

  // Body dimensions
  const headR = 7;         // head radius
  const bodyW = 12;        // body width
  const bodyH = 14;        // body height
  const legLen = 8;        // leg length
  const legW = 4;          // leg width
  const armW = 3;          // arm width
  const armH = 10;         // arm height

  // Horizontal shift for left/right facing
  let facingShiftX = 0;
  if (facing === 'left') facingShiftX = -3;
  if (facing === 'right') facingShiftX = 3;
  cx += facingShiftX;

  const feetY = baseY + bodyOffsetY;
  const legTop = feetY - legLen;
  const bodyTop = legTop - bodyH + hunchForward;
  const bodyBot = legTop;
  const headCY = bodyTop - headR + 2 + headTilt;

  // --- Shadow (subtle ellipse on the ground) ---
  fillEllipse(buf, 32, feetY + 1, 8, 2, 0, 0, 0, 40);

  // --- Legs ---
  const legSep = 3; // distance from center to each leg center
  // Left leg
  const leftLegX = cx - legSep;
  fillRect(buf, leftLegX - legW / 2, legTop + leftFoot, legW, legLen, color.r, color.g, color.b);
  // Left shoe
  fillRect(buf, leftLegX - legW / 2, feetY - 2 + leftFoot, legW + 1, 2, SHOE_COLOR.r, SHOE_COLOR.g, SHOE_COLOR.b);

  // Right leg
  const rightLegX = cx + legSep;
  fillRect(buf, rightLegX - legW / 2, legTop + rightFoot, legW, legLen, color.r, color.g, color.b);
  // Right shoe
  fillRect(buf, rightLegX - legW / 2, feetY - 2 + rightFoot, legW + 1, 2, SHOE_COLOR.r, SHOE_COLOR.g, SHOE_COLOR.b);

  // Leg shading (inner side)
  if (facing === 'down' || facing === 'up') {
    fillRect(buf, leftLegX + legW / 2 - 1, legTop + leftFoot, 1, legLen, shade.r, shade.g, shade.b);
    fillRect(buf, rightLegX - legW / 2, legTop + rightFoot, 1, legLen, shade.r, shade.g, shade.b);
  }

  // --- Body / torso ---
  fillRect(buf, cx - bodyW / 2, bodyTop, bodyW, bodyH, color.r, color.g, color.b);
  // Shading on body (right side darker)
  fillRect(buf, cx + bodyW / 2 - 2, bodyTop, 2, bodyH, shade.r, shade.g, shade.b);
  // Highlight on body (left side lighter)
  fillRect(buf, cx - bodyW / 2, bodyTop, 1, bodyH, highlight.r, highlight.g, highlight.b);

  // --- Arms ---
  const armTopY = bodyTop + 2;

  if (facing !== 'left') {
    // Left arm
    fillRect(buf, cx - bodyW / 2 - armW, armTopY + armLeftDY, armW, armH, color.r, color.g, color.b);
    // Hand
    fillRect(buf, cx - bodyW / 2 - armW, armTopY + armH - 2 + armLeftDY, armW, 2, SKIN.r, SKIN.g, SKIN.b);
    // Arm shading
    fillRect(buf, cx - bodyW / 2 - 1, armTopY + armLeftDY, 1, armH, shade.r, shade.g, shade.b);
  }

  if (facing !== 'right') {
    // Right arm
    fillRect(buf, cx + bodyW / 2, armTopY + armRightDY, armW, armH, color.r, color.g, color.b);
    // Hand
    fillRect(buf, cx + bodyW / 2, armTopY + armH - 2 + armRightDY, armW, 2, SKIN.r, SKIN.g, SKIN.b);
    // Arm shading
    fillRect(buf, cx + bodyW / 2, armTopY + armRightDY, 1, armH, shade.r, shade.g, shade.b);
  }

  // For left/right facing, draw the visible arm in front
  if (facing === 'left') {
    fillRect(buf, cx - bodyW / 2 - armW, armTopY + armLeftDY, armW, armH, color.r, color.g, color.b);
    fillRect(buf, cx - bodyW / 2 - armW, armTopY + armH - 2 + armLeftDY, armW, 2, SKIN.r, SKIN.g, SKIN.b);
  }
  if (facing === 'right') {
    fillRect(buf, cx + bodyW / 2, armTopY + armRightDY, armW, armH, color.r, color.g, color.b);
    fillRect(buf, cx + bodyW / 2, armTopY + armH - 2 + armRightDY, armW, 2, SKIN.r, SKIN.g, SKIN.b);
  }

  // --- Role-specific attire details ---
  role.drawAttire(buf, cx, headCY, bodyTop, bodyW, bodyH, shade);

  // --- Neck ---
  fillRect(buf, cx - 2, bodyTop - 3, 4, 4, SKIN.r, SKIN.g, SKIN.b);

  // --- Head ---
  // Hair base (full head area, drawn first so skin covers the face portion)
  fillCircle(buf, cx, headCY, headR, HAIR_COLOR.r, HAIR_COLOR.g, HAIR_COLOR.b);

  if (facing === 'down') {
    // Face (front-facing: lower portion of the head circle is skin)
    fillEllipse(buf, cx, headCY + 2, headR - 1, headR - 3, SKIN.r, SKIN.g, SKIN.b);
    // Eyes
    if (showEyes) {
      setPixel(buf, cx - 3, headCY + 1, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
      setPixel(buf, cx + 3, headCY + 1, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
      setPixel(buf, cx - 3, headCY + 2, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
      setPixel(buf, cx + 3, headCY + 2, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
    }
    // Mouth
    if (mouthOpen) {
      fillRect(buf, cx - 1, headCY + 5, 3, 2, 180, 80, 80);
    } else {
      fillRect(buf, cx - 1, headCY + 5, 3, 1, 180, 100, 100);
    }
  } else if (facing === 'up') {
    // Back of head — just hair, no face features
    // Slightly show ears on sides
    fillRect(buf, cx - headR - 1, headCY, 2, 3, SKIN.r, SKIN.g, SKIN.b);
    fillRect(buf, cx + headR, headCY, 2, 3, SKIN.r, SKIN.g, SKIN.b);
  } else if (facing === 'left') {
    // Left-facing profile: skin on the left side of head
    fillEllipse(buf, cx - 2, headCY + 1, headR - 3, headR - 2, SKIN.r, SKIN.g, SKIN.b);
    // Eye (single, on the left side)
    if (showEyes) {
      setPixel(buf, cx - 4, headCY, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
      setPixel(buf, cx - 4, headCY + 1, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
    }
    if (mouthOpen) {
      fillRect(buf, cx - 5, headCY + 4, 2, 2, 180, 80, 80);
    } else {
      fillRect(buf, cx - 5, headCY + 4, 2, 1, 180, 100, 100);
    }
    // Ear (right side, partially visible)
    fillRect(buf, cx + headR - 2, headCY, 2, 3, SKIN.r, SKIN.g, SKIN.b);
  } else if (facing === 'right') {
    // Right-facing profile
    fillEllipse(buf, cx + 2, headCY + 1, headR - 3, headR - 2, SKIN.r, SKIN.g, SKIN.b);
    if (showEyes) {
      setPixel(buf, cx + 4, headCY, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
      setPixel(buf, cx + 4, headCY + 1, EYE_COLOR.r, EYE_COLOR.g, EYE_COLOR.b);
    }
    if (mouthOpen) {
      fillRect(buf, cx + 4, headCY + 4, 2, 2, 180, 80, 80);
    } else {
      fillRect(buf, cx + 4, headCY + 4, 2, 1, 180, 100, 100);
    }
    // Ear (left side)
    fillRect(buf, cx - headR, headCY, 2, 3, SKIN.r, SKIN.g, SKIN.b);
  }

  // --- Role-specific head details (glasses, hood, etc.) ---
  if (role.drawHead) {
    role.drawHead(buf, cx, headCY, color);
  }
}

// ---------------------------------------------------------------------------
// Compose a 256x256 sprite sheet from a 4x4 array of 64x64 frame buffers
// ---------------------------------------------------------------------------
function composeSheet(frames) {
  // frames is [row][col], each is a 64x64 RGBA Buffer
  const W = 256, H = 256;
  const sheet = Buffer.alloc(W * H * 4);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const frame = frames[row][col];
      if (!frame) continue;
      const ox = col * FRAME_SIZE;
      const oy = row * FRAME_SIZE;
      for (let y = 0; y < FRAME_SIZE; y++) {
        const srcOff = y * FRAME_SIZE * 4;
        const dstOff = ((oy + y) * W + ox) * 4;
        frame.copy(sheet, dstOff, srcOff, srcOff + FRAME_SIZE * 4);
      }
    }
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// Walk sheet generation
// ---------------------------------------------------------------------------
function generateWalkSheet(role) {
  const frames = [];

  // Walk foot offsets for 4 frames:
  //   Frame 0: left foot forward (-2), right foot back (+2)
  //   Frame 1: center (0, 0)
  //   Frame 2: right foot forward (-2), left foot back (+2)
  //   Frame 3: center (0, 0) slight variation (small bodyOffsetY)
  const walkCycle = [
    { leftFoot: -3, rightFoot: 2 },
    { leftFoot: 0,  rightFoot: 0 },
    { leftFoot: 2,  rightFoot: -3 },
    { leftFoot: 0,  rightFoot: 0, bodyOffsetY: -1 },
  ];

  const facings = ['down', 'up', 'left', 'right'];

  for (let row = 0; row < 4; row++) {
    frames[row] = [];
    for (let col = 0; col < 4; col++) {
      const buf = createFrame();
      const wc = walkCycle[col];
      drawCharacter(buf, role, {
        facing: facings[row],
        leftFoot: wc.leftFoot,
        rightFoot: wc.rightFoot,
        bodyOffsetY: wc.bodyOffsetY || 0,
      });
      frames[row][col] = buf;
    }
  }

  return composeSheet(frames);
}

// ---------------------------------------------------------------------------
// Actions sheet generation
// ---------------------------------------------------------------------------
function generateActionsSheet(role) {
  const frames = [];

  // Row 0: working (4 frames) — hunched forward, arms at desk level
  frames[0] = [];
  for (let col = 0; col < 4; col++) {
    const buf = createFrame();
    const hunchVals = [3, 2, 3, 4]; // subtle forward lean variation
    const armDY = [2, 3, 2, 1];     // arms lower (at desk level)
    drawCharacter(buf, role, {
      facing: 'down',
      hunchForward: hunchVals[col],
      armLeftDY: armDY[col],
      armRightDY: armDY[col],
      bodyOffsetY: -2,
      headTilt: col % 2 === 0 ? 1 : 0,
    });
    // Draw a small desk in front
    const deskColor = { r: 139, g: 90, b: 43 };
    fillRect(buf, 20, 48, 24, 3, deskColor.r, deskColor.g, deskColor.b);
    fillRect(buf, 21, 51, 4, 5, deskColor.r, deskColor.g, deskColor.b);
    fillRect(buf, 39, 51, 4, 5, deskColor.r, deskColor.g, deskColor.b);
    frames[0][col] = buf;
  }

  // Row 1: sleeping (2 frames, remaining 2 empty)
  frames[1] = [];
  for (let col = 0; col < 4; col++) {
    if (col < 2) {
      const buf = createFrame();
      drawCharacter(buf, role, {
        facing: 'down',
        showEyes: false,           // eyes closed
        bodyOffsetY: col === 0 ? 2 : 3, // gentle bob
        headTilt: col === 0 ? 2 : 3,    // head drooping
        hunchForward: 2,
        armLeftDY: 3,
        armRightDY: 3,
      });
      // Draw "zzz" for sleeping indicator
      if (col === 0) {
        const zzColor = { r: 180, g: 180, b: 255 };
        // Small z
        fillRect(buf, 42, 10, 3, 1, zzColor.r, zzColor.g, zzColor.b);
        setPixel(buf, 44, 11, zzColor.r, zzColor.g, zzColor.b);
        setPixel(buf, 43, 12, zzColor.r, zzColor.g, zzColor.b);
        fillRect(buf, 42, 13, 3, 1, zzColor.r, zzColor.g, zzColor.b);
      } else {
        const zzColor = { r: 160, g: 160, b: 240 };
        fillRect(buf, 44, 8, 4, 1, zzColor.r, zzColor.g, zzColor.b);
        setPixel(buf, 47, 9, zzColor.r, zzColor.g, zzColor.b);
        setPixel(buf, 46, 10, zzColor.r, zzColor.g, zzColor.b);
        setPixel(buf, 45, 11, zzColor.r, zzColor.g, zzColor.b);
        fillRect(buf, 44, 12, 4, 1, zzColor.r, zzColor.g, zzColor.b);
      }
      frames[1][col] = buf;
    } else {
      frames[1][col] = createFrame(); // empty transparent frame
    }
  }

  // Row 2: talking (4 frames) — mouth/arm movement
  frames[2] = [];
  for (let col = 0; col < 4; col++) {
    const buf = createFrame();
    const mouthStates = [false, true, false, true];
    const armVariations = [0, -2, 0, -3]; // arm raising for gesturing
    drawCharacter(buf, role, {
      facing: 'down',
      mouthOpen: mouthStates[col],
      armRightDY: armVariations[col],
      armLeftDY: col === 2 ? -1 : 0,
      headTilt: col === 1 ? -1 : col === 3 ? 1 : 0,
    });
    // Speech bubble indicator on some frames
    if (col === 1 || col === 3) {
      const bubbleColor = { r: 255, g: 255, b: 255 };
      fillEllipse(buf, 46, 14, 5, 3, bubbleColor.r, bubbleColor.g, bubbleColor.b);
      // Bubble tail
      setPixel(buf, 42, 16, bubbleColor.r, bubbleColor.g, bubbleColor.b);
      setPixel(buf, 41, 17, bubbleColor.r, bubbleColor.g, bubbleColor.b);
      // Dots inside bubble
      setPixel(buf, 44, 14, 100, 100, 100);
      setPixel(buf, 46, 14, 100, 100, 100);
      setPixel(buf, 48, 14, 100, 100, 100);
    }
    frames[2][col] = buf;
  }

  // Row 3: idle (4 frames) — subtle breathing/weight-shift
  frames[3] = [];
  for (let col = 0; col < 4; col++) {
    const buf = createFrame();
    // Subtle body movement: frames 0,2 slightly up, 1,3 normal
    const breathOffset = col % 2 === 0 ? -1 : 0;
    // Slight weight shift: alternate leaning
    const shiftX = col === 1 ? -1 : col === 3 ? 1 : 0;
    drawCharacter(buf, role, {
      facing: 'down',
      bodyOffsetY: breathOffset,
      bodyOffsetX: shiftX,
      headTilt: breathOffset,
    });
    frames[3][col] = buf;
  }

  return composeSheet(frames);
}

// ---------------------------------------------------------------------------
// Main — generate all sprites
// ---------------------------------------------------------------------------
const outDir = new URL('../worlds/nightshift/universal_assets/citizens/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const summary = [];

for (const [roleName, role] of Object.entries(ROLES)) {
  // Walk sheet
  const walkSheet = generateWalkSheet(role);
  const walkPath = `${outDir}${roleName}_walk.png`;
  const walkPng = encodePNG(256, 256, walkSheet);
  writeFileSync(walkPath, walkPng);
  summary.push(`  ${roleName}_walk.png (${walkPng.length} bytes)`);

  // Actions sheet
  const actionsSheet = generateActionsSheet(role);
  const actionsPath = `${outDir}${roleName}_actions.png`;
  const actionsPng = encodePNG(256, 256, actionsSheet);
  writeFileSync(actionsPath, actionsPng);
  summary.push(`  ${roleName}_actions.png (${actionsPng.length} bytes)`);
}

console.log('Generated citizen sprite sheets (256x256, 4x4 grid of 64x64 frames):');
console.log(summary.join('\n'));
console.log(`\nOutput directory: ${outDir}`);
console.log('Roles: producer (cyan), planner (yellow), reviewer (magenta), coder (blue), tester (green)');
console.log('Walk sheets: 4 rows (down, up, left, right) x 4 walk-cycle frames');
console.log('Action sheets: 4 rows (working, sleeping, talking, idle) x up to 4 frames');
