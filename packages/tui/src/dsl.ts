import { Column, Row, Split } from './layout.js';
import { Checkbox, Label, List, Panel, ProgressBar } from './widgets.js';
import type { Component } from './component.js';

/** JSON/YAML layout node compiled by {@link fromLayout}. */
export interface LayoutNode {
  type: 'column' | 'row' | 'split' | 'label' | 'list' | 'panel' | 'checkbox' | 'progress';
  children?: LayoutNode[];
  text?: string;
  items?: string[];
  title?: string;
  checked?: boolean;
  value?: number;
  axis?: 'horizontal' | 'vertical';
  ratio?: number;
}

const TYPES: ReadonlySet<string> = new Set([
  'column',
  'row',
  'split',
  'label',
  'list',
  'panel',
  'checkbox',
  'progress',
]);

export class LayoutSyntaxError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`[tui] fromLayout ${path}: ${message}`);
    this.name = 'LayoutSyntaxError';
  }
}

/**
 * Compile a declarative JSON layout into a Component tree.
 *
 * Supported types: `column`, `row`, `split`, `label`, `list`, `panel`,
 * `checkbox`, `progress`.
 */
export function fromLayout(json: LayoutNode, path = '$'): Component {
  if (!TYPES.has(json.type)) {
    throw new LayoutSyntaxError(`unknown type "${String(json.type)}"`, path);
  }
  switch (json.type) {
    case 'column': {
      const column = new Column();
      for (const [i, child] of (json.children ?? []).entries()) column.add(fromLayout(child, `${path}.children[${i}]`));
      return column;
    }
    case 'row': {
      const row = new Row();
      for (const [i, child] of (json.children ?? []).entries()) row.add(fromLayout(child, `${path}.children[${i}]`));
      return row;
    }
    case 'split': {
      const kids = json.children ?? [];
      if (kids.length !== 2) throw new LayoutSyntaxError('split needs exactly two children', path);
      return new Split({ axis: json.axis ?? 'horizontal', ratio: json.ratio ?? 0.5 }).add(
        fromLayout(kids[0]!, `${path}.children[0]`),
        fromLayout(kids[1]!, `${path}.children[1]`),
      );
    }
    case 'label':
      return new Label(json.text ?? '');
    case 'list':
      return new List(json.items ?? []);
    case 'panel':
      return new Panel(json.title, (json.text ?? '').split('\n'));
    case 'checkbox':
      return new Checkbox({ label: json.text ?? json.title ?? '', checked: json.checked });
    case 'progress':
      return new ProgressBar(json.value ?? 0);
    default: {
      throw new LayoutSyntaxError(`unknown type "${String((json as { type?: unknown }).type)}"`, path);
    }
  }
}

/** Parse a JSON/YAML string or compile an already-parsed node. */
export function compileLayout(source: string | LayoutNode): Component {
  return fromLayout(typeof source === 'string' ? parseLayout(source) : source);
}

/** Parse JSON, or a small YAML subset (`type:`, nested `children:` / `items:` lists). */
export function parseLayout(source: string): LayoutNode {
  const trimmed = source.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as LayoutNode;
    if (!parsed || typeof parsed !== 'object' || !TYPES.has(parsed.type)) {
      throw new LayoutSyntaxError('JSON layout must have a known type', '$');
    }
    return parsed;
  }
  const value = parseYaml(trimmed);
  if (!isLayoutNode(value)) throw new LayoutSyntaxError('YAML layout must have a known type', '$');
  return value;
}

function isLayoutNode(value: unknown): value is LayoutNode {
  return typeof value === 'object' && value !== null && TYPES.has((value as LayoutNode).type);
}

function parseYaml(source: string): unknown {
  const lines = source.split('\n');
  let i = 0;

  const peekIndent = (): number => {
    while (i < lines.length) {
      const line = lines[i] ?? '';
      if (line.trim() === '' || line.trim().startsWith('#')) {
        i += 1;
        continue;
      }
      return line.length - line.trimStart().length;
    }
    return 0;
  };

  const parseValue = (minIndent: number): unknown => {
    const indent = peekIndent();
    if (i >= lines.length) return {};
    const line = (lines[i] ?? '').trimStart();
    if (line.startsWith('- ')) {
      const items: unknown[] = [];
      while (i < lines.length) {
        const nextIndent = peekIndent();
        if (i >= lines.length) break;
        const next = (lines[i] ?? '').trimStart();
        if (nextIndent < minIndent || !next.startsWith('- ')) break;
        i += 1;
        const rest = next.slice(2);
        if (rest === '') {
          items.push(parseValue(nextIndent + 2));
        } else if (rest.includes(':')) {
          const [k, ...restParts] = rest.split(':');
          const obj: Record<string, unknown> = {};
          assignYaml(obj, k!.trim(), restParts.join(':').trim());
          const nested = parseMap(nextIndent + 2);
          items.push({ ...obj, ...(nested as object) });
        } else {
          items.push(coerce(rest));
        }
      }
      return items;
    }
    return parseMap(indent);
  };

  const parseMap = (minIndent: number): Record<string, unknown> => {
    const obj: Record<string, unknown> = {};
    while (i < lines.length) {
      const indent = peekIndent();
      if (i >= lines.length) break;
      if (indent < minIndent) break;
      const line = (lines[i] ?? '').trimStart();
      if (line.startsWith('- ')) break;
      const colon = line.indexOf(':');
      if (colon === -1) {
        i += 1;
        continue;
      }
      const key = line.slice(0, colon).trim();
      const raw = line.slice(colon + 1).trim();
      i += 1;
      if (raw === '') obj[key] = parseValue(indent + 2);
      else assignYaml(obj, key, raw);
    }
    return obj;
  };

  return parseValue(0);
}

function assignYaml(obj: Record<string, unknown>, key: string, raw: string): void {
  obj[key] = coerce(raw);
}

function coerce(raw: string): unknown {
  const value = unquote(raw);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
