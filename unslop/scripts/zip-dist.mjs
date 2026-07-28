/**
 * Zips the `dist/` directory into a Chrome Web Store–ready archive.
 *
 * The output is `dist/unslop-v{version}.zip` where version is read from
 * `manifest.json` inside `dist/`.  This keeps the archive name stable and
 * matches the version Chrome will install.
 *
 * Run with: `npm run build:zip`
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream, createWriteStream } from 'node:fs';
import { deflate } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, 'dist');

// ---------------------------------------------------------------------------
// Minimal ZIP file writer (no dependencies).
// Produces a valid ZIP64-free archive suitable for CWS upload.
// ---------------------------------------------------------------------------

function utf8(str) {
  return Buffer.from(str, 'utf-8');
}

function uint16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function uint32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function crc32(buf) {
  let c = 0xffffffff;
  const table = crc32.table;
  if (!table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let x = n;
      for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
      crc32.table[n] = x >>> 0;
    }
  }
  for (let i = 0; i < buf.length; i++) {
    c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
crc32.table = null;

/**
 * Recursively collect all files in `dir`, returning entries with their
 * relative paths (forward-slash) and file buffers.
 */
function collectFiles(dir, base = '') {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...collectFiles(full, rel));
    } else {
      entries.push({ rel, data: fs.readFileSync(full) });
    }
  }
  return entries;
}

function buildZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = utf8(file.rel);
    const data = file.data;
    const crc = crc32(data);

    // Local file header (30 + name)
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);  // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(0, 8);            // compression: stored
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0, 12);           // mod date
    local.writeUInt32LE(crc, 14);         // crc32
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // name length
    local.writeUInt16LE(0, 28);           // extra field length
    nameBuf.copy(local, 30);

    localHeaders.push(Buffer.concat([local, data]));
    const localSize = local.length + data.length;

    // Central directory header (46 + name)
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed
    central.writeUInt16LE(0, 8);            // flags
    central.writeUInt16LE(0, 10);           // compression
    central.writeUInt16LE(0, 12);           // mod time
    central.writeUInt16LE(0, 14);           // mod date
    central.writeUInt32LE(crc, 16);         // crc32
    central.writeUInt32LE(data.length, 20); // compressed
    central.writeUInt32LE(data.length, 24); // uncompressed
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);           // extra
    central.writeUInt16LE(0, 32);           // comment
    central.writeUInt16LE(0, 34);           // disk start
    central.writeUInt16LE(0, 36);           // internal attr
    central.writeUInt32LE(0, 38);           // external attr
    central.writeUInt32LE(offset, 42);      // offset to local header
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += localSize;
  }

  const centralDirOffset = offset;
  const centralDirBuf = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuf.length;

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // disk number
  eocd.writeUInt16LE(0, 6);              // disk with central dir
  eocd.writeUInt16LE(files.length, 8);   // entries on this disk
  eocd.writeUInt16LE(files.length, 10);  // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipName = `unslop-v${version}.zip`;
const zipPath = path.join(DIST, zipName);

const files = collectFiles(DIST)
  .filter((f) => !f.rel.endsWith('.map'))   // no sourcemaps in upload
  .filter((f) => f.rel !== zipName);         // don't include self

const zip = buildZip(files);
fs.writeFileSync(zipPath, zip);

process.stdout.write(
  `Wrote ${zipPath} (${(zip.length / 1024).toFixed(1)} KB, ${files.length} files)\n`,
);
