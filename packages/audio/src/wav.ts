import type { AudioClip } from './types.js';

const RIFF = 0x46464952;
const WAVE = 0x45564157;
const FMT = 0x20746d66;
const DATA = 0x61746164;

/**
 * Decode a PCM 16-bit little-endian WAV. Other encodings throw.
 */
export function decodeWav(bytes: Uint8Array): AudioClip {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buf);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== RIFF || view.getUint32(8, true) !== WAVE) {
    throw new Error('[audio] WAV payload is not a RIFF/WAVE file.');
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let audioFormat = 0;
  let data: Uint8Array | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const id = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.byteLength) throw new Error('[audio] WAV chunk overruns the buffer.');

    if (id === FMT) {
      audioFormat = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bits = view.getUint16(start + 14, true);
    } else if (id === DATA) {
      data = new Uint8Array(buf, start, size);
    }
    offset = end + (size % 2);
  }

  if (audioFormat !== 1) throw new Error('[audio] WAV encoding is not PCM (format 1).');
  if (bits !== 16) throw new Error(`[audio] WAV bits-per-sample is ${bits}, need 16.`);
  if (channels < 1) throw new Error('[audio] WAV has no channels.');
  if (data === undefined) throw new Error('[audio] WAV has no data chunk.');

  const samples = new Int16Array(data.byteLength / 2);
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < samples.length; i++) samples[i] = dataView.getInt16(i * 2, true);

  return { samples, sampleRate, channels };
}

/** Encode PCM 16-bit little-endian WAV. Used by tests and one-shot helpers. */
export function encodeWav(clip: AudioClip): Uint8Array {
  const dataBytes = clip.samples.byteLength;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);
  const blockAlign = clip.channels * 2;
  const byteRate = clip.sampleRate * blockAlign;

  view.setUint32(0, RIFF, true);
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint32(8, WAVE, true);
  view.setUint32(12, FMT, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, clip.channels, true);
  view.setUint32(24, clip.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, DATA, true);
  view.setUint32(40, dataBytes, true);
  out.set(new Uint8Array(clip.samples.buffer, clip.samples.byteOffset, dataBytes), 44);
  return out;
}
