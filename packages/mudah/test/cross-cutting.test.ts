import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '@mudah-cli/mudah';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(testDir, '.fixtures', 'cross-cutting');

function liveStreams(): {
  stdout: { write(data: string): void };
  stderr: { write(data: string): void };
  text: () => { out: string; err: string };
} {
  const state = { out: '', err: '' };
  return {
    stdout: {
      write(data: string): void {
        state.out += data;
      },
    },
    stderr: {
      write(data: string): void {
        state.err += data;
      },
    },
    text: () => state,
  };
}

beforeAll(async () => {
  await rm(appDir, { recursive: true, force: true });
  await mkdir(join(appDir, 'src', 'commands'), { recursive: true });
  await writeFile(
    join(appDir, 'mudah.json'),
    JSON.stringify({ name: 'cross-app', version: '0.1.0', bin: 'cross' }),
  );
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

describe('cross-cutting built-ins', () => {
  it('plugins:list exits 0', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['plugins:list'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
  });

  it('cache ls exits 0', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['cache', 'ls'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
  });

  it('graph exits 0', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['graph'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
  });

  it('--autocomplete bash contains complete', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['--autocomplete', 'bash'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('complete');
  });

  it('doctor --deps exits 0', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['doctor', '--deps'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
  });

  it('--trace does not crash', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['version', '--trace'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('cross-app v0.1.0');
  });

  it('--headless does not crash', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['version', '--headless'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('cross-app v0.1.0');
  });
});
