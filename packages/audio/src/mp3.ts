import { spawnSync } from 'node:child_process';

export interface DecodedMp3 {
  readonly sampleRate: number;
  readonly channels: number;
  /** Interleaved PCM. Real samples when `decoded` is true, else silence of the estimated duration. */
  readonly samples: Float32Array;
  readonly duration: number;
  readonly frames: number;
  /** True when an OS decoder (ffmpeg) produced PCM. */
  readonly decoded: boolean;
}

export type Mp3Spawn = (
  command: string,
  args: readonly string[],
  input: Uint8Array,
) => Uint8Array | null;

export interface DecodeMp3Options {
  /** Injected process runner. Tests stub ffmpeg. */
  spawn?: Mp3Spawn;
}

/** [unused, Layer I, Layer II, Layer III] kbps. */
const BITRATE_V1 = [
  [0, 0, 0, 0],
  [0, 32, 32, 32],
  [0, 64, 48, 40],
  [0, 96, 56, 48],
  [0, 128, 64, 56],
  [0, 160, 80, 64],
  [0, 192, 96, 80],
  [0, 224, 112, 96],
  [0, 256, 128, 112],
  [0, 288, 160, 128],
  [0, 320, 192, 160],
  [0, 352, 224, 192],
  [0, 384, 256, 224],
  [0, 416, 320, 256],
  [0, 448, 384, 320],
  [0, 0, 0, 0],
] as const;

const BITRATE_V2 = [
  [0, 0, 0, 0],
  [0, 32, 8, 8],
  [0, 48, 16, 16],
  [0, 56, 24, 24],
  [0, 64, 32, 32],
  [0, 80, 40, 40],
  [0, 96, 48, 48],
  [0, 112, 56, 56],
  [0, 128, 64, 64],
  [0, 144, 80, 80],
  [0, 160, 96, 96],
  [0, 176, 112, 112],
  [0, 192, 128, 128],
  [0, 224, 144, 144],
  [0, 256, 160, 160],
  [0, 0, 0, 0],
] as const;

const SR_V1 = [44100, 48000, 32000] as const;
const SR_V2 = [22050, 24000, 16000] as const;
const SR_V25 = [11025, 12000, 8000] as const;

export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  return findMpegHeader(bytes, 0) !== undefined;
}

/**
 * Decode MP3 to PCM. Tries `ffmpeg` for real samples; falls back to
 * header-scanned silence when no decoder is available.
 */
export function decodeMp3(buffer: Uint8Array, options: DecodeMp3Options = {}): DecodedMp3 {
  const headers = scanMp3(buffer);
  const spawn =
    options.spawn ??
    (process.env['VITEST'] !== undefined ? (() => null) : defaultFfmpegSpawn);
  const pcm = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-f',
    'f32le',
    '-ac',
    String(headers.channels),
    '-ar',
    String(headers.sampleRate),
    'pipe:1',
  ], buffer);
  if (pcm !== null && pcm.byteLength >= 4) {
    const aligned = pcm.byteLength - (pcm.byteLength % 4);
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, aligned / 4);
    return {
      sampleRate: headers.sampleRate,
      channels: headers.channels,
      samples,
      duration: samples.length / headers.channels / headers.sampleRate,
      frames: headers.frames,
      decoded: true,
    };
  }
  return {
    sampleRate: headers.sampleRate,
    channels: headers.channels,
    samples: new Float32Array(headers.samplesPerChannel * headers.channels),
    duration: headers.samplesPerChannel / headers.sampleRate,
    frames: headers.frames,
    decoded: false,
  };
}

function scanMp3(buffer: Uint8Array): {
  sampleRate: number;
  channels: number;
  frames: number;
  samplesPerChannel: number;
} {
  let offset = skipId3v2(buffer);
  let sampleRate = 0;
  let channels = 0;
  let frames = 0;
  let samplesPerChannel = 0;

  while (offset + 4 <= buffer.byteLength) {
    const header = parseMpegHeader(buffer, offset);
    if (header === undefined) {
      offset += 1;
      continue;
    }
    if (sampleRate === 0) {
      sampleRate = header.sampleRate;
      channels = header.channels;
    }
    frames += 1;
    samplesPerChannel += header.samplesPerFrame;
    offset += header.frameLength;
  }

  if (frames === 0 || sampleRate === 0 || channels === 0) {
    throw new Error('[audio] MP3 payload has no MPEG frames.');
  }
  return { sampleRate, channels, frames, samplesPerChannel };
}

function defaultFfmpegSpawn(command: string, args: readonly string[], input: Uint8Array): Uint8Array | null {
  try {
    const result = spawnSync(command, [...args], {
      input: Buffer.from(input),
      encoding: 'buffer',
      timeout: 8_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error || result.status !== 0 || result.stdout === null) return null;
    const stdout = result.stdout as Buffer;
    return stdout.byteLength > 0 ? new Uint8Array(stdout) : null;
  } catch {
    return null;
  }
}

function skipId3v2(bytes: Uint8Array): number {
  if (bytes.byteLength < 10) return 0;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size =
    ((bytes[6] ?? 0) & 0x7f) * 0x200000 +
    ((bytes[7] ?? 0) & 0x7f) * 0x4000 +
    ((bytes[8] ?? 0) & 0x7f) * 0x80 +
    ((bytes[9] ?? 0) & 0x7f);
  return 10 + size;
}

function findMpegHeader(bytes: Uint8Array, start: number): number | undefined {
  for (let i = start; i + 4 <= bytes.byteLength; i++) {
    if (parseMpegHeader(bytes, i) !== undefined) return i;
  }
  return undefined;
}

interface MpegFrame {
  sampleRate: number;
  channels: number;
  frameLength: number;
  samplesPerFrame: number;
}

function parseMpegHeader(bytes: Uint8Array, offset: number): MpegFrame | undefined {
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return undefined;

  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  if (versionBits === 1 || layerBits === 0) return undefined;

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const srIndex = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;
  if (bitrateIndex === 0 || bitrateIndex === 15 || srIndex === 3) return undefined;

  const mpeg1 = versionBits === 3;
  const mpeg25 = versionBits === 0;
  const sampleRate = (mpeg1 ? SR_V1 : mpeg25 ? SR_V25 : SR_V2)[srIndex];
  if (sampleRate === undefined) return undefined;

  const layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;
  const table = mpeg1 ? BITRATE_V1 : BITRATE_V2;
  const bitrate = table[bitrateIndex]?.[layer] ?? 0;
  if (bitrate === 0) return undefined;

  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : mpeg1 ? 1152 : 576;
  let frameLength: number;
  if (layer === 1) {
    frameLength = Math.floor((12 * bitrate * 1000) / sampleRate + padding) * 4;
  } else {
    const coeff = layer === 3 && !mpeg1 ? 72 : 144;
    frameLength = Math.floor((coeff * bitrate * 1000) / sampleRate) + padding;
  }
  if (frameLength < 4) return undefined;

  const channels = ((b3 >> 6) & 0x03) === 3 ? 1 : 2;
  return { sampleRate, channels, frameLength, samplesPerFrame };
}
