import { describe, expect, it } from 'vitest';
import { Chart, ResizableSplit, Split, Tree, TreeView } from '@mudah-cli/tui';

describe('Chart', () => {
  const entries = [
    { label: 'cpu', value: 2 },
    { label: 'mem', value: 1 },
  ];

  it('wraps renderBarChart as plain text', () => {
    const chart = new Chart({ kind: 'bar', entries, width: 4 });
    const out = chart.render().join('\n');
    expect(out).toContain('cpu');
    expect(out).toContain('████');
    expect(out).not.toContain('\x1b[');
    expect(chart.focusable).toBe(false);
    expect(chart.inspect()).toEqual({ role: 'chart', value: 'bar' });
  });

  it('wraps renderLineChart as plain text', () => {
    const chart = new Chart({ kind: 'line', entries, width: 3, height: 4 });
    const out = chart.render().join('\n');
    expect(out).toContain('●');
    expect(out).toContain('max:');
    expect(out).not.toContain('\x1b[');
  });
});

describe('ROADMAP aliases', () => {
  it('exports ResizableSplit and TreeView as Split and Tree', () => {
    expect(ResizableSplit).toBe(Split);
    expect(TreeView).toBe(Tree);
  });
});
