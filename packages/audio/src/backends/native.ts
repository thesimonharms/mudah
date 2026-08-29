import type { AudioBackend, AudioFormat } from '../types.js';

interface RtAudioLike {
  getDefaultOutputDevice(): number;
  openStream(
    output: { deviceId: number; nChannels: number; firstChannel?: number },
    input: null,
    format: number,
    sampleRate: number,
    bufferFrames: number,
    name: string,
  ): void;
  start(): void;
  stop(): void;
  closeStream(): void;
  write(pcm: Buffer): void;
}

interface AudifyModule {
  RtAudio: new () => RtAudioLike;
  RtAudioFormat: { RTAUDIO_SINT16: number; RTAUDIO_FLOAT32: number };
}

export class NativeBackend implements AudioBackend {
  readonly kind = 'native' as const;
  private readonly rt: RtAudioLike;
  private closed = false;

  private constructor(rt: RtAudioLike) {
    this.rt = rt;
  }

  static async tryOpen(options: {
    sampleRate: number;
    channels: number;
    format: AudioFormat;
    framesPerBuffer: number;
  }): Promise<NativeBackend | undefined> {
    let mod: AudifyModule;
    try {
      mod = (await import('audify')) as unknown as AudifyModule;
    } catch {
      return undefined;
    }
    if (typeof mod.RtAudio !== 'function' || mod.RtAudioFormat === undefined) return undefined;

    try {
      const rt = new mod.RtAudio();
      const format =
        options.format === 'f32' ? mod.RtAudioFormat.RTAUDIO_FLOAT32 : mod.RtAudioFormat.RTAUDIO_SINT16;
      rt.openStream(
        { deviceId: rt.getDefaultOutputDevice(), nChannels: options.channels, firstChannel: 0 },
        null,
        format,
        options.sampleRate,
        options.framesPerBuffer,
        'mudah-audio',
      );
      rt.start();
      return new NativeBackend(rt);
    } catch {
      return undefined;
    }
  }

  write(bytes: Uint8Array): void {
    if (this.closed) return;
    this.rt.write(Buffer.from(bytes));
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.rt.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.rt.closeStream();
    } catch {
      /* already closed */
    }
  }
}
