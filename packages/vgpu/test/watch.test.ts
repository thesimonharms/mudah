import { describe, expect, it } from 'vitest';
import { parseWatchFlag, watchShader, type ShaderWatchFn } from '@mudah-cli/vgpu';

describe('parseWatchFlag', () => {
  it('detects --watch and -w', () => {
    expect(parseWatchFlag(['node', 'app', '--watch'])).toBe(true);
    expect(parseWatchFlag(['-w'])).toBe(true);
    expect(parseWatchFlag(['--help'])).toBe(false);
  });
});

describe('watchShader', () => {
  it('reads the file when the injected watcher fires', () => {
    let listener: (() => void) | undefined;
    let closed = 0;
    const watch: ShaderWatchFn = (_path, cb) => {
      listener = () => cb('change', 'effect.wgsl');
      return {
        close(): void {
          closed += 1;
        },
      };
    };

    const seen: string[] = [];
    const dispose = watchShader('effect.wgsl', (source) => seen.push(source), {
      watch,
      readFile: (path) => `${path} body`,
    });

    listener?.();
    expect(seen).toEqual(['effect.wgsl body']);
    dispose();
    expect(closed).toBe(1);
  });

  it('disposes when the abort signal fires', () => {
    let closed = 0;
    const watch: ShaderWatchFn = () => ({
      close(): void {
        closed += 1;
      },
    });
    const controller = new AbortController();
    watchShader('fx.wgsl', () => undefined, { watch, signal: controller.signal });
    controller.abort();
    expect(closed).toBe(1);
  });
});
