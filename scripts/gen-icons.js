#!/usr/bin/env node
/**
 * Pure Node.js PNG icon generator for Earth Day Everyday PWA.
 * No external dependencies — uses built-in `zlib` only.
 */
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Brand colours ─────────────────────────────────────────────────────────────
const BG   = [0x2d, 0x6a, 0x4f, 0xff]; // #2d6a4f  brand green
const FG   = [0xff, 0xff, 0xff, 0xff]; // white
const LITE = [0x52, 0xb7, 0x88, 0xff]; // #52b788  light green

// ── PNG encoder ───────────────────────────────────────────────────────────────
function crc32(buf) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const len  = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc  = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}
function encodePNG(pixels, w, h) {
    const rows = [];
    for (let y = 0; y < h; y++) {
        rows.push(0);
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            rows.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
        }
    }
    const idat = zlib.deflateSync(Buffer.from(rows), { level: 9 });
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9); // RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
    ]);
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function setPixel(buf, w, x, y, rgba, alpha = 1) {
    if (x < 0 || y < 0 || x >= w || y >= w) return;
    const i = (y * w + x) * 4;
    const sa = (rgba[3] / 255) * alpha;
    const da = buf[i+3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa < 0.001) return;
    buf[i]   = Math.round((rgba[0] * sa + buf[i]   * da * (1 - sa)) / oa);
    buf[i+1] = Math.round((rgba[1] * sa + buf[i+1] * da * (1 - sa)) / oa);
    buf[i+2] = Math.round((rgba[2] * sa + buf[i+2] * da * (1 - sa)) / oa);
    buf[i+3] = Math.round(oa * 255);
}

function fillRRect(buf, w, x, y, rw, rh, r, rgba) {
    for (let py = y; py < y + rh; py++) {
        for (let px = x; px < x + rw; px++) {
            const cx = Math.max(x + r, Math.min(x + rw - r, px));
            const cy = Math.max(y + r, Math.min(y + rh - r, py));
            const d  = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
            const a  = Math.max(0, Math.min(1, r + 0.5 - d));
            if (a > 0) setPixel(buf, w, px, py, rgba, a);
        }
    }
}

function drawLeaf(buf, w, cx, cy, size, rgba) {
    // Rotated ellipse (45° leaf)
    const a = size * 0.46, b = size * 0.21;
    const cos = Math.cos(Math.PI / 4), sin = Math.sin(Math.PI / 4);
    const rng = Math.ceil(a) + 2;
    for (let dy = -rng; dy <= rng; dy++) {
        for (let dx = -rng; dx <= rng; dx++) {
            const lx =  dx * cos + dy * sin;
            const ly = -dx * sin + dy * cos;
            const v  = (lx / a) ** 2 + (ly / b) ** 2;
            const alpha = Math.max(0, Math.min(1, (1 - v) * 10));
            if (alpha > 0) setPixel(buf, w, cx + dx, cy + dy, rgba, alpha);
        }
    }
    // Midrib (vein line)
    const steps = Math.round(size * 0.7);
    const t0 = size * 0.28, thick = Math.max(1, size * 0.022);
    for (let i = 0; i < steps; i++) {
        const t   = (i / steps - 0.5) * 2; // -1..1
        const ox  = t * size * 0.38 * cos - 0 * sin;
        const oy  = t * size * 0.38 * sin + 0 * cos;
        for (let k = -Math.ceil(thick); k <= Math.ceil(thick); k++) {
            const a2 = Math.max(0, 1 - Math.abs(k) / (thick + 0.5)) * 0.45;
            setPixel(buf, w, Math.round(cx + ox + k * cos), Math.round(cy + oy + k * sin),
                [0x2d, 0x6a, 0x4f, 0xff], a2);
        }
    }
    // Stem
    const sLen = size * 0.28;
    for (let i = 0; i < Math.round(sLen); i++) {
        const t = i / Math.round(sLen);
        const sx = Math.round(cx + t * sLen * 0.6);
        const sy = Math.round(cy + size * 0.18 + t * sLen * 0.6);
        for (let k = -Math.ceil(thick); k <= Math.ceil(thick); k++) {
            const a2 = Math.max(0, 1 - Math.abs(k) / (thick + 0.5));
            setPixel(buf, w, sx + k, sy, rgba, a2 * 0.9);
        }
    }
}

// ── Render one icon ───────────────────────────────────────────────────────────
function renderIcon(size, maskable = false) {
    const buf = new Uint8Array(size * size * 4);
    const pad = maskable ? 0 : 0; // bg fills full square for safe-area compatibility
    fillRRect(buf, size, pad, pad, size - 2*pad, size - 2*pad,
              size * (maskable ? 0 : 0.22), BG);

    // Subtle top-left highlight
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const d = Math.sqrt(x**2 + y**2);
        const a = Math.max(0, (1 - d / (size * 0.7)) * 0.14);
        if (a > 0) setPixel(buf, size, x, y, [255, 255, 255, 255], a);
    }

    // Leaf centred slightly above-centre
    drawLeaf(buf, size, Math.round(size * 0.5), Math.round(size * 0.46), size * 0.46, FG);

    // Accent dots
    const dr = Math.max(1.2, size * 0.024);
    [[0.73, 0.70, 0.65], [0.27, 0.75, 0.50], [0.66, 0.30, 0.40]].forEach(([fx, fy, a]) => {
        const r = dr * a;
        const R = Math.ceil(r) + 1;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
            const d  = Math.sqrt(dx**2 + dy**2);
            const aa = Math.max(0, Math.min(1, r + 0.5 - d));
            if (aa > 0) setPixel(buf, size,
                Math.round(size * fx + dx), Math.round(size * fy + dy),
                LITE, aa * 0.7);
        }
    });

    return encodePNG(buf, size, size);
}

// ── Generate ──────────────────────────────────────────────────────────────────
const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

[
    [16,  'favicon-16.png',           false],
    [32,  'favicon-32.png',           false],
    [180, 'apple-touch-icon.png',     false],
    [192, 'icon-192.png',             false],
    [192, 'icon-192-maskable.png',    true],
    [512, 'icon-512.png',             false],
    [512, 'icon-512-maskable.png',    true],
].forEach(([size, file, maskable]) => {
    fs.writeFileSync(path.join(OUT, file), renderIcon(size, maskable));
    console.log(`  ✓ icons/${file}  (${size}×${size}${maskable ? ' maskable' : ''})`);
});
console.log('\nDone — 7 icons generated.');
