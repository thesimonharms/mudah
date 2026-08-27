import { describe, expect, it } from 'vitest';
import { Output, resolveTheme, type OutputOptions } from '@mudah-cli/ui';

function makeOutput(options: Partial<OutputOptions> = {}): {
  out: string;
  err: string;
  output: Output;
} {
  const holder: { out: string; err: string; output: Output } = { out: '', err: '', output: null as unknown as Output };
  const base: OutputOptions = {
    stream: { write(data: string): void { holder.out += data; } },
    errorStream: { write(data: string): void { holder.err += data; } },
    theme: resolveTheme('auto'),
    colorLevel: 0,
    unicode: true,
    ...options,
  };
  holder.output = new Output(base);
  return holder;
}

describe('plain mode', () => {
  it('suppresses all ANSI while keeping text readable', () => {
    const o = makeOutput({ colorLevel: 24 });
    o.output.setMode('plain');
    o.output.success('saved');
    o.output.error('broken');
    expect(o.out).toContain('saved');
    expect(o.err).toContain('broken');
    expect(o.out + o.err).not.toContain('\x1b[');
  });
});

describe('json mode', () => {
  it('turns status primitives into JSON lines', () => {
    const o = makeOutput();
    o.output.setMode('json');
    o.output.success('saved');
    o.output.info('working');
    o.output.error('failed');
    o.output.warn('careful');
    const lines = o.out.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ kind: 'success', message: 'saved' });
    expect(JSON.parse(lines[1]!)).toEqual({ kind: 'info', message: 'working' });
    const errLines = o.err.trim().split('\n');
    expect(JSON.parse(errLines[0]!)).toEqual({ kind: 'error', message: 'failed' });
    // muted/section/bullet are human-only decorations: silent in json mode.
    o.output.muted('faint');
    expect(o.out.trim().split('\n')).toHaveLength(2);
  });

  it('routes keyValue and emit into data events', () => {
    const o = makeOutput();
    o.output.setMode('json');
    o.output.keyValue('name', 'app');
    o.output.emit('data', 'build', { bytes: 12 });
    const events = o.output.takeEvents();
    expect(events).toEqual([
      { kind: 'data', message: 'name', data: 'app' },
      { kind: 'data', message: 'build', data: { bytes: 12 } },
    ]);
    expect(o.out).toContain('"kind":"data"');
  });

  it('renders tables as records keyed by header', () => {
    const o = makeOutput();
    o.output.setMode('json');
    o.output.table([{ header: 'Name' }, { header: 'Size' }], [['app', '1MB']]);
    const events = o.output.takeEvents();
    expect(events).toEqual([{ kind: 'data', message: 'table-row', data: { Name: 'app', Size: '1MB' } }]);
  });

  it('jsonEnvelope success includes results when events exist', () => {
    const o = makeOutput();
    o.output.setMode('json');
    o.output.success('step one done');
    const envelope = JSON.parse(
      o.output.jsonEnvelope({ ok: true, exitCode: 0, command: 'deploy', durationMs: 42 }),
    ) as Record<string, unknown>;
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('deploy');
    expect(envelope.durationMs).toBe(42);
    const results = envelope.results as Array<{ kind: string; message: string }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.message).toBe('step one done');
  });

  it('jsonEnvelope failure carries the error object', () => {
    const o = makeOutput();
    const envelope = JSON.parse(
      o.output.jsonEnvelope({
        ok: false,
        exitCode: 2,
        command: 'nope',
        error: { message: 'Unknown command', hint: 'Run help' },
      }),
    ) as Record<string, unknown>;
    expect(envelope.ok).toBe(false);
    expect(envelope.exitCode).toBe(2);
    const err = envelope.error as { message: string; hint: string };
    expect(err.message).toBe('Unknown command');
    expect(err.hint).toBe('Run help');
  });
});
