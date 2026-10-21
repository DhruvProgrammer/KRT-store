#!/usr/bin/env node
/**
 * KRT store — social preview image generator.
 *
 *   node scripts/og-png.mjs        (or: npm run og)
 *
 * Writes real PNGs (no SVG, no npm deps — node:zlib + node:fs only):
 *   public/og.png              1200x630 default site card
 *   public/og/<slug>.png       1200x630 per product / extra, from that item's own gradient
 *   public/brand/logo-512.png  512x512  brand mark (rounded square + "K")
 *   public/favicon.ico         32x32    real ICO
 *
 * ponytail: text is a hand-drawn 5x7 bitmap font, supersampled 3x. No OS font
 * rendering and no sharp, so the pixels are identical on every machine. The
 * only machine-dependent part is the DEFLATE byte stream, which comes from the
 * zlib build bundled with Node; the decoded pixels never change.
 */

import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC_DIR = join(ROOT, "public");
const OG_DIR = join(PUBLIC_DIR, "og");
const BRAND_DIR = join(PUBLIC_DIR, "brand");

/* ------------------------------------------------------------------ data -- */

let products;
let extras;
try {
  ({ products } = await import("../src/data/products.ts"));
  ({ extras } = await import("../src/data/extras.ts"));
} catch (err) {
  console.error(
    "Could not load src/data/products.ts.\n" +
      "Node >= 22.18 is required (type stripping is unflagged from 22.18)."
  );
  throw err;
}

/* ----------------------------------------------------------------- brand -- */

const INK = [11, 13, 16]; // #0b0d10  site background
const PAPER = [241, 245, 249]; // #f1f5f9  site ink
const ACCENT = [0, 162, 255]; // #00a2ff  site accent
const BRAND_GRADIENT = "linear-gradient(135deg, #1c2738 0%, #0b0d10 100%)";
const BRAND_NAME = "KRT STORE";

/* --------------------------------------------------------------- canvas -- */

class Canvas {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.data = new Float64Array(width * height * 3);
  }

  set(x, y, r, g, b) {
    const i = (y * this.w + x) * 3;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
  }

  /** Multiply a pixel towards `color` by `a` (0..1). */
  shade(x, y, color, a) {
    const i = (y * this.w + x) * 3;
    this.data[i] += (color[0] - this.data[i]) * a;
    this.data[i + 1] += (color[1] - this.data[i + 1]) * a;
    this.data[i + 2] += (color[2] - this.data[i + 2]) * a;
  }

  toRgba() {
    const out = Buffer.alloc(this.w * this.h * 4);
    for (let p = 0; p < this.w * this.h; p++) {
      out[p * 4] = clamp255(this.data[p * 3]);
      out[p * 4 + 1] = clamp255(this.data[p * 3 + 1]);
      out[p * 4 + 2] = clamp255(this.data[p * 3 + 2]);
      out[p * 4 + 3] = 255;
    }
    return out;
  }
}

const clamp255 = (v) => {
  const n = Math.round(v);
  return n < 0 ? 0 : n > 255 ? 255 : n;
};

/* ---------------------------------------------------------- png encoding -- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 8-bit RGBA PNG, filter type 0 on every scanline. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15, strategy: 0 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------ bitmap font -- */

/**
 * Hand-drawn 5x7 dot-matrix font. Uppercase, digits and the punctuation this
 * site actually uses. 7 rows, baseline on the last row, 5 columns per glyph.
 */
