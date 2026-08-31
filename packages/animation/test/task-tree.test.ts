import { describe, expect, it } from 'vitest';
import { TaskTree } from '@mudah-cli/animation';

function collector(isTTY = false): {
  stream: { write(data: string): void; isTTY?: boolean };
  text: () => string;
} {
  const state = { value: '' };
  return {
    stream: {
      isTTY: isTTY || undefined,
      write(data: string): void {
        state.value += data;
      },
    },
    text: () => state.value,
  };
}

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('TaskTree', () => {
  it('runs dependent tasks only after their dependencies complete', async () => {
    const { stream, text } = collector(true);
    const order: string[] = [];
    const tree = new TaskTree({ stream, unicode: true });

    const failures = await tree.run([
      { name: 'a', fn: () => { order.push('a'); } },
      { name: 'b', dependsOn: ['a'], fn: () => { order.push('b'); } },
      { name: 'c', dependsOn: ['a'], fn: () => { order.push('c'); } },
    ]);

    expect(failures).toBe(0);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    const out = text();
    expect(out).toContain('a');
    expect(out).toContain('✓');
  });

  it('skips dependents of a failed task without running them', async () => {
    const { stream, text } = collector(true);
    const ran: string[] = [];
    const tree = new TaskTree({ stream, unicode: true });

    const failures = await tree.run([
      { name: 'a', fn: () => { throw new Error('boom'); } },
      { name: 'b', dependsOn: ['a'], fn: () => { ran.push('b'); } },
      { name: 'c', dependsOn: ['b'], fn: () => { ran.push('c'); } },
      { name: 'd', fn: () => { ran.push('d'); } },
    ]);

    expect(failures).toBe(1);
    expect(ran).toEqual(['d']);
    const out = text();
    expect(out).toContain('✗ a');
    expect(out).toContain('boom');
    expect(out).toContain('⊘ b');
    expect(out).toContain('⊘ c');
    expect(out).toContain('✓ d');
  });

  it('indents tasks by dependency depth', async () => {
    const { stream, text } = collector(true);
    const tree = new TaskTree({ stream, unicode: true });
    await tree.run([
      { name: 'root', fn: () => {} },
      { name: 'child', dependsOn: ['root'], fn: () => {} },
    ]);
    const out = text();
    // root has depth 0 (one leading space from the row format), child depth 1 (extra indent).
    const rootLine = out.split('\n').find((l) => l.includes('root'))!;
    const childLine = out.split('\n').find((l) => l.includes('child'))!;
    expect(rootLine.length).toBeLessThan(childLine.length);
    expect(childLine.startsWith('  ')).toBe(true);
  });

  it('respects a concurrency cap', async () => {
    const { stream } = collector(true);
    const tree = new TaskTree({ stream, concurrency: 1 });
    let active = 0;
    let maxActive = 0;

    await tree.run(
      Array.from({ length: 4 }, (_, i) => ({
        name: `t${i}`,
        fn: async (): Promise<void> => {
          active++;
          maxActive = Math.max(maxActive, active);
          await sleep(5);
          active--;
        },
      })),
    );

    expect(maxActive).toBe(1);
  });

  it('emits one line per completed task on non-tty output', async () => {
    const { stream, text } = collector(false);
    const tree = new TaskTree({ stream, unicode: false });
    await tree.run([
      { name: 'a', fn: () => sleep(5) },
      { name: 'b', fn: () => sleep(2) },
    ]);
    const lines = text().trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.includes('v') || l.includes('x') || l.includes('s'))).toBe(true);
  });

  it('throws on an unknown dependency', async () => {
    const tree = new TaskTree({ stream: { write: () => {} } });
    await expect(tree.run([{ name: 'a', dependsOn: ['nope'], fn: () => {} }])).rejects.toThrow(/unknown task/);
  });

  it('throws on a dependency cycle', async () => {
    const tree = new TaskTree({ stream: { write: () => {} } });
    await expect(
      tree.run([
        { name: 'a', dependsOn: ['b'], fn: () => {} },
        { name: 'b', dependsOn: ['a'], fn: () => {} },
      ]),
    ).rejects.toThrow(/cycle/);
  });
});
