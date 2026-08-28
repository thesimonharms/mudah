import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '@mudah-cli/mudah';
import { sniffFormat, normalizeFormat, targetFormats } from '../src/image/formats.js';
import { Converter, defaultDrivers } from '../src/image/converter.js';
import { convertBatch, outputPathFor } from '../src/image/pipeline.js';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(testDir, '.fixtures');
const work = join(fixtures, 'work');

/** A real 1x1 PNG (canonical tiny fixture) used to derive every other fixture. */
const PNG_1x1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

beforeAll(async () => {
  await rm(fixtures, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  await writeFile(join(work, 'pixel.png'), PNG_1x1);
  // Derive the other formats through the same engine under test.
  const converter = new Converter(defaultDrivers());
  await converter.init();
  const caps = converter.capabilities();
  if (caps.encode.has('jpeg')) await writeFile(join(work, 'pixel.jpg'), (await converter.convert('png', 'jpeg', PNG_1x1)).bytes);
  if (caps.encode.has('webp')) await writeFile(join(work, 'pixel.webp'), (await converter.convert('png', 'webp', PNG_1x1)).bytes);
  if (caps.encode.has('heic')) await writeFile(join(work, 'pixel.heic'), (await converter.convert('png', 'heic', PNG_1x1)).bytes);
  if (caps.encode.has('gif')) await writeFile(join(work, 'pixel.gif'), (await converter.convert('png', 'gif', PNG_1x1)).bytes);
});

afterAll(async () => {
  await rm(fixtures, { recursive: true, force: true });
});

describe('format sniffing', () => {
  it('identifies png/jpeg/webp/gif from magic bytes', () => {
    expect(sniffFormat(PNG_1x1)?.format).toBe('png');
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.format).toBe('jpeg');
    expect(sniffFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))?.format).toBe('gif');
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffFormat(webp)?.format).toBe('webp');
  });

  it('identifies heic/avif by ftyp brand', () => {
    const heic = new Uint8Array(16);
    heic.set([0, 0, 0, 0x18], 0);
    heic.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
    heic.set([0x68, 0x65, 0x69, 0x63], 8); // heic
    expect(sniffFormat(heic)?.format).toBe('heic');

    const avif = new Uint8Array(16);
    avif.set([0x66, 0x74, 0x79, 0x70], 4);
    avif.set([0x61, 0x76, 0x69, 0x66], 8);
    expect(sniffFormat(avif)?.format).toBe('avif');
  });

  it('rejects unknown bytes and normalizes aliases', () => {
    expect(sniffFormat(new Uint8Array(20))).toBeUndefined();
    expect(normalizeFormat('jpg')).toBe('jpeg');
    expect(normalizeFormat('.HEIF')).toBe('heic');
    expect(normalizeFormat('svg')).toBeUndefined();
  });
});

describe('conversion engine', () => {
  it('plans direct routes preferring the bun driver when present', async () => {
    const converter = new Converter(defaultDrivers());
    await converter.init();
    const plan = converter.plan('png', 'webp');
    expect(plan).toBeDefined();
    expect(plan!.via).toBeUndefined();
    // Under Bun the native driver wins; under Node magick is the fallback.
    const bunActive = typeof Bun !== 'undefined';
    expect(plan!.drivers[0]).toBe(bunActive ? 'bun' : 'magick');
  });

  it('routes gif encode to a magick-class driver (direct or 2-hop)', async () => {
    const converter = new Converter(defaultDrivers());
    await converter.init();
    const { encode } = converter.capabilities();
    if (!encode.has('gif')) return; // skip on machines without gif encoders
    const plan = converter.plan('png', 'gif');
    expect(plan).toBeDefined();
    // Every hop must end at a driver that can produce gif.
    const lastDriver = plan!.drivers.at(-1);
    expect(['magick', 'ffmpeg']).toContain(lastDriver);
  });

  it('plans a 2-hop route through png for heic → webp', async () => {
    const converter = new Converter(defaultDrivers());
    await converter.init();
    const { decode, encode } = converter.capabilities();
    if (!decode.has('heic') || !encode.has('webp')) return;
    const plan = converter.plan('heic', 'webp');
    expect(plan).toBeDefined();
    // No single driver claims both heic-decode and webp-encode, so the
    // planner must route through PNG with two different drivers.
    expect(plan!.via).toBe('png');
    expect(plan!.drivers.length).toBe(2);
  });

  it('converts png → jpeg/webp/png with real bytes', async () => {
    const results = await convertBatch([join(work, 'pixel.png')], { to: 'jpeg', suffix: '-t' });
    expect(results[0]!.ok).toBe(true);
    const out = results[0]!.output;
    expect((await readFile(out).then(() => true, () => false))).toBe(true);
    expect(sniffFormat(new Uint8Array(await readFile(out)))?.format).toBe('jpeg');

    const webp = await convertBatch([join(work, 'pixel.png')], { to: 'webp', suffix: '-t' });
    expect(webp[0]!.ok).toBe(true);
    const bytes = new Uint8Array(await readFile(webp[0]!.output));
    expect(sniffFormat(bytes)?.format).toBe('webp');
  });

  it('refuses same-format conversions with a friendly error', async () => {
    const results = await convertBatch([join(work, 'pixel.png')], { to: 'png', suffix: '-same' });
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error).toContain('already png');
  });

  it('reports unreadable files without aborting the batch', async () => {
    const results = await convertBatch([join(work, 'nope.png')], { to: 'webp', suffix: '-t' });
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error).toContain('No such file');
  });
});

