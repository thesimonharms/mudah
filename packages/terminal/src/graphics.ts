import { deflateSync } from 'node:zlib';
import type { OscWriter } from './osc.js';

/**
 * Kitty graphics protocol (APC `_G`): transmit raw pixels and place them
 * in the terminal. Ghostty, Kitty, and WezTerm speak this. Other terminals
 * ignore APC, so a write is safe anywhere.
 *
 * Quiet mode (`q=2`) is always on: the terminal must not reply, so the
 * key parser never sees an APC acknowledgement.
 */

export type PixelFormat = 'rgb' | 'rgba';

export interface KittyImageOptions {
  /** Pixel bytes, tightly packed, row-major, top-left origin. */
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** Default `rgba`. */
  readonly format?: PixelFormat;
  /** Image id (1–4294967295). Reusing an id replaces the previous image. */
  readonly id?: number;
  /** Placement id. Pair with `id` so a later frame replaces this one. */
  readonly placementId?: number;
  /** Compress with zlib before base64. Default true. */
  readonly compress?: boolean;
  /** Scale to this many columns. Kitty preserves aspect if `rows` is omitted. */
  readonly columns?: number;
  /** Scale to this many rows. */
  readonly rows?: number;
  /** Do not move the cursor after placing the image. Default true. */
  readonly stay?: boolean;
}

const CHUNK = 4096;
const ST = '\x1b\\';

function bytesPerPixel(format: PixelFormat): number {
  return format === 'rgb' ? 3 : 4;
}

/** APC wrapper: `ESC _ G <control> ; <payload> ESC \`. */
function apc(control: string, payload = ''): string {
  return `\x1b_G${control};${payload}${ST}`;
}

/**
 * Encode a framebuffer as one or more Kitty graphics sequences.
 * Chunks stay at most 4096 base64 bytes, as the protocol requires.
 */
export function encodeKittyImage(options: KittyImageOptions): string {
  const format = options.format ?? 'rgba';
  const bpp = bytesPerPixel(format);
  const expected = options.width * options.height * bpp;
  if (options.pixels.byteLength < expected) {
    throw new Error(
      `[terminal] Kitty image payload is ${options.pixels.byteLength} bytes, need ${expected} for ${options.width}x${options.height} ${format}.`,
    );
  }

  const raw = options.pixels.subarray(0, expected);
  const compress = options.compress !== false;
  const body = compress ? deflateSync(raw) : Buffer.from(raw);
  const encoded = body.toString('base64');

  const keys: string[] = [
    'a=T',
    `f=${format === 'rgb' ? 24 : 32}`,
    `s=${options.width}`,
    `v=${options.height}`,
    'q=2',
  ];
  if (compress) keys.push('o=z');
  if (options.id !== undefined && options.id > 0) keys.push(`i=${options.id}`);
  if (options.placementId !== undefined && options.placementId > 0) {
    keys.push(`p=${options.placementId}`);
  }
  if (options.columns !== undefined) keys.push(`c=${options.columns}`);
  if (options.rows !== undefined) keys.push(`r=${options.rows}`);
  if (options.stay !== false) keys.push('C=1');

  if (encoded.length <= CHUNK) {
    return apc(keys.join(','), encoded);
  }

  const chunks: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += CHUNK) {
    const slice = encoded.slice(offset, offset + CHUNK);
    const last = offset + CHUNK >= encoded.length;
    if (offset === 0) {
      chunks.push(apc(`${keys.join(',')},m=1`, slice));
    } else {
      chunks.push(apc(`m=${last ? 0 : 1}`, slice));
    }
  }
  // The loop always emits m=1 on the first chunk. If the payload spanned
  // more than two chunks, the last iteration already set m=0. If it spanned
  // exactly two, the second iteration is last and also sets m=0.
  return chunks.join('');
}

/**
 * Delete images. `all` wipes every placement. A numeric `id` deletes that
 * image and its placements.
 */
export function encodeKittyDelete(target: 'all' | { id: number } = 'all'): string {
  if (target === 'all') return apc('a=d,d=A,q=2');
  return apc(`a=d,d=i,i=${target.id},q=2`);
}

/**
 * Place a framebuffer through the Kitty protocol. Reuses `id`/`placementId`
 * so the next call replaces the frame without flicker.
 */
export class KittyGraphics {
  private readonly writer: OscWriter;
  readonly id: number;
  readonly placementId: number;

  constructor(writer: OscWriter, options: { id?: number; placementId?: number } = {}) {
    this.writer = writer;
    this.id = options.id ?? 1;
    this.placementId = options.placementId ?? 1;
  }

  draw(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: Omit<KittyImageOptions, 'pixels' | 'width' | 'height' | 'id' | 'placementId'> = {},
  ): void {
    this.writer.write(
      encodeKittyImage({
        pixels,
        width,
        height,
        id: this.id,
        placementId: this.placementId,
        ...options,
      }),
    );
  }

  /** Remove this image (or every image, when `all` is true). */
  delete(all = false): void {
    this.writer.write(encodeKittyDelete(all ? 'all' : { id: this.id }));
  }
}

/**
 * Encode an RGBA/RGB framebuffer as unicode half-blocks (`▀`). Each cell
 * holds two vertical pixels (foreground = top, background = bottom).
 * Works in any truecolor terminal, including those without Kitty graphics.
 */
export function encodeHalfBlocks(
  pixels: Uint8Array,
  width: number,
  height: number,
  format: PixelFormat = 'rgba',
): string[] {
  const bpp = bytesPerPixel(format);
  const lines: string[] = [];
  const rows = Math.ceil(height / 2);

  for (let cy = 0; cy < rows; cy++) {
    let line = '';
    const yTop = cy * 2;
    const yBot = yTop + 1;
    for (let x = 0; x < width; x++) {
      const top = sample(pixels, width, height, x, yTop, bpp);
      const bot = yBot < height ? sample(pixels, width, height, x, yBot, bpp) : top;
      line += `\x1b[38;2;${top.r};${top.g};${top.b}m\x1b[48;2;${bot.r};${bot.g};${bot.b}m▀`;
    }
    line += '\x1b[0m';
    lines.push(line);
  }
  return lines;
}

function sample(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  bpp: number,
): { r: number; g: number; b: number } {
  if (y >= height) y = height - 1;
  const i = (y * width + x) * bpp;
  return {
    r: pixels[i] ?? 0,
    g: pixels[i + 1] ?? 0,
    b: pixels[i + 2] ?? 0,
  };
}
