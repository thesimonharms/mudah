import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { Program } from '@mudah-cli/mudah/tui';
import { sniffFormat, normalizeFormat } from '../src/image/formats.js';

describe('wizard components', () => {
  it('sniffing is used by findImages (sanity on the shared util)', () => {
    // The wizard scans directories with the same sniffFormat.
    expect(sniffFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))?.format).toBe('png');
    expect(normalizeFormat('jpg')).toBe('jpeg');
  });

  it('a full-screen program quits via esc keystroke', async () => {
    const emitter = new EventEmitter();
    const chunks: string[] = [];
    const input = emitter as unknown as NodeJS.ReadStream;
    (input as unknown as { isTTY: boolean }).isTTY = true;
    (input as unknown as { setRawMode: (on: boolean) => void }).setRawMode = () => {};
    (input as unknown as { resume: () => void }).resume = () => {};
    (input as unknown as { pause: () => void }).pause = () => {};

    const stdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write(data: string): void {
        chunks.push(data);
      },
    };
    const program = new Program({ stdout, stdin: input, frameMs: 5 });
    program.mount({ render: () => ['convert-img — select images'], focusable: false } as never);
    const pending = program.run();
    await new Promise((r) => setTimeout(r, 20));
    emitter.emit('data', '\x1b'); // esc
    const code = await pending;
    expect(code).toBe(0);
    expect(chunks.join('')).toContain('convert-img');
  });
});
