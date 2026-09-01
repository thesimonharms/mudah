import { describe, expect, it } from 'vitest';
import { pollTerminalSize } from '@mudah-cli/terminal';

describe('pollTerminalSize', () => {
  it('uses injectable columns and rows first', () => {
    expect(pollTerminalSize({ columns: 120, rows: 40 })).toEqual({ cols: 120, rows: 40 });
  });

  it('falls back to ioctl when stdout size is missing', () => {
    expect(
      pollTerminalSize({
        columns: 0,
        rows: 0,
        ioctl: () => ({ cols: 90, rows: 30 }),
      }),
    ).toEqual({ cols: 90, rows: 30 });
  });

  it('falls back to tput cols / tput lines', () => {
    expect(
      pollTerminalSize({
        columns: 0,
        rows: 0,
        ioctl: () => undefined,
        tput: (name) => (name === 'cols' ? '100' : '28'),
      }),
    ).toEqual({ cols: 100, rows: 28 });
  });

  it('uses COLUMNS / LINES from env after tput', () => {
    expect(
      pollTerminalSize({
        columns: 0,
        rows: 0,
        ioctl: () => null,
        tput: () => undefined,
        env: { COLUMNS: '64', LINES: '16' },
      }),
    ).toEqual({ cols: 64, rows: 16 });
  });

  it('defaults to 80x24', () => {
    expect(
      pollTerminalSize({
        columns: 0,
        rows: 0,
        ioctl: () => undefined,
        tput: () => undefined,
        env: {},
      }),
    ).toEqual({ cols: 80, rows: 24 });
  });

  it('skips a throwing ioctl and continues', () => {
    expect(
      pollTerminalSize({
        columns: 0,
        rows: 0,
        ioctl: () => {
          throw new Error('ENOTTY');
        },
        tput: (name) => (name === 'cols' ? 81 : 25),
      }),
    ).toEqual({ cols: 81, rows: 25 });
  });
});