const GLYPHS = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["....#", "....#", "....#", "....#", "#...#", "#...#", ".###."],
  K: ["#...#", "#..##", "#.##.", "###..", "#.##.", "#..##", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "#....", "####.", "....#", "#...#", ".###."],
  6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".#..."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "·": [".....", ".....", ".....", ".##..", ".##..", ".....", "....."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "%": ["##...", "##..#", "...#.", "..#..", ".#...", "#..##", "...##"],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

function glyphFor(ch) {
  const g = GLYPHS[ch];
  if (!g) throw new Error(`No bitmap glyph for "${ch}" (U+${ch.codePointAt(0).toString(16)})`);
  return g;
}

/** Width of `text` in font units (5 columns + tracking per glyph). */
function textUnits(text, tracking) {
  if (!text.length) return 0;
  return text.length * (GLYPH_W + tracking) - tracking;
}

function textWidth(text, scale, tracking) {
  return textUnits(text, tracking) * scale;
}

/** Snap to 1/3 px so the 3x supersampling grid lands on the glyph edges. */
const quant = (scale) => Math.max(1 / 3, Math.floor(scale * 3) / 3);

/**
 * Draw `text` with its baseline at `baselineY`, left edge at `x`.
 * Glyph pixels are rasterised at 3x and box-filtered down for antialiasing.
 */
function drawText(cv, text, x, baselineY, scale, tracking, color, alpha = 1) {
  if (!text.length) return 0;
  const s = quant(scale);
  const w = textWidth(text, s, tracking);
  const top = baselineY - GLYPH_H * s;

  const px0 = Math.floor(x);
  const py0 = Math.floor(top);
  const pw = Math.ceil(x + w) - px0;
  const ph = Math.ceil(baselineY) - py0;
  if (pw <= 0 || ph <= 0) return w;

  // 3x coverage mask for the run's bounding box.
  const mw = pw * 3;
  const mh = ph * 3;
  const mask = new Uint8Array(mw * mh);

  let pen = 0;
  for (const raw of text) {
    const ch = raw.toUpperCase();
    const rows = glyphFor(ch);
    const gx = px0 + pen * s;
    for (let ry = 0; ry < GLYPH_H; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < GLYPH_W; rx++) {
        if (row[rx] !== "#") continue;
        const mx0 = Math.round((gx + rx * s - px0) * 3);
        const mx1 = Math.round((gx + (rx + 1) * s - px0) * 3);
        const my0 = Math.round((py0 + ry * s - py0) * 3);
        const my1 = Math.round((py0 + (ry + 1) * s - py0) * 3);
        for (let my = my0; my < my1; my++) {
          const off = my * mw;
          for (let mx = mx0; mx < mx1; mx++) mask[off + mx] = 255;
        }
      }
    }
    pen += GLYPH_W + tracking;
  }

  for (let j = 0; j < ph; j++) {
    for (let i = 0; i < pw; i++) {
      let hits = 0;
      for (let by = 0; by < 3; by++) {
        const off = (j * 3 + by) * mw + i * 3;
        hits += (mask[off] ? 1 : 0) + (mask[off + 1] ? 1 : 0) + (mask[off + 2] ? 1 : 0);
      }
      if (!hits) continue;
      cv.shade(px0 + i, py0 + j, color, (hits / 9) * alpha);
    }
  }
  return w;
}

/* ----------------------------------------------------------------- shapes -- */

/** Fill a rounded rectangle, 3x3 supersampled for a smooth edge. */
function fillRoundRect(cv, x, y, w, h, radius, color, alpha = 1) {
  const r = Math.min(radius, w / 2, h / 2);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(cv.w, Math.ceil(x + w));
  const y1 = Math.min(cv.h, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let hits = 0;
      for (let sy = 0; sy < 3; sy++) {
        const fy = py + (sy + 0.5) / 3;
        for (let sx = 0; sx < 3; sx++) {
          const fx = px + (sx + 0.5) / 3;
          if (insideRoundRect(fx, fy, x, y, w, h, r)) hits++;
        }
      }
      if (hits) cv.shade(px, py, color, (hits / 9) * alpha);
    }
  }
}

function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  if (r <= 0) return true;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRect(cv, x, y, w, h, color, alpha = 1) {
  fillRoundRect(cv, x, y, w, h, 0, color, alpha);
}

/* -------------------------------------------------------------- gradients -- */

