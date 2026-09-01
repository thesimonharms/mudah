export interface MicrophoneSource {
  read(): Float32Array;
  close(): void;
  readonly sampleRate: number;
}

export interface CreateMicrophoneOptions {
  /** Injected capture. Default returns an empty (silent) buffer. */
  read?: () => Float32Array;
  sampleRate?: number;
}

/**
 * Live microphone handle. Tests inject `read`; the default is silence so
 * CI never opens a real device.
 */
export function createMicrophone(options: CreateMicrophoneOptions = {}): MicrophoneSource {
  const sampleRate = options.sampleRate ?? 44100;
  const read = options.read ?? (() => new Float32Array(0));
  let closed = false;
  return {
    sampleRate,
    read(): Float32Array {
      if (closed) return new Float32Array(0);
      return read();
    },
    close(): void {
      closed = true;
    },
  };
}
