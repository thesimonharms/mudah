import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  AudioOut,
  decodeWav,
  detectAudio,
  encodeWav,
  findSpawnTool,
  silentRequested,
  spawnCommand,
} from '@mudah-cli/audio';

describe('detectAudio', () => {
  it('picks silent when MUDAH_NO_AUDIO=1', () => {
    const detected = detectAudio({ MUDAH_NO_AUDIO: '1', PATH: '' });
    expect(detected.backend).toBe('silent');
  });

  it('picks silent when CI is set', () => {
    expect(silentRequested({ CI: 'true' })).toBe(true);
    expect(silentRequested({ CI: 'false' })).toBe(false);
    expect(detectAudio({ CI: '1', PATH: '' }).backend).toBe('silent');
  });

  it('returns no spawn tool when PATH is empty', () => {
    expect(findSpawnTool([])).toBeUndefined();
  });
});

describe('spawnCommand', () => {
  it('builds pw-play raw stdin args', () => {
    expect(spawnCommand('pw-play', { sampleRate: 44100, channels: 2 })).toEqual({
      command: 'pw-play',
      args: ['--raw', '--rate=44100', '--channels=2', '--format=s16', '-'],
    });
  });

  it('builds paplay and aplay args', () => {
    expect(spawnCommand('paplay', { sampleRate: 48000, channels: 1 }).args).toContain('--raw');
    expect(spawnCommand('aplay', { sampleRate: 44100, channels: 2 }).args).toEqual([
      '-t',
      'raw',
      '-f',
      'S16_LE',
      '-c',
      '2',
      '-r',
      '44100',
      '-',
    ]);
  });
});

describe('decodeWav / encodeWav', () => {
  it('round-trips PCM 16-bit stereo', () => {
    const samples = Int16Array.of(0, 1000, -1000, 32767, -32768, 0);
    const encoded = encodeWav({ samples, sampleRate: 44100, channels: 2 });
    const decoded = decodeWav(encoded);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels).toBe(2);
    expect([...decoded.samples]).toEqual([...samples]);
  });

  it('rejects a non-WAV payload', () => {
    expect(() => decodeWav(Uint8Array.of(1, 2, 3, 4))).toThrow(/RIFF/);
  });
});

describe('AudioOut silent', () => {
  it('writes and plays without a sound card', async () => {
    const out = await AudioOut.open({
      backend: 'silent',
      sampleRate: 44100,
      channels: 2,
    });
    try {
      const frames = 1024;
      const pcm = new Int16Array(frames * 2);
      pcm[0] = 1234;
      out.write(pcm);
      expect(out.bytesWritten).toBe(frames * 2 * 2);
      expect(out.backendKind).toBe('silent');

      const clip = Int16Array.of(1, 2, 3, 4);
      await out.play({ samples: clip, sampleRate: 44100, channels: 2 });
      expect(out.bytesWritten).toBe(frames * 4);
      out.write(pcm);
      expect(out.bytesWritten).toBe(frames * 8);
    } finally {
      out.dispose();
      out.write(new Int16Array(8));
    }
  });

  it('writes a one-shot clip before the stream starts pumping', async () => {
    const out = await AudioOut.open({ backend: 'silent', channels: 2 });
    try {
      await out.play({ samples: Int16Array.of(9, 8, 7, 6), sampleRate: 44100, channels: 2 });
      expect(out.bytesWritten).toBe(8);
    } finally {
      out.dispose();
    }
  });

  it('opens silent on auto when CI is set', async () => {
    const out = await AudioOut.open({ backend: 'auto', env: { CI: 'true', PATH: '' } });
    try {
      expect(out.backendKind).toBe('silent');
    } finally {
      out.dispose();
    }
  });
});

describe('AudioOut spawn', () => {
  it('writes s16le bytes to the child stdin', async () => {
    const chunks: Buffer[] = [];
    const stdin = new PassThrough();
    stdin.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    const child = {
      stdin,
      kill(): void {},
    };

    const out = await AudioOut.open({
      backend: 'spawn',
      sampleRate: 44100,
      channels: 2,
      spawnTool: 'pw-play',
      spawn: () => child,
    });
    try {
      if (out.backendKind !== 'spawn') return;
      out.write(Int16Array.of(1, 2, 3, 4));
      await new Promise((r) => setTimeout(r, 10));
      const bytes = Buffer.concat(chunks);
      expect(bytes.byteLength).toBe(8);
      expect(bytes.readInt16LE(0)).toBe(1);
      expect(bytes.readInt16LE(2)).toBe(2);
    } finally {
      out.dispose();
    }
  });

  it('throws when spawn is required and no tool exists', async () => {
    await expect(
      AudioOut.open({ backend: 'spawn', pathDirs: ['/no/such/audio-tools'] }),
    ).rejects.toThrow(/pw-play/);
  });
});
