import { spawnSync } from 'node:child_process';

export interface MicrophoneSource {
  read(): Float32Array;
  close(): void;
  readonly sampleRate: number;
}

export type MicSpawn = (
  command: string,
  args: readonly string[],
) => { status: number | null; stdout: Buffer | string; error?: Error } | null;

export interface CreateMicrophoneOptions {
  /** Injected capture. Wins over OS capture. */
  read?: () => Float32Array;
  sampleRate?: number;
  /**
   * Open a live OS capture (`arecord` / `rec` / `sox`). Default on when not
   * inside Vitest and `MUDAH_MIC` is not `0`.
   */
  live?: boolean;
  spawn?: MicSpawn;
}

/**
 * Live microphone handle. Tests inject `read`. Production opens arecord/sox
 * when `live` is true.
 */
export function createMicrophone(options: CreateMicrophoneOptions = {}): MicrophoneSource {
  const sampleRate = options.sampleRate ?? 44100;
  let closed = false;

  if (options.read) {
    const read = options.read;
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

  const live =
    options.live ?? (process.env['VITEST'] === undefined && process.env['MUDAH_MIC'] !== '0');
  const spawn = options.spawn ?? defaultMicSpawn;
  const tool = live ? pickMicTool(spawn) : undefined;

  return {
    sampleRate,
    read(): Float32Array {
      if (closed) return new Float32Array(0);
      if (tool === undefined) return new Float32Array(0);
      const result = spawn(tool.command, tool.args(sampleRate));
      if (result === null || result.error || result.status !== 0) return new Float32Array(0);
      const bytes = result.stdout instanceof Buffer ? result.stdout : Buffer.from(result.stdout);
      if (bytes.byteLength < 4) return new Float32Array(0);
      const aligned = bytes.byteLength - (bytes.byteLength % 4);
      return new Float32Array(bytes.buffer, bytes.byteOffset, aligned / 4);
    },
    close(): void {
      closed = true;
    },
  };
}

function pickMicTool(spawn: MicSpawn): { command: string; args: (rate: number) => string[] } | undefined {
  const candidates: Array<{ command: string; args: (rate: number) => string[] }> = [
    { command: 'arecord', args: (rate) => ['-f', 'FLOAT_LE', '-r', String(rate), '-c', '1', '-t', 'raw', '-d', '1', '-q'] },
    { command: 'rec', args: (rate) => ['-q', '-t', 'f32', '-r', String(rate), '-c', '1', '-'] },
    { command: 'sox', args: (rate) => ['-d', '-t', 'f32', '-r', String(rate), '-c', '1', '-'] },
  ];
  for (const tool of candidates) {
    const probe = spawn(tool.command, ['--version']);
    if (probe !== null && probe.error === undefined) return tool;
  }
  return undefined;
}

function defaultMicSpawn(
  command: string,
  args: readonly string[],
): { status: number | null; stdout: Buffer | string; error?: Error } | null {
  try {
    const result = spawnSync(command, [...args], { encoding: 'buffer', timeout: 3_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error) return { status: result.status, stdout: Buffer.alloc(0), error: result.error };
    return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0) };
  } catch {
    return null;
  }
}
