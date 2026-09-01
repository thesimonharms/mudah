import { SilentBackend } from './backends/silent.js';
import { NativeBackend } from './backends/native.js';
import { SpawnBackend } from './backends/spawn.js';
import { findSpawnTool, pathDirsFrom, detectAudio, silentRequested } from './detect.js';
import type {
  AudioBackend,
  AudioBackendKind,
  AudioClip,
  AudioFormat,
  AudioOutOptions,
  PlaySource,
  SpawnTool,
} from './types.js';
import { decodeWav } from './wav.js';
import { decodeMp3, looksLikeMp3 } from './mp3.js';

interface MixClip {
  samples: Int16Array;
  offset: number;
}

/**
 * PCM output through the OS mixer. Kitty cannot carry audio; this never
 * writes to the terminal.
 *
 * Apps that never import `@mudah-cli/audio` never load a backend.
 */
export class AudioOut {
  readonly sampleRate: number;
  readonly channels: number;
  readonly format: AudioFormat;
  readonly backendKind: Exclude<AudioBackendKind, 'auto'>;
  readonly spawnTool: SpawnTool | undefined;
  bytesWritten = 0;

  private readonly backend: AudioBackend;
  private readonly clips: MixClip[] = [];
  private wroteOnce = false;
  private disposed = false;

  private constructor(
    backend: AudioBackend,
    sampleRate: number,
    channels: number,
    format: AudioFormat,
  ) {
    this.backend = backend;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.format = format;
    this.backendKind = backend.kind;
    this.spawnTool = backend.spawnTool;
  }

  static async open(options: AudioOutOptions = {}): Promise<AudioOut> {
    const sampleRate = options.sampleRate ?? 44100;
    const channels = options.channels ?? 2;
    const format = options.format ?? 's16';
    const framesPerBuffer = options.framesPerBuffer ?? 1024;
    const env = options.env ?? process.env;
    const requested = options.backend ?? 'auto';
    const dirs = pathDirsFrom(env, options.pathDirs);

    if (requested === 'silent' || (requested === 'auto' && silentRequested(env))) {
      return new AudioOut(new SilentBackend(), sampleRate, channels, format);
    }

    const detected = detectAudio(env, options.pathDirs);
    const tryNative = requested === 'native' || (requested === 'auto' && detected.backend === 'native');
    if (tryNative) {
      const native = await NativeBackend.tryOpen({ sampleRate, channels, format, framesPerBuffer });
      if (native !== undefined) return new AudioOut(native, sampleRate, channels, format);
      if (requested === 'native') {
        throw new Error(
          '[audio] Native backend failed to load. Install audify (optional peer) and a C++ toolchain if no prebuild exists for this Node version.',
        );
      }
    }

    const trySpawn = requested === 'spawn' || requested === 'auto';
    if (trySpawn) {
      const tool = options.spawnTool ?? findSpawnTool(dirs);
      if (tool !== undefined) {
        return new AudioOut(
          new SpawnBackend(tool, { sampleRate, channels }, options.spawn, options.onUnderrun),
          sampleRate,
          channels,
          format,
        );
      }
      if (requested === 'spawn') {
        throw new Error(
          '[audio] Spawn backend needs pw-play, paplay, or aplay on PATH.',
        );
      }
    }

    if (requested === 'auto') {
      return new AudioOut(new SilentBackend(), sampleRate, channels, format);
    }

    throw new Error(`[audio] Backend ${requested} is not available.`);
  }

  /**
   * Push one interleaved buffer. Caller owns timing. Underrun does not throw.
   */
  write(pcm: Int16Array | Float32Array): void {
    if (this.disposed) return;
    const samples = this.toDeviceS16(pcm);
    this.mixClips(samples);
    this.push(samples);
    this.wroteOnce = true;
  }

  /**
   * One-shot clip. Mixes into later `write()` calls once the stream is pumping.
   * Before the first `write()`, the samples go to the device immediately.
   */
  async play(source: PlaySource): Promise<void> {
    if (this.disposed) return;
    const clip = this.normalize(source);
    if (this.wroteOnce) {
      this.clips.push({ samples: clip, offset: 0 });
      return;
    }
    this.push(clip);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clips.length = 0;
    this.backend.dispose();
  }

  private normalize(source: PlaySource): Int16Array {
    if (!(source instanceof Uint8Array)) {
      return remapChannels(source.samples, source.channels, this.channels);
    }
    if (looksLikeMp3(source) && !looksLikeWav(source)) {
      const decoded = decodeMp3(source);
      return remapChannels(floatToS16(decoded.samples), decoded.channels, this.channels);
    }
    const clip: AudioClip = decodeWav(source);
    return remapChannels(clip.samples, clip.channels, this.channels);
  }

  private toDeviceS16(pcm: Int16Array | Float32Array): Int16Array {
    if (pcm instanceof Int16Array) return Int16Array.from(pcm);
    const out = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const x = pcm[i] ?? 0;
      out[i] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
    }
    return out;
  }

  private mixClips(into: Int16Array): void {
    for (const clip of this.clips) {
      const remaining = clip.samples.length - clip.offset;
      const n = Math.min(into.length, remaining);
      for (let i = 0; i < n; i++) {
        const mixed = (into[i] ?? 0) + (clip.samples[clip.offset + i] ?? 0);
        into[i] = Math.max(-32768, Math.min(32767, mixed));
      }
      clip.offset += n;
    }
    for (let i = this.clips.length - 1; i >= 0; i--) {
      const clip = this.clips[i];
      if (clip !== undefined && clip.offset >= clip.samples.length) this.clips.splice(i, 1);
    }
  }

  private push(samples: Int16Array): void {
    const bytes = this.format === 'f32' && this.backendKind === 'native' ? f32le(samples) : s16le(samples);
    this.backend.write(bytes);
    this.bytesWritten += bytes.byteLength;
  }
}

function s16le(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i] ?? 0, true);
  return out;
}

function f32le(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setFloat32(i * 4, (samples[i] ?? 0) / 32768, true);
  return out;
}

function looksLikeWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === 0x46464952 && view.getUint32(8, true) === 0x45564157;
}

function floatToS16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] ?? 0;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  }
  return out;
}

function remapChannels(samples: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return Int16Array.from(samples);
  const frames = Math.floor(samples.length / from);
  const out = new Int16Array(frames * to);
  for (let f = 0; f < frames; f++) {
    if (from === 1 && to === 2) {
      const s = samples[f] ?? 0;
      out[f * 2] = s;
      out[f * 2 + 1] = s;
    } else if (from === 2 && to === 1) {
      const l = samples[f * 2] ?? 0;
      const r = samples[f * 2 + 1] ?? 0;
      out[f] = (l + r) >> 1;
    } else {
      for (let c = 0; c < to; c++) out[f * to + c] = samples[f * from + Math.min(c, from - 1)] ?? 0;
    }
  }
  return out;
}
