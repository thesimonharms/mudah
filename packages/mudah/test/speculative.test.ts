import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { handleLspMessage, encodeLspFrame, decodeLspFrames, run, watchPlugins, withSandbox, buildDeployPlan, executeDeployPlan, mudahJsonDiagnostics, applyPluginUpdate } from '@mudah-cli/mudah';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(testDir, '.fixtures', 'speculative');
const nodeFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs');

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

  it('hovers mudah.json keys and frames JSON-RPC', () => {
    handleLspMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///app/mudah.json', text: '{ "name": "demo" }\n' } },
    });
    const hover = handleLspMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'textDocument/hover',
      params: { textDocument: { uri: 'file:///app/mudah.json' }, position: { line: 0, character: 4 } },
    });
    const contents = (hover?.result as { contents?: { value?: string } }).contents;
    expect(contents?.value).toContain('**name**');
    const framed = encodeLspFrame({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(framed).toContain('Content-Length:');
    const decoded = decodeLspFrames(framed);
    expect(decoded.messages[0]?.method).toBe('initialize');
    const body = '{"jsonrpc":"2.0","id":9,"method":"shutdown"}';
    const lf = decodeLspFrames(`Content-Length: ${Buffer.byteLength(body)}\n\n${body}`);
    expect(lf.messages[0]?.method).toBe('shutdown');
  });

  it('probes initialize over --probe', async () => {
    const result = await invoke(['lsp', '--probe']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('mudah-lsp');
    expect(result.out).toContain('completionProvider');
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
    expect(result.out).toContain('Table story');
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

describe('production speculative helpers', () => {
  it('plugins:watch --once reloads and exits', async () => {
    const result = await invoke(['plugins:watch', '--once']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Plugins reloaded');
  });

  it('storybook can filter a widget', async () => {
    const result = await invoke(['storybook', 'label', '--cols=20', '--rows=4']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Label story');
    expect(result.out).not.toContain('Toolbar story');
  });

  it('blocks fetch inside withSandbox and restores cwd', async () => {
    const here = process.cwd();
    let sawSandbox = false;
    await withSandbox({ cwd: appDir }, async () => {
      expect(process.env['MUDAH_SANDBOX']).toBe('1');
      sawSandbox = true;
      await expect(fetch('https://example.invalid')).rejects.toThrow(/network is disabled/);
    });
    expect(sawSandbox).toBe(true);
    expect(process.cwd()).toBe(here);
    expect(process.env['MUDAH_SANDBOX']).not.toBe('1');
  });

  it('executes a rolling deploy plan host by host', async () => {
    const plan = buildDeployPlan(['a.example', 'b.example'], true, false);
    expect(plan.mode).toBe('rolling');
    const seen: string[] = [];
    const { results } = await executeDeployPlan(plan, async (host) => {
      seen.push(host);
      return { ok: host === 'a.example', latencyMs: 1, detail: 'probe' };
    });
    expect(seen).toEqual(['a.example', 'b.example']);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(false);
  });

  it('stops a rolling deploy on the first failed host', async () => {
    const plan = buildDeployPlan(['a.example', 'b.example', 'c.example'], true, false);
    const seen: string[] = [];
    const { results } = await executeDeployPlan(plan, async (host) => {
      seen.push(host);
      return { ok: false, latencyMs: 1, detail: 'down' };
    });
    expect(seen).toEqual(['a.example']);
    expect(results).toHaveLength(1);
  });

  it('throws when --execute has no probe', async () => {
    const plan = buildDeployPlan(['a.example'], true, false);
    await expect(executeDeployPlan(plan)).rejects.toThrow(/probe/);
  });

  it('strips NODE_OPTIONS inside the sandbox', async () => {
    process.env['NODE_OPTIONS'] = '--require ./evil.js';
    await withSandbox({ cwd: appDir }, () => {
      expect(process.env['NODE_OPTIONS']).toBeUndefined();
    });
  });

  it('blocks writes outside the sandbox cwd', async () => {
    await withSandbox({ cwd: appDir }, () => {
      nodeFs.writeFileSync(join(appDir, 'inside.txt'), 'ok');
      expect(() => nodeFs.writeFileSync('/etc/mudah-sandbox-should-fail', 'no')).toThrow(/outside cwd/);
    });
  });

  it('runs a remote command after a successful probe', async () => {
    const plan = buildDeployPlan(['a.example', 'b.example'], true, false, 'systemctl restart app');
    const ran: string[] = [];
    const { results } = await executeDeployPlan(plan, {
      probe: async () => ({ ok: true, latencyMs: 1, detail: 'probe' }),
      run: async (host, command) => {
        ran.push(`${host}:${command}`);
        return { ok: true, latencyMs: 2, detail: 'run' };
      },
    });
    expect(ran).toEqual(['a.example:systemctl restart app', 'b.example:systemctl restart app']);
    expect(results.every((row) => row.ok)).toBe(true);
  });

  it('skips the remote command when the probe fails', async () => {
    const plan = buildDeployPlan(['a.example'], false, false, 'true');
    let ran = 0;
    const { results } = await executeDeployPlan(plan, {
      probe: async () => ({ ok: false, latencyMs: 1, detail: 'down' }),
      run: async () => {
        ran += 1;
        return { ok: true, latencyMs: 0 };
      },
    });
    expect(ran).toBe(0);
    expect(results[0]?.ok).toBe(false);
  });

  it('flags unknown mudah.json keys', () => {
    const items = mudahJsonDiagnostics(
      'file:///app/mudah.json',
      JSON.stringify({ name: 'demo', version: '1.0.0', bin: 'demo', nope: true }, null, 2),
    );
    expect(items.some((row) => row.message.includes('nope'))).toBe(true);
  });

  it('installs an outdated plugin via applyPluginUpdate', () => {
    const result = applyPluginUpdate('demo-plugin', appDir, () => ({
      status: 0,
      stdout: 'added 1',
      stderr: '',
    }));
    expect(result.ok).toBe(true);
  });
});
