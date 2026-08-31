import { describe, expect, it } from 'vitest';
import { renderBarChart } from '@mudah-cli/ui';

describe('renderBarChart', () => {
  const entries = [
    { label: 'a', value: 2 },
    { label: 'b', value: 1 },
  ];

  it('scales bars to the largest value', () => {
    const out = renderBarChart(entries, { level: 0, width: 4, unicode: true });
    expect(out).toContain('████'); // a: 2/2 * 4
    expect(out).toContain('██  '); // b: 1/2 * 4
    expect(out).toContain('2');
    expect(out).toContain('1');
  });

  it('uses ascii blocks without unicode', () => {
    const out = renderBarChart(entries, { level: 0, width: 4, unicode: false });
    expect(out).toContain('####');
    expect(out).toContain('##  ');
  });

  it('renders empty bars when all values are zero', () => {
    const out = renderBarChart([{ label: 'a', value: 0 }], { level: 0, width: 3 });
    expect(out).not.toContain('#');
    expect(out).not.toContain('█');
  });

  it('hides the label column when labels: false', () => {
    const out = renderBarChart(entries, { level: 0, width: 4, unicode: true, labels: false });
    expect(out).not.toContain('a');
  });

  it('pads negative values to zero width', () => {
    const out = renderBarChart([{ label: 'x', value: -1 }], { level: 0, width: 4 });
    expect(out).toContain('-1');
    expect(out).not.toContain('█');
  });

  it('paints bars with the theme accent at color level 24', () => {
    const out = renderBarChart(entries, { level: 24, width: 2 });
    expect(out).toContain('\x1b[38;2;122;162;247m');
  });
});