describe('output path logic', () => {
  it('honors suffix and outdir', () => {
    expect(outputPathFor('/a/b/photo.png', 'webp')).toBe('/a/b/photo.webp');
    expect(outputPathFor('/a/b/photo.png', 'jpeg', { suffix: '-small' })).toBe('/a/b/photo-small.jpg');
    expect(outputPathFor('photo.png', 'heic', { outdir: '/tmp/out' })).toBe('/tmp/out/photo.heic');
  });
});

describe('CLI end-to-end', () => {
  function streams(): {
    stdout: { write(data: string): void };
    stderr: { write(data: string): void };
    text: () => { out: string; err: string };
  } {
    const state = { out: '', err: '' };
    return {
      stdout: { write(data: string): void { state.out += data; } },
      stderr: { write(data: string): void { state.err += data; } },
      text: () => state,
    };
  }

  it('converts via the CLI and reports success', async () => {
    const s = streams();
    const code = await run({
      argv: ['convert', join(work, 'pixel.png'), '--to=webp', '--suffix=-cli'],
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    const out = s.text().out;
    expect(out).toContain('pixel-cli.webp');
    expect(out).toContain('converted');
  });

  it('lists the capability matrix via formats', async () => {
    const s = streams();
    const code = await run({
      argv: ['formats'],
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('Decoders');
    expect(s.text().out).toContain('Encoders');
  });

  it('emits a JSON report with --json', async () => {
    const s = streams();
    const code = await run({
      argv: ['convert', join(work, 'pixel.png'), '--to=jpeg', '--suffix=-js', '--json'],
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    const lines = s.text().out.trim().split('\n');
    const envelope = JSON.parse(lines.at(-1)!) as {
      ok: boolean;
      results?: Array<{ kind: string; message: string; data?: unknown }>;
    };
    expect(envelope.ok).toBe(true);
    const report = envelope.results?.find((r) => r.message === 'conversion-report');
    expect(report).toBeDefined();
    expect((report!.data as { converted: unknown[] }).converted).toHaveLength(1);
  });

  it('rejects unknown formats with a usage error (exit 2)', async () => {
    const s = streams();
    const code = await run({
      argv: ['convert', join(work, 'pixel.png'), '--to=svg'],
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(2);
    expect(s.text().err).toContain('Unknown target format');
  });
});

describe('TUI wizard (headless smoke)', () => {
  it('is importable and exposes the pieces', async () => {
    const mod = await import('../src/tui/wizard.js');
    expect(typeof mod.runWizard).toBe('function');
    expect(typeof mod.pickWithWizard).toBe('function');
  });

  it('runWizard refuses non-TTY stdout with a hint', async () => {
    const mod = await import('../src/tui/wizard.js');
    const chunks: string[] = [];
    const code = await mod.runWizard({
      error: (m: string) => chunks.push(m),
      hint: (m: string) => chunks.push(m),
    } as never);
    expect(code).toBe(2);
    expect(chunks.join('')).toContain('interactive terminal');
  });
});

describe('target format list', () => {
  it('includes the advertised formats', () => {
    for (const format of ['png', 'jpeg', 'webp', 'heic', 'gif', 'avif'] as const) {
      expect(targetFormats).toContain(format);
    }
  });
});