function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Parse `linear-gradient(<angle>deg, #aaa 0%, #bbb 100%)`. */
function parseGradient(css) {
  const m = css.match(
    /linear-gradient\(\s*(-?[\d.]+)deg\s*,\s*(#[0-9a-fA-F]{3,8})\s+(\d+(?:\.\d+)?)%\s*,\s*(#[0-9a-fA-F]{3,8})\s+(\d+(?:\.\d+)?)%\s*\)/
  );
  if (!m) throw new Error(`Unsupported gradient: ${css}`);
  return {
    angle: Number(m[1]),
    from: parseHex(m[2]),
    to: parseHex(m[4]),
    fromStop: Number(m[3]) / 100,
    toStop: Number(m[5]) / 100,
  };
}

/**
 * CSS linear-gradient fill, in the CSS coordinate system (0deg = to top,
 * clockwise positive), sampled at pixel centres, interpolated in sRGB.
 */
function paintGradient(cv, grad) {
  const rad = (grad.angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = Math.abs(cv.w * Math.sin(rad)) + Math.abs(cv.h * Math.cos(rad));
  const cx = cv.w / 2;
  const cy = cv.h / 2;
  const sx = cx - (len / 2) * dx;
  const sy = cy - (len / 2) * dy;
  const span = grad.toStop - grad.fromStop || 1;

  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      let t = ((x + 0.5 - sx) * dx + (y + 0.5 - sy) * dy) / len;
      t = (t - grad.fromStop) / span;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      cv.set(x, y,
        grad.from[0] + (grad.to[0] - grad.from[0]) * t,
        grad.from[1] + (grad.to[1] - grad.from[1]) * t,
        grad.from[2] + (grad.to[2] - grad.from[2]) * t
      );
    }
  }
}

/** Vertical dark scrim: alpha ramps from `a0` at `y0` to `a1` at `y1`. */
function paintScrim(cv, y0, y1, a0, a1, color = [9, 11, 15]) {
  for (let y = 0; y < cv.h; y++) {
    let a;
    if (y <= y0) a = a0;
    else if (y >= y1) a = a1;
    else a = a0 + (a1 - a0) * ((y - y0) / (y1 - y0));
    if (a <= 0) continue;
    for (let x = 0; x < cv.w; x++) cv.shade(x, y, color, a);
  }
}

/** Soft radial glow (used on the default card). */
function paintGlow(cv, cx, cy, radius, color, strength) {
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / radius;
      if (d >= 1) continue;
      const a = (1 - d) * (1 - d) * strength;
      cv.shade(x, y, color, a);
    }
  }
}

/* ------------------------------------------------------------- brand mark -- */

/**
 * The "K" mark, matching public/favicon.svg: a rounded blue square with a bold
 * white K. Drawn from three thick strokes in a 100x100 box, so it scales
 * cleanly from 512px down to 32px.
 */
const K_STROKES = [
  [39.2, 32.6, 39.2, 65.4, 6.4], // stem
  [39.2, 50.0, 63.0, 32.6, 6.4], // upper arm
  [39.2, 50.0, 63.0, 65.4, 6.4], // lower arm
];

function insideK(fx, fy) {
  for (const [x0, y0, x1, y1, w] of K_STROKES) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((fx - x0) * dx + (fy - y0) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x0 + t * dx;
    const py = y0 + t * dy;
    if ((fx - px) ** 2 + (fy - py) ** 2 <= (w / 2) ** 2) return true;
  }
  return false;
}

/** Paint the brand mark; `size` is the square's edge in px. */
function drawBrandMark(cv, x, y, size) {
  const u = size / 100;
  const r = 20 * u; // rx=20 in the 100x100 viewBox
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(cv.w, Math.ceil(x + size));
  const y1 = Math.min(cv.h, Math.ceil(y + size));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let square = 0;
      let k = 0;
      for (let sy = 0; sy < 3; sy++) {
        const fy = py + (sy + 0.5) / 3;
        for (let sx = 0; sx < 3; sx++) {
          const fx = px + (sx + 0.5) / 3;
          if (insideRoundRect(fx, fy, x, y, size, size, r)) square++;
          if (insideK((fx - x) / u, (fy - y) / u)) k++;
        }
      }
      if (square) cv.shade(px, py, ACCENT, square / 9);
      if (k) cv.shade(px, py, PAPER, k / 9);
    }
  }
}

/* --------------------------------------------------------------- text fit -- */

