import { describe, expect, it } from 'vitest';
import { FramePresenter } from '@mudah-cli/vgpu';
import { detectCapabilities } from '@mudah-cli/terminal';

describe('FramePresenter', () => {
  it('uses Kitty graphics when the capability is on', () => {
    let out = '';
    const caps = detectCapabilities({
      isTty: true,
      env: { TERM: 'xterm-kitty', COLORTERM: 'truecolor' },
    });
    const presenter = new FramePresenter({
      stdout: { write: (data) => void (out += data) },
      capabilities: caps,
      mode: 'auto',
    });
    expect(presenter.mode).toBe('kitty');
    presenter.present(Uint8Array.of(255, 0, 0, 255), 1, 1);
    expect(out.startsWith('\x1b_G')).toBe(true);
    expect(out).toContain('a=T');
  });

  it('falls back to half-blocks when Kitty graphics is absent', () => {
    let out = '';
    const caps = detectCapabilities({
      isTty: true,
      env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    const presenter = new FramePresenter({
      stdout: { write: (data) => void (out += data) },
      capabilities: caps,
    });
    expect(presenter.mode).toBe('half');
    presenter.present(Uint8Array.of(10, 20, 30, 255, 40, 50, 60, 255), 1, 2);
    expect(out).toContain('▀');
    expect(out).not.toContain('\x1b_G');
  });
});
