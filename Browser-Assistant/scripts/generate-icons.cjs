// Professional extension icon generator (no external dependencies).
// Renders a rounded-square badge with a diagonal indigo→blue gradient and a
// white "sparkle" mark (matching the in-app SparkleIcon brand), supersampled
// for smooth anti-aliased edges and transparent corners.
//
// Run: node scripts/generate-icons.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SS = 4; // supersampling factor

// Brand gradient (top-left → bottom-right)
const C0 = [99, 102, 241]; // indigo-500  #6366F1
const C1 = [37, 99, 235]; // blue-600    #2563EB
const WHITE = [255, 255, 255];

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Rounded-square coverage (full-bleed with corner radius r), coords in 0..1.
function insideRoundedSquare(x, y, r) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

// 4-cusp sparkle (astroid): concave star pointing along the axes.
function insideSparkle(x, y, cx, cy, r) {
  const u = Math.abs(x - cx) / r;
  const v = Math.abs(y - cy) / r;
  if (u > 1 || v > 1) return false;
  return Math.sqrt(u) + Math.sqrt(v) <= 1;
}

// Returns [r,g,b,a] for a normalized point.
function sample(x, y) {
  if (!insideRoundedSquare(x, y, 0.24)) return [0, 0, 0, 0];

  // White sparkles knocked over the gradient background.
  const bigSparkle = insideSparkle(x, y, 0.45, 0.46, 0.3);
  const smallSparkle = insideSparkle(x, y, 0.74, 0.72, 0.13);
  if (bigSparkle || smallSparkle) return [...WHITE, 255];

  const t = (x + y) / 2; // diagonal gradient
  return [...lerp(C0, C1, t), 255];
}

function renderRGBA(size) {
  const hi = size * SS;
  const out = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) / hi;
          const y = (py * SS + sy + 0.5) / hi;
          const [sr, sg, sb, sa] = sample(x, y);
          const af = sa / 255;
          r += sr * af; // premultiply for correct edge blending
          g += sg * af;
          b += sb * af;
          a += sa;
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const af = alpha > 0 ? alpha / 255 : 0;
      const idx = (py * size + px) * 4;
      out[idx] = af > 0 ? Math.round(r / n / af) : 0; // un-premultiply
      out[idx + 1] = af > 0 ? Math.round(g / n / af) : 0;
      out[idx + 2] = af > 0 ? Math.round(b / n / af) : 0;
      out[idx + 3] = Math.round(alpha);
    }
  }
  return out;
}

// ── Minimal RGBA PNG encoder ────────────────────────────────────
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * size * 4 + size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter byte
    rgba.copy(raw, o, y * size * 4, (y + 1) * size * 4);
    o += size * 4;
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = encodePNG(size, renderRGBA(size));
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`✓ icon${size}.png (${png.length} bytes)`);
}
console.log('Icons generated.');
