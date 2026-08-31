import { describe, expect, it } from 'vitest';
import {
  bold,
  dim,
  Output,
  paint,
  renderMarkdown,
  renderPanel,
  renderTable,
  resolveTheme,
  stripAnsi,
  visibleLength,
  type OutputOptions,
} from '@mudah-cli/ui';

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
  };
  holder.output = new Output({ ...base, ...options });
  return holder;
}

describe('colors', () => {
  it('paints truecolor at level 24', () => {
    const text = paint('#7aa2f7', 'x', 24);
    expect(text).toBe('\x1b[38;2;122;162;247mx\x1b[39m');
  });

  it('paints 256-color at level 8', () => {
    const text = paint('#ff0000', 'x', 8);
    expect(text).toMatch(/^\x1b\[38;5;\d+mx\x1b\[39m$/);
  });

  it('returns plain text at level 0 and supports modifiers', () => {
    expect(paint('#ffffff', 'x', 0)).toBe('x');
    expect(bold('x', 0)).toBe('x');
    expect(bold('x', 24)).toBe('\x1b[1mx\x1b[22m');
    expect(dim('x', 24)).toBe('\x1b[2mx\x1b[22m');
  });

  it('measures visible width including CJK', () => {
    expect(visibleLength('hello')).toBe(5);
    expect(visibleLength('\x1b[31mred\x1b[39m')).toBe(3);
    expect(visibleLength('日本語')).toBe(6);
    expect(stripAnsi('\x1b[1m\x1b]0;title\x07bold')).toBe('bold');
  });
});

describe('themes', () => {
  it('resolves auto and unknown to the dark default', () => {
    expect(resolveTheme('auto').mode).toBe('dark');
    expect(resolveTheme(undefined).name).toBe('sleek-dark');
    expect(resolveTheme('nope').mode).toBe('dark');
  });

  it('resolves named themes', () => {
    expect(resolveTheme('sleek-light').mode).toBe('light');
    expect(resolveTheme('sleek').name).toBe('sleek-dark');
  });
});

describe('Output', () => {
  it('writes status messages with glyphs to the right stream', () => {
    const o = makeOutput();
    o.output.success('saved');
    o.output.error('broken');
    o.output.warn('careful');
    o.output.info('noting');
    o.output.muted('faint');
    expect(o.out).toContain('✓ saved');
    expect(o.out).toContain('noting');
    expect(o.out).toContain('faint');
    expect(o.err).toContain('✗ broken');
    expect(o.err).toContain('⚠ careful');
  });

  it('falls back to ascii glyphs without unicode', () => {
    const o = makeOutput({ unicode: false });
    o.output.success('saved');
    o.output.error('broken');
    expect(o.out).toContain('v saved');
    expect(o.err).toContain('x broken');
  });

  it('applies theme colors when the level allows', () => {
    const o = makeOutput({ colorLevel: 24 });
    o.output.success('saved');
    expect(o.out).toContain('\x1b[38;2;158;206;106m');
  });

  it('renders sections, bullets, key/value pairs, and rules', () => {
    const o = makeOutput();
    o.output.section('Commands');
    o.output.bullet('one');
    o.output.keyValue('Name', 'app');
    o.output.line();
    expect(o.out).toContain('Commands');
    expect(o.out).toContain('• one');
    expect(o.out).toContain('Name');
    expect(o.out).toContain('─'.repeat(60));
  });

  it('sends desktop notifications via OSC 9 when supported', () => {
    const o = makeOutput({ osc9: true });
    o.output.notification('Build', 'finished in 12s');
    expect(o.err).toContain('\x1b]9;Build\x1ffinished in 12s\x07');
    expect(o.err).toContain('777;notify;Build;finished in 12s');
  });

  it('degrades notifications to a status line without OSC 9', () => {
    const o = makeOutput();
    o.output.notification('Build', 'finished');
    expect(o.err).toContain('Build');
    expect(o.err).toContain('finished');
    expect(o.err).not.toContain('\x1b]9;');
  });
});

describe('renderTable', () => {
  it('renders an aligned unicode grid', () => {
    const table = renderTable(
      [{ header: 'Name' }, { header: 'Size', align: 'right' }],
      [
        ['app', '1.2MB'],
        ['db', '3KB'],
      ],
      { level: 0, unicode: true, styled: false },
    );
    const lines = table.split('\n');
    expect(lines[0]).toBe('┌──────┬───────┐');
    expect(lines[1]).toBe('│ Name │  Size │');
    expect(lines[2]).toBe('├──────┼───────┤');
    expect(lines[3]).toBe('│ app  │ 1.2MB │');
    expect(lines[4]).toBe('│ db   │   3KB │');
    expect(lines[5]).toBe('└──────┴───────┘');
  });

  it('renders an ascii grid without unicode', () => {
    const table = renderTable(
      [{ header: 'A' }],
      [['x']],
      { level: 0, unicode: false, styled: false },
    );
    expect(table.split('\n')[0]).toBe('+---+');
    expect(table).toContain('| A |');
    expect(table).toContain('-');
  });

  it('styles the header with the theme accent', () => {
    const table = renderTable(
      [{ header: 'Name' }],
      [['a']],
      { level: 24, unicode: true, styled: true },
    );
    expect(table).toContain('\x1b[38;2;122;162;247mName');
  });
});

describe('renderPanel', () => {
  it('renders a titled panel', () => {
    const panel = renderPanel('Mudah', ['line one', 'line two'], { level: 0, unicode: true });
    const lines = panel.split('\n');
    expect(lines[0]).toBe('╭─ Mudah ──╮');
    expect(lines[1]).toBe('│ line one │');
    expect(lines[2]).toBe('│ line two │');
    expect(lines[3]).toBe('╰──────────╯');
  });

  it('renders an untitled panel with a fixed width', () => {
    const panel = renderPanel(undefined, ['x'], { level: 0, unicode: true, width: 5 });
    const lines = panel.split('\n');
    expect(lines[0]).toBe('╭───────╮');
    expect(lines[1]).toBe('│ x     │');
    expect(lines[2]).toBe('╰───────╯');
  });

  it('renders an ascii panel', () => {
    const panel = renderPanel('T', ['x'], { level: 0, unicode: false });
    expect(panel.split('\n')[0]).toBe('+- T -+');
    expect(panel).toContain('|');
  });
});

describe('renderMarkdown', () => {
  const md = (text: string) => renderMarkdown(text, { level: 0 });

  it('renders headings, bullets, and quotes', () => {
    expect(md('# Title')).toBe('\nTitle\n');
    expect(md('- item')).toBe('  • item');
    expect(md('> quoted')).toBe('│ quoted');
    expect(md('---')).toBe('─'.repeat(40));
    expect(md('1. first')).toBe('  1. first');
  });

  it('renders inline styles', () => {
    expect(md('**bold** and *em* and `code`')).toBe('bold and em and code');
    expect(md('[text](http://x.com)')).toBe('text <http://x.com>');
  });

  it('applies ANSI at higher levels', () => {
    const text = renderMarkdown('**bold**', { level: 24 });
    expect(text).toContain('\x1b[1m');
  });

  it('renders fenced code blocks as themed panels', () => {
    const out = renderMarkdown('```js\nconst x = 1\n```', { level: 0, unicode: true });
    expect(out).toContain('js');
    expect(out).toContain('const x = 1');
    expect(out).toContain('│');
  });

  it('renders fenced code blocks without a language label', () => {
    const out = renderMarkdown('```\nplain code\n```', { level: 0, unicode: true });
    expect(out).toContain('plain code');
    expect(out).toContain('╭');
  });

  it('preserves blank lines inside code blocks', () => {
    const out = renderMarkdown('```\nline one\n\nline three\n```', { level: 0, unicode: true });
    expect(out).toContain('line one');
    expect(out).toContain('line three');
  });

  it('falls back to ascii borders without unicode', () => {
    const out = renderMarkdown('```\nplain code\n```', { level: 0, unicode: false });
    expect(out).toContain('plain code');
    expect(out).toContain('+');
  });
});