const clean = (s) => s.replace(/-/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

function wrapWords(words, scale, tracking, maxWidth) {
  const lines = [];
  let cur = "";
  for (const word of words) {
    const cand = cur ? `${cur} ${word}` : word;
    if (cur && textWidth(cand, scale, tracking) > maxWidth) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Fit `text` into `maxWidth`, wrapping to at most `maxLines` lines. */
function fitTitle(text, maxWidth, maxScale, tracking, maxLines) {
  const words = text.split(" ").filter(Boolean);
  let scale = maxScale;
  for (let i = 0; i < 24; i++) {
    const lines = wrapWords(words, scale, tracking, maxWidth);
    if (lines.length <= maxLines) return { lines, scale: quant(scale) };
    scale *= 0.92;
  }
  return { lines: wrapWords(words, scale, tracking, maxWidth), scale: quant(scale) };
}

/* ------------------------------------------------------------- card build -- */

const CARD_W = 1200;
const CARD_H = 630;
const MARGIN = 88;
const RIGHT = CARD_W - MARGIN;
const CONTENT_W = RIGHT - MARGIN;

/**
 * A card: the item's own gradient as the background, a dark scrim under the
 * type, the name in large type, a tag chip, and the brand mark.
 */
function buildCard({ gradient, title, chip, muted, meta }) {
  const cv = new Canvas(CARD_W, CARD_H);
  paintGradient(cv, parseGradient(gradient));

  const maxLines = 2;
  const { lines, scale } = fitTitle(title, CONTENT_W, 12, 1, maxLines);
  const capH = GLYPH_H * scale;
  const lineHeight = capH * 1.18;
  const baseline = 392;
  const capTop = baseline - capH - (lines.length - 1) * lineHeight;

  // Scrim: ramps to full strength just above the type so white text is
  // always legible over any gradient in the catalogue.
  const scrimEnd = Math.max(150, capTop - 20);
  const scrimStart = Math.max(0, scrimEnd - 120);
  paintScrim(cv, scrimStart, scrimEnd, 0, 0.68);

  // Accent rule above the title.
  fillRect(cv, MARGIN, capTop - 34, 64, 6, ACCENT, 1);

  // Title.
  lines.forEach((line, i) => {
    const b = baseline - (lines.length - 1 - i) * lineHeight;
    drawText(cv, line, MARGIN, b, scale, 1, PAPER, 1);
  });

  // Tag chip + category line.
  const chipTop = 424;
  const chipH = 48;
  const chipScale = 2.6;
  const chipW = textWidth(chip, chipScale, 1) + 44;
  fillRoundRect(cv, MARGIN, chipTop, chipW, chipH, chipH / 2, PAPER, 1);
  drawText(cv, chip, MARGIN + 22, chipTop + 15 + GLYPH_H * chipScale, chipScale, 1, INK, 1);

  if (muted) {
    const mx = MARGIN + chipW + 24;
    const mb = chipTop + 15 + GLYPH_H * chipScale;
    drawText(cv, muted, mx, mb, chipScale, 1, PAPER, 0.9);
  }

  // Hairline.
  fillRect(cv, MARGIN, 512, CONTENT_W, 2, PAPER, 0.22);

  // Brand row: mark + wordmark on the left, meta on the right.
  const logoSize = 46;
  const logoY = 534;
  drawBrandMark(cv, MARGIN, logoY, logoSize);
  const brandScale = 3;
  const brandBase = logoY + (logoSize - GLYPH_H * brandScale) / 2 + GLYPH_H * brandScale;
  drawText(cv, BRAND_NAME, MARGIN + logoSize + 20, brandBase, brandScale, 2, PAPER, 1);

  if (meta) {
    const metaScale = 2.4;
    const metaW = textWidth(meta, metaScale, 1);
    drawText(cv, meta, RIGHT - metaW, brandBase, metaScale, 1, PAPER, 0.72);
  }

  return cv;
}

/** The default site card: brand gradient, mark, wordmark, tagline. */
function buildDefaultCard() {
  const cv = new Canvas(CARD_W, CARD_H);
  paintGradient(cv, parseGradient(BRAND_GRADIENT));
  paintGlow(cv, 1000, 110, 460, ACCENT, 0.2);
  paintScrim(cv, 120, 300, 0, 0.45);

  fillRect(cv, MARGIN, 150, 72, 6, ACCENT, 1);
  drawBrandMark(cv, MARGIN, 186, 104);

  const titleScale = 12;
  drawText(cv, BRAND_NAME, MARGIN, 392, titleScale, 1, PAPER, 1);

  drawText(cv, "PREMIUM TOOLS AND FREE EXTRAS", MARGIN, 448, 3.6, 1, PAPER, 0.92);

  fillRect(cv, MARGIN, 486, CONTENT_W, 2, PAPER, 0.2);

  drawText(cv, "PLUGINS · TEMPLATES · DESIGN SYSTEMS · ICON PACKS", MARGIN, 528, 2.8, 1, PAPER, 0.66);

  return cv;
}

/* ------------------------------------------------------------------- ico -- */

/** 32x32 ICO holding a 32-bit BMP (the classic, universally supported form). */
function buildIco(pixels, size) {
  const xorSize = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const andSize = maskStride * size;

  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0); // header size
  dib.writeInt32LE(size, 4); // width
  dib.writeInt32LE(size * 2, 8); // height: XOR image + AND mask
  dib.writeUInt16LE(1, 12); // planes
  dib.writeUInt16LE(32, 14); // bits per pixel
  dib.writeUInt32LE(0, 16); // compression: BI_RGB
  dib.writeUInt32LE(xorSize + andSize, 20);

  const xor = Buffer.alloc(xorSize);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4; // bottom-up
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      const d = (y * size + x) * 4;
      xor[d] = pixels[s + 2]; // B
      xor[d + 1] = pixels[s + 1]; // G
      xor[d + 2] = pixels[s]; // R
      xor[d + 3] = pixels[s + 3]; // A
    }
  }

  const image = Buffer.concat([dib, xor, Buffer.alloc(andSize)]);

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = size; // width (0 means 256)
  entry[1] = size; // height
  entry[2] = 0; // palette size
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(22, 12); // offset of the image data

  return Buffer.concat([header, entry, image]);
}

