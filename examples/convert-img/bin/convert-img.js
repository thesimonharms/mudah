#!/usr/bin/env bun
// Published builds ship a self-contained bundle in dist/ (no src/).
// In a checkout, src/ exists — run the TypeScript sources directly so dev
// is always fresh (bun executes TS natively).
import { access, constants } from 'node:fs/promises';

const src = new URL('../src/main.ts', import.meta.url);
const bundled = new URL('../dist/convert-img.mjs', import.meta.url);

const hasSrc = await access(src, constants.F_OK).then(
  () => true,
  () => false,
);

if (hasSrc) {
  await import(src.href);
} else {
  await import(bundled.href);
}
