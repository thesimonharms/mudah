declare module 'audify' {
  export class RtAudio {
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
  export const RtAudioFormat: {
    RTAUDIO_SINT16: number;
    RTAUDIO_FLOAT32: number;
  };
}
