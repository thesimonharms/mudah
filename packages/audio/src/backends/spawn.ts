import { spawn as nodeSpawn } from 'node:child_process';
import type { AudioBackend, SpawnFn, SpawnedPlayer, SpawnTool } from '../types.js';
import { spawnCommand } from './spawn-command.js';

export class SpawnBackend implements AudioBackend {
  readonly kind = 'spawn' as const;
  readonly spawnTool: SpawnTool;
  private readonly child: SpawnedPlayer;
  private readonly onUnderrun: (() => void) | undefined;
  private dead = false;

  constructor(
    tool: SpawnTool,
    target: { sampleRate: number; channels: number },
    spawnFn: SpawnFn | undefined,
    onUnderrun?: () => void,
  ) {
    this.spawnTool = tool;
    this.onUnderrun = onUnderrun;
    const { command, args } = spawnCommand(tool, target);
    const run = spawnFn ?? defaultSpawn;
    this.child = run(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    this.child.on?.('exit', () => {
      this.dead = true;
    });
    this.child.on?.('error', () => {
      this.dead = true;
      this.onUnderrun?.();
    });
  }

  write(bytes: Uint8Array): void {
    if (this.dead || this.child.stdin === null) {
      this.onUnderrun?.();
      return;
    }
    try {
      this.child.stdin.write(bytes);
    } catch {
      this.dead = true;
      this.onUnderrun?.();
    }
  }

  dispose(): void {
    this.dead = true;
    try {
      this.child.stdin?.end();
    } catch {
      /* already closed */
    }
    this.child.kill();
  }
}

const defaultSpawn: SpawnFn = (command, args, options) =>
  nodeSpawn(command, [...args], options) as SpawnedPlayer;
