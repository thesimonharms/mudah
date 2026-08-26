import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ticker } from '@mudah-cli/terminal';
import { ProgressBar, Spinner, TaskRunner } from '@mudah-cli/animation';

function collector(isTTY = false): { stream: { write(data: string): unknown; isTTY?: boolean }; text(): string } {
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

describe('Spinner', () => {
  it('animates frames on a TTY stream and stops cleanly', async () => {
    const { stream, text } = collector(true);
    const spinner = new Spinner({ stream, enabled: true, interval: 1 });
    spinner.start('Working');
    await sleep(20);
    spinner.stop('Done');

    const out = text();
    expect(out).toContain('Working');
    // Frame redraws: several \r\x1b[2K sequences.
    expect((out.match(/\r\x1b\[2K/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Final line ends the spinner.
    expect(out.endsWith('Done\n')).toBe(true);
  });

  it('renders a static frame with reduced motion', async () => {
    const { stream, text } = collector(true);
    const spinner = new Spinner({ stream, enabled: true, reducedMotion: true, interval: 1 });
    spinner.start('Working');
    await sleep(15);
    spinner.stop('Done');

    const out = text();
    expect(out).toContain('· Working');
    expect(out).not.toContain('⠋');
  });

  it('stays silent when disabled (non-tty)', async () => {
    const { stream, text } = collector(false);
    const spinner = new Spinner({ stream, enabled: false });
    spinner.start('Working');
    await sleep(10);
    spinner.stop('Done');
    expect(text()).toBe('');
  });

  it('with() stops the spinner even when the task throws', async () => {
    const { stream, text } = collector(true);
    const spinner = new Spinner({ stream, enabled: true, interval: 1 });
    await expect(
      spinner.with('Failing', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(text()).toContain('Failing');
  });
});

describe('ProgressBar', () => {
  it('renders unicode bars with percentage and counts', () => {
    const bar = new ProgressBar({ total: 10, width: 10 });
    bar.set(5);
    expect(bar.render()).toBe('[█████░░░░░] 50% 5/10');
  });

  it('renders ascii bars when unicode is off', () => {
    const bar = new ProgressBar({ total: 4, width: 4, unicode: false });
    bar.inc(1);
    expect(bar.render()).toBe('[#---] 25% 1/4');
  });

  it('clamps values and completes at 100%', () => {
    const { stream, text } = collector(true);
    const bar = new ProgressBar({ total: 2, width: 4, stream, enabled: true });
    bar.inc(10); // clamp to total
    expect(bar.render()).toContain('100%');
    bar.complete();
    expect(text().endsWith('\n')).toBe(true);
  });

  it('is silent when disabled', () => {
    const { stream, text } = collector(false);
    const bar = new ProgressBar({ total: 3, stream, enabled: false });
    bar.inc();
    expect(text()).toBe('');
  });
});

describe('TaskRunner', () => {
  it('runs tasks concurrently and reports per-task status', async () => {
    const { stream, text } = collector(true);
    const runner = new TaskRunner({ stream, unicode: true });
    const order: string[] = [];

    const failures = await runner.run([
      {
        label: 'slow',
        fn: async () => {
          order.push('slow-start');
          await sleep(10);
          order.push('slow-end');
        },
      },
      {
        label: 'fast',
        fn: async () => {
          order.push('fast-start');
        },
      },
      {
        label: 'broken',
        fn: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
    ]);

    expect(failures).toBe(1);
    const out = text();
    expect(out).toContain('✓ slow');
    expect(out).toContain('✓ fast');
    expect(out).toContain('✗ broken');
    expect(out).toContain('ECONNREFUSED');
    expect(out).toMatch(/\d+ms/);
    // Both tasks started before the slow one finished → concurrent.
    expect(order.indexOf('fast-start')).toBeLessThan(order.indexOf('slow-end'));
  });

  it('respects a concurrency cap', async () => {
    const { stream } = collector(true);
    const runner = new TaskRunner({ stream, concurrency: 1 });
    let active = 0;
    let maxActive = 0;

    await runner.run(
      Array.from({ length: 4 }, (_, i) => ({
        label: `t${i}`,
        fn: async () => {
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
    const runner = new TaskRunner({ stream, unicode: false });
    await runner.run([
      { label: 'a', fn: async () => sleep(5) },
      { label: 'b', fn: async () => sleep(2) },
    ]);
    const lines = text().trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.includes('v') || line.includes('x'))).toBe(true);
  });
});

describe('Ticker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires frame callbacks on a fixed cadence', () => {
    vi.useFakeTimers();
    const ticker = new Ticker({ fps: 30 });
    let calls = 0;
    let lastDt = 0;
    ticker.onFrame((dt) => {
      calls++;
      lastDt = dt;
    });
    ticker.start();
    expect(ticker.running).toBe(true);

    vi.advanceTimersByTime(100);
    ticker.stop();
    expect(ticker.running).toBe(false);

    // 100ms at 30fps ≈ 3 frames.
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(calls).toBeLessThanOrEqual(4);
    expect(lastDt).toBeGreaterThan(0);
  });
});
