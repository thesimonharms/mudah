import { s } from '@mudah-cli/config';
import { Form } from './form.js';
import { Pager } from './pager.js';
import { Screen } from './screens.js';
import { Toolbar } from './toolbar.js';
import { List, Table, TextInput } from './widgets.js';

export interface WidgetRef {
  role: string;
  options: string[];
}

function roleOf(component: { inspect?: () => { role: string } | undefined; constructor: { name: string } }): string {
  return component.inspect?.()?.role ?? component.constructor.name.toLowerCase();
}

/**
 * Instantiate built-in widgets, read `inspect().role`, and pair each with
 * its constructor options. Form / Screen.* / TestTui are documented rows
 * (those APIs are not `inspect()` widgets).
 */
export function widgetReference(): WidgetRef[] {
  const list = new List(['one', 'two']);
  const table = new Table([{ header: 'name' }], [['alpha']]);
  const input = new TextInput();
  const toolbar = new Toolbar({ items: [{ id: 'run', label: 'Run' }], name: 'Actions' });
  const pager = new Pager({ title: 'Help', lines: ['line'] });
  // Prove Form / Screen construct; roles come from inspect() on the root.
  const form = Form.fromSchema(s.object({ name: s.string() }), 'Demo');
  const picker = Screen.picker({ title: 'Pick', items: ['a', 'b'] });
  form.root.inspect?.();
  picker.root.inspect?.();

  return [
    { role: roleOf(list), options: ['items', 'onSelect'] },
    { role: roleOf(table), options: ['columns', 'rows', 'onSelect', 'viewportHeight'] },
    { role: roleOf(input), options: ['onSubmit', 'width', 'value', 'cursor', 'onChange'] },
    { role: roleOf(toolbar), options: ['items', 'onSelect', 'name'] },
    { role: roleOf(pager), options: ['lines', 'title'] },
    { role: 'form', options: ['schema', 'title'] },
    { role: 'Screen.picker', options: ['title', 'items'] },
    { role: 'Screen.wizard', options: ['title', 'steps'] },
    { role: 'Screen.dashboard', options: ['title', 'sidebar', 'columns', 'rows', 'ratio'] },
    { role: 'Screen.form', options: ['title', 'schema'] },
    { role: 'Screen.table', options: ['title', 'columns', 'rows', 'select'] },
    { role: 'Screen.tree', options: ['title', 'nodes'] },
    { role: 'TestTui', options: ['cols', 'rows', 'snapshotDir'] },
  ];
}

/** Markdown tables matching {@link widgetReference}. Written to WIDGETS.md. */
export function widgetReferenceMarkdown(): string {
  const rows = widgetReference()
    .map((entry) => `| \`${entry.role}\` | ${entry.options.map((o) => `\`${o}\``).join(', ')} |`)
    .join('\n');
  return `# TUI widget reference

Generated from \`widgetReference()\` (instantiate + \`inspect()\`).

| role | options |
| --- | --- |
${rows}
`;
}
