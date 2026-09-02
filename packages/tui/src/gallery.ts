import { Column, type Layout } from './layout.js';
import { HelpFooter } from './chrome.js';
import { Label } from './widgets.js';
import type { KeyEvent } from '@mudah-cli/terminal';

export interface StoryFactory {
  name: string;
  build: (cols: number, rows: number) => Layout;
}

/**
 * Interactive widget gallery. Left/right pick a story. `+`/`-` change the
 * size. Escape is left unhandled so Program can quit.
 */
export class StorybookGallery extends Column {
  index = 0;
  cols: number;
  rows: number;

  constructor(
    private readonly stories: StoryFactory[],
    cols = 40,
    rows = 8,
  ) {
    super();
    if (stories.length === 0) throw new Error('[tui] StorybookGallery needs at least one story.');
    this.cols = Math.max(16, cols);
    this.rows = Math.max(4, rows);
    this.rebuild();
  }

  get current(): string {
    return this.stories[this.index]?.name ?? '';
  }

  cycle(delta: number): void {
    const count = this.stories.length;
    this.index = (this.index + delta + count) % count;
    this.rebuild();
  }

  resizeFrame(dCols: number, dRows: number): void {
    this.cols = Math.max(16, this.cols + dCols);
    this.rows = Math.max(4, this.rows + dRows);
    this.rebuild();
  }

  private rebuild(): void {
    const story = this.stories[this.index]!;
    this.children.length = 0;
    this.add(
      new Label(`${story.name}  ${this.cols}x${this.rows}`),
      story.build(this.cols, this.rows),
      new HelpFooter({ left: 'prev', right: 'next', '+': 'wider', '-': 'narrower', escape: 'quit' }),
    );
    this.resize(this.cols, this.rows);
    this.refocus();
  }

  override handleKey(event: KeyEvent): boolean {
    if (event.kind === 'release') return false;
    if (event.name === 'left') {
      this.cycle(-1);
      return true;
    }
    if (event.name === 'right') {
      this.cycle(1);
      return true;
    }
    if (event.ch === '+' || event.name === '+') {
      this.resizeFrame(4, 0);
      return true;
    }
    if (event.ch === '-' || event.name === '-') {
      this.resizeFrame(-4, 0);
      return true;
    }
    if (event.ch === '=' && event.shift) {
      this.resizeFrame(4, 0);
      return true;
    }
    return super.handleKey(event);
  }

  override inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'storybook', name: this.current, value: { cols: this.cols, rows: this.rows } };
  }
}
