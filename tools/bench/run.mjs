#!/usr/bin/env node
/**
 * Cold-start benchmarks for the example app.
 *
 *   node tools/bench/run.mjs            # full report
 *   node tools/bench/run.mjs --check    # CI mode: exit 1 if budgets are missed
 *   node tools/bench/run.mjs --runs 9   # more samples
 *
 * "Cold start" = spawn a fresh process, render the command, exit.
 * One warm-up run precedes sampling (page cache only — every sample is a
 * fresh process, so no JIT or module-cache carry-over).
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const app = join(root, 'examples', 'hello-cli');

const args = process.argv.slice(2);
const check = args.includes('--check');
const runsFlag = args.indexOf('--runs');
const runs = runsFlag !== -1 ? Number(args[runsFlag + 1] ?? 5) : 5;

// p50 budgets (ms), Node cold start, CI hardware.
const BUDGETS = {
  'node --help': 250,
  'node welcome': 300,
};

function timeOnce(cmd, argsList, cwd) {
  const start = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    execFile(cmd, argsList, { cwd }, (error) => {
      if (error) reject(error);
      else resolve(Number(process.hrtime.bigint() - start) / 1e6);
    });
  });
}

async function bench(label, cmd, argsList) {
  await timeOnce(cmd, argsList, app).catch(() => {}); // warm-up
  const samples = [];
  for (let i = 0; i < runs; i++) {
    samples.push(await timeOnce(cmd, argsList, app));
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)] ?? 0;
  const min = samples[0] ?? 0;
  console.log(`${label.padEnd(30)} p50 ${String(Math.round(p50)).padStart(5)}ms   min ${Math.round(min)}ms   (n=${runs})`);
  return p50;
}

const results = {};

results['baseline'] = await bench('baseline: node -e "hi"', 'node', ['-e', 'console.log("hi")']);
results['node --help'] = await bench('node: hello-cli --help', 'node', [join('bin', 'hello-cli.js'), '--help']);
results['node welcome'] = await bench('node: hello-cli welcome', 'node', [join('bin', 'hello-cli.js'), 'welcome']);

if (process.versions.bun) {
  await bench('bun: hello-cli --help', 'bun', [join('bin', 'hello-cli.js'), '--help']);
  await bench('bun: hello-cli welcome', 'bun', [join('bin', 'hello-cli.js'), 'welcome']);
}

console.log('');
if (check) {
  let failed = false;
  for (const [key, budget] of Object.entries(BUDGETS)) {
    const actual = results[key];
    if (actual > budget) {
      console.error(`BUDGET MISSED: ${key} p50 ${Math.round(actual)}ms > ${budget}ms`);
      failed = true;
    }
  }
  if (!failed) console.log(`Budgets OK (${Object.entries(BUDGETS).map(([k, v]) => `${k} <= ${v}ms`).join(', ')}).`);
  process.exit(failed ? 1 : 0);
}
