import { deflateSync } from 'node:zlib';

const PNG_SIG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const CRC_TABLE = makeCrcTable();

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, false);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.byteLength;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const tag = new Uint8Array(4);
  for (let i = 0; i < 4; i++) tag[i] = type.charCodeAt(i);
  const body = concat([tag, data]);
  return concat([u32(data.byteLength), body, u32(crc32(body))]);
}

/**
 * Encode tightly packed RGBA8 pixels as an uncompressed-filter PNG
 * (IHDR + zlib IDAT + IEND). Filter byte 0 on every scanline.
 */
export function capturePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (width < 1 || height < 1) {
    throw new Error(`[vgpu] capturePng needs a positive size, got ${width}x${height}.`);
  }
  const expected = width * height * 4;
  if (rgba.byteLength < expected) {
    throw new Error(`[vgpu] RGBA buffer is ${rgba.byteLength} bytes, need ${expected}.`);
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const dest = y * (1 + stride);
    raw[dest] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), dest + 1);
  }

  return concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]);
}