/* -------------------------------------------------------------- validation -- */

/** Re-read a PNG and assert it is structurally valid. */
function validatePng(buf, expectW, expectH) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error("bad PNG signature");
  }

  let off = 8;
  let ihdr = null;
  let idat = null;
  const chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    const calc = crc32(buf.subarray(off + 4, off + 8 + len));
    if (crc !== calc) throw new Error(`CRC mismatch in ${type} chunk`);
    chunks.push(type);
    if (type === "IHDR") ihdr = data;
    if (type === "IDAT") idat = idat ? Buffer.concat([idat, data]) : Buffer.from(data);
    off += 12 + len;
  }
  if (off !== buf.length) throw new Error("trailing bytes after IEND");
  if (!ihdr) throw new Error("missing IHDR");

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colorType = ihdr[9];
  if (width !== expectW || height !== expectH) {
    throw new Error(`expected ${expectW}x${expectH}, got ${width}x${height}`);
  }
  if (depth !== 8) throw new Error(`expected bit depth 8, got ${depth}`);
  if (colorType !== 6) throw new Error(`expected colour type 6 (RGBA), got ${colorType}`);
  if (ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] !== 0) throw new Error("bad IHDR flags");

  const raw = inflateSync(idat);
  const stride = width * 4;
  const expected = height * (1 + stride);
  if (raw.length !== expected) {
    throw new Error(`IDAT inflated to ${raw.length} bytes, expected ${expected}`);
  }
  for (let y = 0; y < height; y++) {
    if (raw[y * (stride + 1)] !== 0) throw new Error(`scanline ${y} is not filter 0`);
  }
  if (chunks[0] !== "IHDR" || chunks[chunks.length - 1] !== "IEND") {
    throw new Error("chunk order is wrong");
  }
  return { width, height, depth, colorType, idatBytes: idat.length, chunks };
}

/** Re-read an ICO and assert the header + embedded DIB are sane. */
function validateIco(buf, expectSize) {
  if (buf.readUInt16LE(0) !== 0) throw new Error("bad ICONDIR reserved field");
  if (buf.readUInt16LE(2) !== 1) throw new Error("bad ICONDIR type (want 1 = icon)");
  const count = buf.readUInt16LE(4);
  if (count !== 1) throw new Error(`expected 1 icon, got ${count}`);
  const w = buf[6];
  const h = buf[7];
  const planes = buf.readUInt16LE(10);
  const bpp = buf.readUInt16LE(12);
  const bytes = buf.readUInt32LE(14);
  const offset = buf.readUInt32LE(18);
  if (w !== expectSize || h !== expectSize) throw new Error(`bad icon size ${w}x${h}`);
  if (planes !== 1 || bpp !== 32) throw new Error("bad icon planes/bitcount");
  if (offset + bytes !== buf.length) throw new Error("icon image offset/size mismatch");
  const dib = buf.subarray(offset);
  if (dib.readUInt32LE(0) !== 40) throw new Error("bad BITMAPINFOHEADER");
  if (dib.readInt32LE(4) !== expectSize) throw new Error("bad DIB width");
  if (dib.readInt32LE(8) !== expectSize * 2) throw new Error("bad DIB height");
  return { w, h, bpp, bytes };
}

