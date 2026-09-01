import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLspMessage, run, watchPlugins } from '@mudah-cli/mudah';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(testDir, '.fixtures', 'speculative');

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

async function invoke(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const s = liveStreams();
  const code = await run({ argv, cwd: appDir, stdout: s.stdout, stderr: s.stderr });
  return { code, out: s.text().out, err: s.text().err };
}

beforeAll(async () => {
  await rm(appDir, { recursive: true, force: true });
  await mkdir(join(appDir, 'src', 'commands'), { recursive: true });
  await mkdir(join(appDir, 'bin'), { recursive: true });
  await writeFile(join(appDir, 'mudah.json'), JSON.stringify({ name: 'spec-app', version: '0.1.0', bin: 'spec' }));
  await writeFile(
    join(appDir, 'src', 'commands', 'hello.command.ts'),
    `import { Command } from '@mudah-cli/console';
export default class HelloCommand extends Command {
  signature = 'hello {name?}';
  description = 'Say hello';
  async handle() {
    this.output.success(\`hello \${this.arg('name') ?? 'there'}\`);
  }
}
`,
  );
  await writeFile(join(appDir, 'bin', 'spec'), '#!/usr/bin/env node\nconsole.log("stub");\n');
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

describe('tutorial', () => {
  it('prints walkthrough steps in plain mode', async () => {
    const result = await invoke(['tutorial', '--plain']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('create app');
    expect(result.out).toContain('make command');
    expect(result.out).toContain('TestTui');
    expect(result.out).toContain('doctor');
  });
});

describe('lsp initialize', () => {
  it('answers initialize with server capabilities', () => {
    const reply = handleLspMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(reply?.id).toBe(1);
    const result = reply?.result as { serverInfo?: { name?: string }; capabilities?: { completionProvider?: unknown } };
    expect(result.serverInfo?.name).toBe('mudah-lsp');
    expect(result.capabilities?.completionProvider).toBeDefined();
  });

  it('completes mudah.json keys', () => {
    const reply = handleLspMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/completion',
      params: { textDocument: { uri: 'file:///app/mudah.json' } },
    });
    const items = reply?.result as Array<{ label: string }>;
    expect(items.map((i) => i.label)).toContain('name');
    expect(items.map((i) => i.label)).toContain('commands');
  });

  it('exits 0 via run()', async () => {
    const result = await invoke(['lsp']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('mudah-lsp ready');
  });
});

describe('built-in speculative commands', () => {
  it('watch without a command exits 0', async () => {
    const result = await invoke(['watch']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('watch glob=');
  });

  it('watch --once re-runs a command and exits', async () => {
    const result = await invoke(['watch', 'hello', '--once']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('hello there');
  });

  it('test lists files when already inside vitest', async () => {
    const result = await invoke(['test']);
    expect(result.code).toBe(0);
  });

  it('deploy prints a rolling plan', async () => {
    const result = await invoke(['deploy', 'a.example,b.example', '--rolling']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('rolling');
    expect(result.out).toContain('a.example');
    expect(result.out).toContain('No SSH');
  });

  it('sandbox sets env and runs a command', async () => {
    const result = await invoke(['sandbox', 'hello']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('MUDAH_SANDBOX=1');
    expect(result.out).toContain('hello there');
  });

  it('replay prints structured events', async () => {
    const file = join(appDir, 'session.json');
    await writeFile(
      file,
      JSON.stringify([
        { type: 'key', key: 'down' },
        { type: 'text', text: 'hi' },
      ]),
    );
    const result = await invoke(['replay', file]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('key down');
    expect(result.out).toContain('text hi');
  });

  it('storybook prints widget snapshots', async () => {
    const result = await invoke(['storybook']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Label story');
    expect(result.out).toContain('List story');
    expect(result.out).toContain('Toolbar story');
  });

  it('migrate exits 0 with an empty set', async () => {
    const result = await invoke(['migrate']);
    expect(result.code).toBe(0);
  });

  it('docs:widgets prints inspect() roles', async () => {
    const result = await invoke(['docs:widgets']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('list');
    expect(result.out).toContain('toolbar');
  });
});

describe('make plugin', () => {
  it('scaffolds a mudah-plugin package', async () => {
    const result = await invoke(['make', 'plugin', 'audit']);
    expect(result.code).toBe(0);
    const pkgPath = join(appDir, 'audit-plugin', 'package.json');
    const srcPath = join(appDir, 'audit-plugin', 'src', 'index.ts');
    expect(existsSync(pkgPath)).toBe(true);
    expect(existsSync(srcPath)).toBe(true);
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { keywords?: string[] };
    expect(pkg.keywords).toContain('mudah-plugin');
    const src = await readFile(srcPath, 'utf8');
    expect(src).toContain('export const providers');
    expect(src).toContain('export const commands');
  });
});

describe('watchPlugins', () => {
  it('returns a stop function', () => {
    const stop = watchPlugins(appDir, () => undefined, { debounceMs: 20 });
    expect(typeof stop).toBe('function');
    stop();
  });
});
