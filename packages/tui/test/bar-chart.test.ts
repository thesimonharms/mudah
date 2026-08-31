import { describe, expect, it } from 'vitest';
import { BarChart } from '@mudah-cli/tui';

describe('BarChart', () => {
  it('renders a row per value with block bars scaled to the max', () => {
    const chart = new BarChart([1, 2, 3]);
    const lines = chart.render();
    expect(lines).toHaveLength(3);
    // Larger value -> more filled blocks in the bar.
    expect(lines[0]!.match(/█/g)?.length ?? 0).toBeLessThan(lines[1]!.match(/█/g)?.length ?? 0);
    expect(lines[1]!.match(/█/g)?.length ?? 0).toBeLessThan(lines[2]!.match(/█/g)?.length ?? 0);
    expect(lines[2]).toBe('████████████████ 3');
  });

  it('updates values and rerenders', () => {
    const chart = new BarChart([1]);
    expect(chart.render()).toEqual(['████████████████ 1']);
    chart.setValues([4, 2]);
    const lines = chart.render();
    expect(lines[0]).toBe('████████████████ 4');
    expect(lines[1]!.match(/█/g)?.length ?? 0).toBeLessThan(lines[0]!.match(/█/g)?.length ?? 0);
  });

  it('returns a no-data placeholder when empty', () => {
    expect(new BarChart([]).render()).toEqual(['no data']);
  });

  it('is not focusable', () => {
    expect(new BarChart([1, 2]).focusable).toBe(false);
  });

  it('reports its size for layout', () => {
    const chart = new BarChart([1, 2, 3, 4, 5]);
    expect(chart.measure(80, 24)).toEqual({ width: 20, height: 5 });
  });
});