/* ------------------------------------------------------------------ main -- */

function writePng(path, cv, expectW, expectH) {
  const buf = encodePng(cv.w, cv.h, cv.toRgba());
  writeFileSync(path, buf);
  const back = readFileSync(path);
  const info = validatePng(back, expectW, expectH);
  return { bytes: back.length, info };
}

function main() {
  mkdirSync(OG_DIR, { recursive: true });
  mkdirSync(BRAND_DIR, { recursive: true });

  const written = [];
  const expected = new Set();

  // Default site card.
  const def = writePng(join(PUBLIC_DIR, "og.png"), buildDefaultCard(), CARD_W, CARD_H);
  written.push({ file: "public/og.png", ...def });
  console.log(
    `public/og.png  ${String(def.bytes).padStart(7)} B  ${def.info.width}x${def.info.height} ` +
      `depth=${def.info.depth} rgba=${def.info.colorType} idat=${def.info.idatBytes}B  OK`
  );

  // One card per product and per extra, from that item's own gradient.
  for (const p of products) {
    const cv = buildCard({
      gradient: p.gradient,
      title: p.name,
      chip: clean(p.tag),
      muted: clean(p.category),
      meta: `$${p.price} · ${p.version.toUpperCase()}`,
    });
    const name = `${p.slug}.png`;
    const res = writePng(join(OG_DIR, name), cv, CARD_W, CARD_H);
    written.push({ file: `public/og/${name}`, ...res });
    expected.add(name);
    console.log(
      `public/og/${name}  ${String(res.bytes).padStart(7)} B  ${res.info.width}x${res.info.height} ` +
        `depth=${res.info.depth} rgba=${res.info.colorType} idat=${res.info.idatBytes}B  OK`
    );
  }

  for (const e of extras) {
    const cv = buildCard({
      gradient: e.gradient,
      title: e.name,
      chip: clean(e.tag),
      muted: clean(e.category),
      meta: `${clean(e.format)} · ${e.size.toUpperCase()}`,
    });
    const name = `${e.slug}.png`;
    const res = writePng(join(OG_DIR, name), cv, CARD_W, CARD_H);
    written.push({ file: `public/og/${name}`, ...res });
    expected.add(name);
    console.log(
      `public/og/${name}  ${String(res.bytes).padStart(7)} B  ${res.info.width}x${res.info.height} ` +
        `depth=${res.info.depth} rgba=${res.info.colorType} idat=${res.info.idatBytes}B  OK`
    );
  }

  // Brand mark (512) and favicon (32).
  const mark = new Canvas(512, 512);
  drawBrandMark(mark, 0, 0, 512);
  const logo = writePng(join(BRAND_DIR, "logo-512.png"), mark, 512, 512);
  written.push({ file: "public/brand/logo-512.png", ...logo });
  console.log(
    `public/brand/logo-512.png  ${String(logo.bytes).padStart(7)} B  ${logo.info.width}x${logo.info.height} ` +
      `depth=${logo.info.depth} rgba=${logo.info.colorType} idat=${logo.info.idatBytes}B  OK`
  );

  const icoCanvas = new Canvas(32, 32);
  drawBrandMark(icoCanvas, 0, 0, 32);
  const icoPath = join(PUBLIC_DIR, "favicon.ico");
  writeFileSync(icoPath, buildIco(icoCanvas.toRgba(), 32));
  const ico = validateIco(readFileSync(icoPath), 32);
  written.push({ file: "public/favicon.ico", bytes: readFileSync(icoPath).length });
  console.log(
    `public/favicon.ico  ${String(readFileSync(icoPath).length).padStart(7)} B  ` +
      `${ico.w}x${ico.h} ${ico.bpp}bpp image=${ico.bytes}B  OK`
  );

  // Stale files in public/og/ ?
  const stale = readdirSync(OG_DIR).filter((f) => !expected.has(f));
  for (const f of stale) {
    rmSync(join(OG_DIR, f));
    console.log(`removed stale public/og/${f}`);
  }
  if (!stale.length) console.log("public/og/ has no stale files");

  const total = written.reduce((sum, w) => sum + w.bytes, 0);
  console.log(`\n${written.length} files, ${total} bytes total`);
}

main();
