/**
 * Dependency-free icon generator for Unslop.
 *
 * Produces the raster PNG icons required by the Chrome manifest (16 / 48 / 128)
 * plus a matching set of SVGs. Chrome does not reliably render SVG manifest
 * icons, so the PNGs are the source of truth. PNG encoding uses only Node's
 * built-in `zlib` — no third-party image libraries.
 *
 * Run with: `node scripts/generate-icons.mjs`
 */
import * as zlib from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.resolve(__dirname, '..', 'icons');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Encode an RGBA pixel buffer (length = w*h*4) into a PNG Buffer. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Add a filter byte (0 = none) at the start of every scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/**
 * Render the Unslop mark: a rounded-square brand-gradient background with a
 * white "U" glyph. Everything is computed in normalized coordinates so it
 * scales cleanly to any size.
 */
function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;

  // Brand gradient endpoints (indigo -> violet).
  const top = [99, 102, 241];
  const bottom = [79, 70, 229];

  const inRoundedRect = (x, y) => {
    const min = 0;
    const max = size;
    const rx = Math.min(radius, size / 2);
    let dx = 0;
    let dy = 0;
    if (x < min + rx) dx = min + rx - x;
    else if (x > max - rx) dx = x - (max - rx);
    if (y < min + rx) dy = min + rx - y;
    else if (y > max - rx) dy = y - (max - rx);
    return dx * dx + dy * dy <= rx * rx;
  };

  // "U" geometry (normalized to size).
  const barTop = size * 0.26;
  const barBottomInner = size * 0.58;
  const uBottom = size * 0.72;
  const leftInner = size * 0.36;
  const leftOuter = size * 0.28;
  const rightInner = size * 0.64;
  const rightOuter = size * 0.72;
  const stroke = size * 0.1;

  const inU = (x, y) => {
    // Left vertical bar.
    if (x >= leftOuter && x <= leftOuter + stroke && y >= barTop && y <= uBottom) return true;
    // Right vertical bar.
    if (x >= rightOuter - stroke && x <= rightOuter && y >= barTop && y <= uBottom) return true;
    // Bottom connector.
    if (y >= uBottom - stroke && y <= uBottom && x >= leftOuter && x <= rightOuter) return true;
    // Round the inner bottom corners a touch.
    const cxL = leftOuter + stroke;
    const cxR = rightOuter - stroke;
    const cy = uBottom - stroke;
    if (x <= cxL && y <= cy) {
      const d = Math.hypot(x - cxL, y - cy);
      if (d <= stroke && x >= leftOuter && y >= barBottomInner) return true;
    }
    if (x >= cxR && y <= cy) {
      const d = Math.hypot(x - cxR, y - cy);
      if (d <= stroke && x <= rightOuter && y >= barBottomInner) return true;
    }
    return false;
  };
  void leftInner;
  void rightInner;

  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const bg = [mix(top[0], bottom[0], t), mix(top[1], bottom[1], t), mix(top[2], bottom[2], t)];
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedRect(x + 0.5, y + 0.5)) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
        continue;
      }
      if (inU(x + 0.5, y + 0.5)) {
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        rgba[i + 3] = 255;
      } else {
        rgba[i] = bg[0];
        rgba[i + 1] = bg[1];
        rgba[i + 2] = bg[2];
        rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

function svgFor(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="28" fill="url(#g)"/>
  <path d="M40 34 v46 a24 24 0 0 0 48 0 v-46" fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    const png = encodePng(size, size, renderIcon(size));
    fs.writeFileSync(path.join(ICONS_DIR, `icon${size}.png`), png);
    fs.writeFileSync(path.join(ICONS_DIR, `icon${size}.svg`), svgFor(size));
    process.stdout.write(`generated icon${size}.png (${png.length} bytes) + icon${size}.svg\n`);
  }
  process.stdout.write(`Icons written to ${ICONS_DIR}\n`);
}

main();
