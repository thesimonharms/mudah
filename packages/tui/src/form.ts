import type { Schema } from '@mudah-cli/config';
import { Column } from './layout.js';
import { BaseComponent } from './component.js';
import { HelpFooter } from './chrome.js';
import { keys } from './keymap.js';
import type { Program } from './program.js';
import type { KeyEvent } from '@mudah-cli/terminal';

interface Field {
  name: string;
  kind: 'string' | 'number' | 'boolean' | 'enum';
  options?: readonly string[];
  label: string;
}

function fieldsFrom(schema: Schema<unknown>): Field[] {
  if (schema.type !== 'object' || !('shape' in schema)) {
    throw new Error('[tui] Form.fromSchema expects s.object({...}).');
  }
  const shape = (schema as { shape: Record<string, Schema<unknown>> }).shape;
  const fields: Field[] = [];
  for (const [name, node] of Object.entries(shape)) {
    const label = node.describeText() ?? name;
    if (node.type === 'boolean') {
      fields.push({ name, kind: 'boolean', label });
      continue;
    }
    const enums =
      'enumValues' in node && typeof (node as { enumValues: () => readonly string[] | undefined }).enumValues === 'function'
        ? (node as { enumValues: () => readonly string[] | undefined }).enumValues()
        : undefined;
    if (enums && enums.length > 0) {
      fields.push({ name, kind: 'enum', options: enums, label });
      continue;
    }
    if (node.type === 'number') {
      fields.push({ name, kind: 'number', label });
      continue;
    }
    fields.push({ name, kind: 'string', label });
  }
  return fields;
}

class FormBody extends BaseComponent {
  readonly focusable = true;
  private index = 0;
  private readonly values: Record<string, unknown> = {};
  private draft = '';
  private enumIndex = 0;

  constructor(
    private title: string,
    private fields: Field[],
    private onSubmit: (values: Record<string, unknown>) => void,
  ) {
    super();
    for (const field of fields) {
      if (field.kind === 'boolean') this.values[field.name] = false;
      else if (field.kind === 'enum') this.values[field.name] = field.options?.[0];
      else this.values[field.name] = '';
    }
    this.loadDraft();
  }

  override render(): string[] {
    const lines = [this.title];
    this.fields.forEach((field, i) => {
      const pointer = i === this.index ? '▸ ' : '  ';
      let value = String(this.values[field.name] ?? '');
      if (i === this.index && (field.kind === 'string' || field.kind === 'number')) {
        value = `${this.draft}▏`;
      }
      if (field.kind === 'boolean') value = this.values[field.name] ? '[x]' : '[ ]';
      if (field.kind === 'enum') value = String(this.values[field.name] ?? '');
      lines.push(`${pointer}${field.label}: ${value}`);
    });
    lines.push('', 'tab next · enter submit · space toggle');
    return lines;
  }

  override onKey(event: KeyEvent): boolean {
    const field = this.fields[this.index];
    if (!field) return false;
    if (event.name === 'tab' || event.name === 'down') {
      this.commitDraft();
      this.index = (this.index + 1) % this.fields.length;
      this.loadDraft();
      return true;
    }
    if (event.name === 'shift-tab' || event.name === 'up') {
      this.commitDraft();
      this.index = (this.index - 1 + this.fields.length) % this.fields.length;
      this.loadDraft();
      return true;
    }
    if (event.name === 'space' && field.kind === 'boolean') {
      this.values[field.name] = !this.values[field.name];
      return true;
    }
    if ((event.name === 'left' || event.name === 'right') && field.kind === 'enum' && field.options) {
      const delta = event.name === 'right' ? 1 : -1;
      this.enumIndex = (this.enumIndex + delta + field.options.length) % field.options.length;
      this.values[field.name] = field.options[this.enumIndex];
      return true;
    }
    if (event.name === 'backspace' && (field.kind === 'string' || field.kind === 'number')) {
      this.draft = this.draft.slice(0, -1);
      return true;
    }
    if (event.ch !== undefined && event.ch >= ' ' && (field.kind === 'string' || field.kind === 'number')) {
      this.draft += event.ch;
      return true;
    }
    if (event.name === 'enter') {
      this.commitDraft();
      this.onSubmit({ ...this.values });
      return true;
    }
    return false;
  }

  private commitDraft(): void {
    const field = this.fields[this.index];
    if (!field) return;
    if (field.kind === 'string') this.values[field.name] = this.draft;
    if (field.kind === 'number') this.values[field.name] = Number(this.draft) || 0;
  }

  private loadDraft(): void {
    const field = this.fields[this.index];
    if (!field) return;
    if (field.kind === 'string' || field.kind === 'number') {
      this.draft = String(this.values[field.name] ?? '');
    }
    if (field.kind === 'enum' && field.options) {
      this.enumIndex = Math.max(0, field.options.indexOf(String(this.values[field.name])));
    }
  }
}

/** Build a form from an `s.object` schema. */
export class Form {
  readonly root: Column;
  private submitted: Record<string, unknown> | undefined;
  private done: (() => void) | undefined;

  private constructor(fields: Field[], title = 'Form') {
    const body = new FormBody(title, fields, (values) => {
      this.submitted = values;
      this.done?.();
    });
    this.root = new Column().add(body, new HelpFooter(keys.form));
  }

  static fromSchema(schema: Schema<unknown>, title = 'Form'): Form {
    return new Form(fieldsFrom(schema), title);
  }

  result(): Record<string, unknown> | undefined {
    return this.submitted;
  }

  /** Called after submit. Use this to pop a Stack. */
  onComplete(fn: (values: Record<string, unknown>) => void): this {
    const prior = this.done;
    this.done = () => {
      fn(this.submitted ?? {});
      prior?.();
    };
    return this;
  }

  attach(program: Program): void {
    const prior = this.done;
    this.done = () => {
      prior?.();
      program.quit();
    };
    program.mount(this.root);
  }
}
