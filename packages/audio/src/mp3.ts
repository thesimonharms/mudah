export interface DecodedMp3 {
  readonly sampleRate: number;
  readonly channels: number;
  /** Interleaved PCM. Silence of the estimated duration (header-only decode). */
  readonly samples: Float32Array;
  readonly duration: number;
  readonly frames: number;
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
 * Scan MPEG frame headers and return silence PCM whose length matches the
 * estimated duration. A full Huffman decoder is out of scope; duration and
 * format come from the headers.
 */
export function decodeMp3(buffer: Uint8Array): DecodedMp3 {
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

  const samples = new Float32Array(samplesPerChannel * channels);
  return {
    sampleRate,
    channels,
    samples,
    duration: samplesPerChannel / sampleRate,
    frames,
  };
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
