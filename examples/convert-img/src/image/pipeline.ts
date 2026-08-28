import { readFile, writeFile, access, constants } from 'node:fs/promises';
import { extensionFor, sniffFormat, targetFormats, normalizeFormat, type ImageFormat } from './formats.js';
import { Converter, defaultDrivers, type ConversionPlan } from './converter.js';
import type { Output } from '@mudah-cli/mudah/ui';
import { TaskRunner } from '@mudah-cli/mudah/animation';

export { extensionFor, sniffFormat, targetFormats, normalizeFormat };
export type { ImageFormat, ConversionPlan };
export { Converter, defaultDrivers };

let converter: Converter | undefined;

/** Shared engine instance (probed once per process). */
export function getConverter(): Converter {
  converter ??= new Converter(defaultDrivers());
  return converter;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Read a file and identify its format. */
export async function loadImage(path: string): Promise<{ bytes: Uint8Array; format: ImageFormat }> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch {
    throw new Error(`No such file: ${path}`);
  }
  const sniffed = sniffFormat(bytes);
  if (!sniffed) {
    throw new Error(`${path}: unrecognized image format (magic bytes)`);
  }
  return { bytes, format: sniffed.format };
}

/** Output path for input → target format, honoring --outdir and suffix. */
export function outputPathFor(
  input: string,
  to: ImageFormat,
  options: { outdir?: string; suffix?: string } = {},
): string {
  const dot = input.lastIndexOf('.');
  const stem = dot > 0 ? input.slice(0, dot) : input;
  const base = `${stem}${options.suffix ?? ''}.${extensionFor(to)}`;
  if (options.outdir === undefined) return base;
  const sep = options.outdir.endsWith('/') ? '' : '/';
  return `${options.outdir}${sep}${base.split('/').at(-1)}`;
}

export interface BatchOptions {
  to: ImageFormat;
  quality?: number;
  outdir?: string;
  suffix?: string;
  /** Overwrite existing outputs (default true; false skips existing). */
  overwrite?: boolean;
}

export interface BatchItemResult {
  input: string;
  output: string;
  ok: boolean;
  error?: string;
  plan?: ConversionPlan;
  bytes?: number;
  ms?: number;
}

/**
 * Convert many files concurrently with live per-file status (TaskRunner).
 * Returns per-file results in input order.
 */
export async function convertBatch(
  paths: string[],
  batch: BatchOptions,
  output?: Output,
): Promise<BatchItemResult[]> {
  const converter = getConverter();
  await converter.init();

  const results = new Map<string, BatchItemResult>();
  const runner = new TaskRunner({ unicode: output?.colorLevel !== 0 || undefined });

  const tasks = paths.map((path) => ({
    label: shortName(path),
    fn: async (): Promise<void> => {
      const started = performance.now();
      try {
        const { bytes, format } = await loadImage(path);
        if (format === batch.to) {
          results.set(path, {
            input: path,
            output: outputPathFor(path, batch.to, batch),
            ok: false,
            error: `already ${batch.to}`,
            ms: Math.round(performance.now() - started),
          });
          return;
        }
        const outPath = outputPathFor(path, batch.to, batch);
        if (batch.overwrite === false && (await fileExists(outPath))) {
          results.set(path, { input: path, output: outPath, ok: false, error: 'exists (skip)', ms: 0 });
          return;
        }
        const converted = await converter.convert(format, batch.to, bytes, { quality: batch.quality });
        await writeFile(outPath, converted.bytes);
        results.set(path, {
          input: path,
          output: outPath,
          ok: true,
          plan: converted.plan,
          bytes: converted.bytes.byteLength,
          ms: Math.round(performance.now() - started),
        });
      } catch (error) {
        results.set(path, {
          input: path,
          output: outputPathFor(path, batch.to, batch),
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          ms: Math.round(performance.now() - started),
        });
      }
    },
  }));

  await runner.run(tasks);
  return paths.map((path) => results.get(path)!);
}

function shortName(path: string): string {
  return path.split('/').at(-1) ?? path;
}
