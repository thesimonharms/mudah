export type AudioFormat = 's16' | 'f32';

export type AudioBackendKind = 'auto' | 'native' | 'spawn' | 'silent';

export type SpawnTool = 'pw-play' | 'paplay' | 'aplay';

export interface AudioOutOptions {
  sampleRate?: number;
  channels?: number;
  /** Interleaved little-endian. Default `s16`. Spawn always sends s16. */
  format?: AudioFormat;
  /** Hint for native RtAudio and for callers that pump a fixed block. Default 1024. */
  framesPerBuffer?: number;
  backend?: AudioBackendKind;
  /** Called when a write cannot reach the device. Never throws. */
  onUnderrun?: () => void;
  /** Environment for `CI` / `MUDAH_NO_AUDIO` (tests pass a map). */
  env?: NodeJS.ProcessEnv;
  /** Override PATH lookup (tests). */
  pathDirs?: readonly string[];
  /** Inject spawn (tests). */
  spawn?: SpawnFn;
  /** Skip PATH lookup (tests). */
  spawnTool?: SpawnTool;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { stdio: ['pipe', 'ignore', 'ignore'] },
) => SpawnedPlayer;

export interface SpawnedPlayer {
  stdin: { write(data: Uint8Array): boolean; end(): void } | null;
  kill(): void;
  on?(event: 'error' | 'exit', listener: (...args: unknown[]) => void): unknown;
}

export interface AudioClip {
  readonly samples: Int16Array;
  readonly sampleRate: number;
  readonly channels: number;
}

export type PlaySource = Uint8Array | AudioClip;

export interface AudioDetection {
  readonly backend: Exclude<AudioBackendKind, 'auto'>;
  readonly native: boolean;
  readonly spawnTool: SpawnTool | undefined;
}

export interface AudioBackend {
  readonly kind: Exclude<AudioBackendKind, 'auto'>;
  readonly spawnTool?: SpawnTool;
  write(bytes: Uint8Array): void;
  dispose(): void;
}
