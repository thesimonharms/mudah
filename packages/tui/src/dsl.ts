import { Column, Row } from './layout.js';
import { Label, List } from './widgets.js';
import type { Component } from './component.js';

/** JSON layout node compiled by {@link fromLayout}. */
export interface LayoutNode {
  type: 'column' | 'row' | 'label' | 'list';
  children?: LayoutNode[];
  text?: string;
  items?: string[];
}

/**
 * Compile a declarative JSON layout into a Component tree.
 *
 * Supported types: `column`, `row`, `label`, `list`.
 */
export function fromLayout(json: LayoutNode): Component {
  switch (json.type) {
    case 'column': {
      const column = new Column();
      for (const child of json.children ?? []) column.add(fromLayout(child));
      return column;
    }
    case 'row': {
      const row = new Row();
      for (const child of json.children ?? []) row.add(fromLayout(child));
      return row;
    }
    case 'label':
      return new Label(json.text ?? '');
    case 'list':
      return new List(json.items ?? []);
    default: {
      const never: never = json.type;
      throw new Error(`[tui] fromLayout: unknown type "${String(never)}"`);
    }
  }
}
