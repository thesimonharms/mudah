#!/usr/bin/env node
/**
 * Bundle @thesimonharms/convert-img into one self-contained ESM file.
 *
 * The whole framework is inlined, so the published package has ZERO runtime
 * dependencies — `bunx @thesimonharms/convert-img` installs one tiny tarball
 * and runs. Image codecs come from Bun.Image (bun runtime) with automatic
 * fallback to system tools (magick/ffmpeg/heif) under Node.
 */
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = `${root}dist`;

await mkdir(dist, { recursive: true });

const result = await build({
  entryPoints: [`${root}src/main.ts`],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  outfile: `${dist}/convert-img.mjs`,
  banner: {
    js: '#!/usr/bin/env bun',
  },
  // Keep it readable; the bundle is small (~100 kB).
  minify: false,
  sourcemap: false,
  legalComments: 'inline',
  logLevel: 'info',
});

if (result.errors.length > 0) {
  process.exit(1);
}
