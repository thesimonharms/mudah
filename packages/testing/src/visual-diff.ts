import type { TreeNode } from '@mudah-cli/tui';

type Op = { kind: 'eq' | 'del' | 'ins'; value: string };

/**
 * Character-aware visual diff of two `snapshot()` strings.
 *
 * Unchanged lines are prefixed with a space, deletions with `-`,
 * additions with `+`. When a single line is substituted, an extra
 * space-prefixed line shows inline `[-deleted-]{+inserted+}` markers.
 */
export function diffSnapshots(expected: string, actual: string): string {
  if (expected === actual) return '';
  const aLines = expected.split('\n');
  const bLines = actual.split('\n');
  const ops = diffSequence(aLines, bLines);
  const out: string[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op === undefined) break;
    if (op.kind === 'eq') {
      out.push(` ${op.value}`);
      i += 1;
      continue;
    }
    const dels: string[] = [];
    const ins: string[] = [];
    while (i < ops.length && ops[i]?.kind === 'del') {
      dels.push(ops[i]!.value);
      i += 1;
    }
    while (i < ops.length && ops[i]?.kind === 'ins') {
      ins.push(ops[i]!.value);
      i += 1;
    }
    if (dels.length === 1 && ins.length === 1) {
      const before = dels[0] ?? '';
      const after = ins[0] ?? '';
      out.push(`-${before}`);
      out.push(`+${after}`);
      const inline = inlineCharDiff(before, after);
      if (inline !== '') out.push(` ${inline}`);
    } else {
      for (const line of dels) out.push(`-${line}`);
      for (const line of ins) out.push(`+${line}`);
    }
  }
  return out.join('\n');
}

/**
 * Structural diff of two `tree()` nodes. Same `+` / `-` / space markers
 * as {@link diffSnapshots}, keyed by a JSON-path-like prefix.
 */
export function diffTrees(expected: TreeNode, actual: TreeNode): string {
  const lines: string[] = [];
  diffNode(expected, actual, '$', lines);
  return lines.join('\n');
}

function diffNode(
  expected: TreeNode | undefined,
  actual: TreeNode | undefined,
  path: string,
  lines: string[],
): void {
  if (expected === undefined && actual === undefined) return;
  if (expected === undefined && actual !== undefined) {
    lines.push(`+ ${path} ${summarize(actual)}`);
    return;
  }
  if (actual === undefined && expected !== undefined) {
    lines.push(`- ${path} ${summarize(expected)}`);
    return;
  }
  if (expected === undefined || actual === undefined) return;

  compareField(path, 'role', expected.role, actual.role, lines);
  compareField(path, 'name', expected.name, actual.name, lines);
  compareField(path, 'value', expected.value, actual.value, lines);
  compareField(path, 'href', expected.href, actual.href, lines);
  compareField(path, 'focused', expected.focused, actual.focused, lines);

  const expectedBounds = expected.bounds === undefined ? undefined : JSON.stringify(expected.bounds);
  const actualBounds = actual.bounds === undefined ? undefined : JSON.stringify(actual.bounds);
  if (expectedBounds !== actualBounds) {
    lines.push(`- ${path}.bounds ${expectedBounds ?? 'undefined'}`);
    lines.push(`+ ${path}.bounds ${actualBounds ?? 'undefined'}`);
  }

  const expectedKids = expected.children ?? [];
  const actualKids = actual.children ?? [];
  if (expectedKids.length !== actualKids.length) {
    lines.push(`- ${path}.children.length ${String(expectedKids.length)}`);
    lines.push(`+ ${path}.children.length ${String(actualKids.length)}`);
  }
  const n = Math.max(expectedKids.length, actualKids.length);
  for (let i = 0; i < n; i++) {
    diffNode(expectedKids[i], actualKids[i], `${path}.children[${String(i)}]`, lines);
  }
}

function compareField(
  path: string,
  key: string,
  expected: unknown,
  actual: unknown,
  lines: string[],
): void {
  if (sameValue(expected, actual)) return;
  lines.push(`- ${path}.${key} ${fmt(expected)}`);
  lines.push(`+ ${path}.${key} ${fmt(actual)}`);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function fmt(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  return JSON.stringify(value);
}

function summarize(node: TreeNode): string {
  const bits = [`role=${node.role}`];
  if (node.name !== undefined) bits.push(`name=${JSON.stringify(node.name)}`);
  return `{${bits.join(' ')}}`;
}

function inlineCharDiff(expected: string, actual: string): string {
  if (expected === actual) return '';
  const ops = diffSequence([...expected], [...actual]);
  let out = '';
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op === undefined) break;
    if (op.kind === 'eq') {
      out += op.value;
      i += 1;
      continue;
    }
    let deleted = '';
    let inserted = '';
    while (i < ops.length && ops[i]?.kind === 'del') {
      deleted += ops[i]!.value;
      i += 1;
    }
    while (i < ops.length && ops[i]?.kind === 'ins') {
      inserted += ops[i]!.value;
      i += 1;
    }
    if (deleted !== '') out += `[-${deleted}-]`;
    if (inserted !== '') out += `{+${inserted}+}`;
  }
  return out;
}

function diffSequence(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const row = dp[i];
    const prev = dp[i - 1];
    if (row === undefined || prev === undefined) continue;
    for (let j = 1; j <= m; j++) {
      row[j] = a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, row[j - 1] ?? 0);
    }
  }

  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ kind: 'eq', value: a[i - 1] ?? '' });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
      ops.push({ kind: 'ins', value: b[j - 1] ?? '' });
      j -= 1;
    } else {
      ops.push({ kind: 'del', value: a[i - 1] ?? '' });
      i -= 1;
    }
  }
  ops.reverse();
  return ops;
}
