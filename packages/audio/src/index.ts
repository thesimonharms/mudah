export {
  AudioOut,
} from './device.js';
export {
  detectAudio,
  canResolveAudify,
  findSpawnTool,
  silentRequested,
} from './detect.js';
export {
  decodeWav,
  encodeWav,
} from './wav.js';
export {
  decodeMp3,
  looksLikeMp3,
  type DecodedMp3,
} from './mp3.js';
export {
  parseTune,
  parsePitch,
  midiToHz,
  type Note,
  type Tune,
  type TuneDurationUnit,
} from './tune.js';
export { BpmClock, type BpmClockOptions } from './clock.js';
export { mixChannels, duck, type MixChannelsOptions } from './mix.js';
export { quantize, type BeatSubdivision } from './quantize.js';
export { FftBands, type FftBandResult } from './fft.js';
export {
  createMicrophone,
  type CreateMicrophoneOptions,
  type MicrophoneSource,
} from './mic.js';
export {
  createReactiveBridge,
  type ReactiveBridge,
  type ReactiveBridgeOptions,
  type ReactiveEvent,
  type ReactiveListener,
} from './reactive.js';
export {
  spawnCommand,
} from './backends/spawn-command.js';
export type {
  AudioBackendKind,
  AudioClip,
  AudioDetection,
  AudioFormat,
  AudioOutOptions,
  PlaySource,
  SpawnTool,
} from './types.js';
