import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, access, constants, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImageFormat } from './formats.js';

/**
 * A single conversion step: bytes in, bytes out. Drivers never touch the
 * filesystem — the pipeline composes steps and handles files.
 */
export interface ConversionStep {
  (bytes: Uint8Array, options: ConvertOptions): Promise<Uint8Array>;
}

export interface ConvertOptions {
  quality?: number;
}

export interface ImageDriver {
  readonly name: string;
  /**
   * Report this driver's codec abilities for the current machine. Called
   * once at startup; a driver that fails its probe is excluded entirely.
   */
  probe(): Promise<DriverCapabilities>;
  /** Convert `bytes` (known to be `from`) into `to`. */
  convert(from: ImageFormat, to: ImageFormat, bytes: Uint8Array, options: ConvertOptions): Promise<Uint8Array>;
}

export interface DriverCapabilities {
  /** Formats this driver can read on this machine. */
  readonly decode: readonly ImageFormat[];
  /** Formats this driver can write on this machine. */
  readonly encode: readonly ImageFormat[];
}

/** Tool available on PATH? (portable across Node and Bun) */
export async function commandExists(command: string): Promise<boolean> {
  const dirs = (process.env['PATH'] ?? '').split(':').filter(Boolean);
  for (const dir of dirs) {
    try {
      await access(join(dir, command), constants.X_OK);
      return true;
    } catch {
      // keep scanning
    }
  }
  return false;
}

/** The Bun global, typed minimally; undefined under Node. */
interface BunRuntime {
  Image?: new (input: Uint8Array) => {
    png(options?: { compressionLevel?: number }): { bytes(): Promise<Uint8Array> };
    jpeg(options?: { quality?: number }): { bytes(): Promise<Uint8Array> };
    webp(options?: { quality?: number }): { bytes(): Promise<Uint8Array> };
  };
}

function bunRuntime(): BunRuntime | undefined {
  return (globalThis as { Bun?: BunRuntime }).Bun;
}

async function runTool(command: string[], stdin?: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command[0]!, command.slice(1), {
      stdio: stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let stderr = '';
    const { stdout, stderr: stderrStream, stdin: stdinStream } = proc;
    if (!stdout || !stderrStream) {
      reject(new Error(`${command[0]}: no stdio`));
      return;
    }
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    stderrStream.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command[0]} failed (exit ${code}): ${stderr.trim().split('\n').at(-1) ?? 'unknown error'}`));
        return;
      }
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    stdinStream?.end(stdin);
  });
}

/**
 * Primary driver: Bun.Image (libjpeg-turbo + spng + libwebp, zero deps).
 * Only active under the Bun runtime; under Node the probe reports nothing.
 * On Linux it reads png/jpeg/webp/gif and writes png/jpeg/webp.
 */
export class BunImageDriver implements ImageDriver {
  readonly name = 'bun';

  async probe(): Promise<DriverCapabilities> {
    const bun = bunRuntime();
    if (bun?.Image === undefined) {
      return { decode: [], encode: [] };
    }
    // Probe with a real 1x1 PNG so a broken native build is detected now,
    // not at first user-visible conversion.
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0),
    );
    try {
      await new bun.Image(png).webp({ quality: 50 }).bytes();
    } catch {
      return { decode: [], encode: [] };
    }
    return {
      decode: ['png', 'jpeg', 'webp', 'gif'],
      encode: ['png', 'jpeg', 'webp'],
    };
  }

  async convert(from: ImageFormat, to: ImageFormat, bytes: Uint8Array, options: ConvertOptions): Promise<Uint8Array> {
    const bun = bunRuntime();
    if (bun?.Image === undefined) {
      throw new Error('[convert-img] bun driver requires the Bun runtime');
    }
    const quality = options.quality ?? 80;
    const image = new bun.Image(bytes);
    switch (to) {
      case 'png':
        return image.png().bytes();
      case 'jpeg':
        return image.jpeg({ quality }).bytes();
      case 'webp':
        return image.webp({ quality }).bytes();
      default:
        throw new Error(`[convert-img] bun driver cannot encode ${to}`);
    }
  }
}

/** libheif tools: heif-convert (decode) + heif-enc (encode). File-based. */
export class HeifDriver implements ImageDriver {
  readonly name = 'heif';

  async probe(): Promise<DriverCapabilities> {
    const hasConvert = await commandExists('heif-convert');
    const hasEnc = await commandExists('heif-enc');
    if (!hasConvert || !hasEnc) return { decode: [], encode: [] };
    return { decode: ['heic', 'avif'], encode: ['heic', 'avif'] };
  }

  async convert(from: ImageFormat, to: ImageFormat, bytes: Uint8Array, options: ConvertOptions): Promise<Uint8Array> {
    const dir = await mkdtemp(join(tmpdir(), 'convert-img-'));
    try {
      const srcExt = from === 'heic' || from === 'heif' || from === 'avif' ? 'heic' : from === 'jpeg' || from === 'jpg' ? 'jpg' : 'png';
      const dstExt = to === 'heic' || to === 'heif' ? 'heic' : to === 'avif' ? 'avif' : to === 'jpeg' || to === 'jpg' ? 'jpg' : 'png';
      const src = join(dir, `src.${srcExt}`);
      const dst = join(dir, `out.${dstExt}`);
      await writeFile(src, bytes);

      if (from === 'heic' || from === 'heif' || from === 'avif') {
        // heif-convert chooses output format by extension.
        await runTool(['heif-convert', src, dst]);
      } else {
        await runTool(['heif-enc', src, dst, '-q', String(options.quality ?? 80)]);
      }
      return new Uint8Array(await readFile(dst));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** ImageMagick: gif encode + a broad fallback for anything else. */
export class MagickDriver implements ImageDriver {
  readonly name = 'magick';

  async probe(): Promise<DriverCapabilities> {
    if (!(await commandExists('magick'))) return { decode: [], encode: [] };
    return {
      decode: ['png', 'jpeg', 'webp', 'gif'],
      encode: ['png', 'jpeg', 'webp', 'gif'],
    };
  }

  async convert(from: ImageFormat, to: ImageFormat, bytes: Uint8Array, options: ConvertOptions): Promise<Uint8Array> {
    void from;
    // ImageMagick reads/writes images on stdio via the bare `magick` command:
    //   magick <input>[-] [-quality N] <output>[-]
    return runTool(
      ['magick', '-', '-quality', String(options.quality ?? 80), `${to === 'jpeg' ? 'jpg' : to}:-`],
      bytes,
    );
  }
}

/** ffmpeg: pipe-based fallback (normalize to png via image2 muxer). */
export class FfmpegDriver implements ImageDriver {
  readonly name = 'ffmpeg';

  async probe(): Promise<DriverCapabilities> {
    if (!(await commandExists('ffmpeg'))) return { decode: [], encode: [] };
    return {
      decode: ['png', 'jpeg', 'webp', 'gif'],
      encode: ['png'],
    };
  }

  async convert(from: ImageFormat, to: ImageFormat, bytes: Uint8Array, options: ConvertOptions): Promise<Uint8Array> {
    void from;
    void options;
    // ffmpeg detects the piped input format; image2 muxer writes png on
    // stdout. The planner only routes to ffmpeg when the target is png —
    // other targets chain from there via a stronger encoder.
    return runTool(
      ['ffmpeg', '-y', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1'],
      bytes,
    );
  }
}
