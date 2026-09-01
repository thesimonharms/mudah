import { describe, expect, it } from 'vitest';
import { AudioOut, decodeMp3, looksLikeMp3 } from '@mudah-cli/audio';

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo, no padding. Frame length 417. */
function mpegFrame(): Uint8Array {
  const frame = new Uint8Array(417);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  frame[3] = 0x00;
  return frame;
}

function id3v2(size: number): Uint8Array {
  const header = new Uint8Array(10 + size);
  header[0] = 0x49;
  header[1] = 0x44;
  header[2] = 0x33;
  header[9] = size & 0x7f;
  return header;
}

describe('decodeMp3', () => {
  it('scans frame headers and returns silence of the estimated duration', () => {
    const buffer = new Uint8Array(417 * 2);
    buffer.set(mpegFrame(), 0);
    buffer.set(mpegFrame(), 417);
    expect(looksLikeMp3(buffer)).toBe(true);
    const decoded = decodeMp3(buffer);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels).toBe(2);
    expect(decoded.frames).toBe(2);
    expect(decoded.samples.length).toBe(2 * 1152 * 2);
    expect(decoded.duration).toBeCloseTo((2 * 1152) / 44100);
    expect(decoded.samples.every((s) => s === 0)).toBe(true);
  });

  it('skips an ID3v2 tag', () => {
    const tag = id3v2(16);
    const buffer = new Uint8Array(tag.byteLength + 417);
    buffer.set(tag, 0);
    buffer.set(mpegFrame(), tag.byteLength);
    const decoded = decodeMp3(buffer);
    expect(decoded.frames).toBe(1);
    expect(looksLikeMp3(buffer)).toBe(true);
  });

  it('rejects a buffer with no MPEG frames', () => {
    expect(() => decodeMp3(Uint8Array.of(1, 2, 3, 4))).toThrow(/MPEG/);
  });

  it('plays through AudioOut as a silent clip', async () => {
    const out = await AudioOut.open({ backend: 'silent', channels: 2 });
    try {
      const buffer = mpegFrame();
      await out.play(buffer);
      expect(out.bytesWritten).toBe(1152 * 2 * 2);
    } finally {
      out.dispose();
    }
  });
});
