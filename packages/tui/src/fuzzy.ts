import type { KeyEvent } from '@mudah-cli/terminal';
import { Column } from './layout.js';
import { List, TextInput } from './widgets.js';

/** Filterable list. Type to narrow. Enter selects. */
export class FuzzyList extends Column {
  private readonly all: string[];
  private readonly list: List;
  private readonly input: TextInput;
  private onPick?: (item: string, index: number) => void;

  constructor(items: string[], onSelect?: (item: string, index: number) => void) {
    super();
    this.all = items;
    this.onPick = onSelect;
    this.input = new TextInput();
    this.list = new List(items, (index) => {
      const item = this.list.selected;
      if (item !== undefined) this.onPick?.(item, index);
    });
    this.input.onChange = (value) => {
      const q = value.toLowerCase();
      this.list.setItems(this.all.filter((item) => item.toLowerCase().includes(q)));
    };
    const type = this.input.onKey.bind(this.input);
    this.input.onKey = (event: KeyEvent) => {
      if (event.name === 'down' || event.name === 'up' || event.name === 'enter') {
        return this.list.onKey(event);
      }
      return type(event);
    };
    this.add(this.input, this.list);
  }

  override handleKey(event: KeyEvent): boolean {
    if (event.kind === 'release') return false;
    if (event.name === 'down' || event.name === 'up' || event.name === 'enter') {
      return this.list.onKey(event);
    }
    return super.handleKey(event);
  }

  inspect(): { role: string } {
    return { role: 'fuzzy' };
  }
}
