import type { SpawnTool } from '../types.js';

export interface SpawnTarget {
  readonly sampleRate: number;
  readonly channels: number;
}

/** argv for a raw s16le stdin player. Tests assert this without opening a device. */
export function spawnCommand(tool: SpawnTool, target: SpawnTarget): { command: string; args: string[] } {
  const rate = String(target.sampleRate);
  const channels = String(target.channels);
  switch (tool) {
    case 'pw-play':
      return {
        command: 'pw-play',
        args: ['--raw', `--rate=${rate}`, `--channels=${channels}`, '--format=s16', '-'],
      };
    case 'paplay':
      return {
        command: 'paplay',
        args: ['--raw', `--rate=${rate}`, `--channels=${channels}`, '--format=s16le', '-'],
      };
    case 'aplay':
      return {
        command: 'aplay',
        args: ['-t', 'raw', '-f', 'S16_LE', '-c', channels, '-r', rate, '-'],
      };
  }
}
