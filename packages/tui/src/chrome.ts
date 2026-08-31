import { BaseComponent } from './component.js';
import { hyperlinkWrap } from '@mudah-cli/terminal';
import { formatKeys } from './keymap.js';

/** One-row status line. Not focusable. */
export class StatusBar extends BaseComponent {
  constructor(private slots: () => string[]) {
    super();
  }

  render(): string[] {
    return [this.slots().filter(Boolean).join('  ·  ')];
  }

  inspect(): { role: string } {
    return { role: 'status' };
  }

  readonly focusable = false;
}

/** Help line generated from a keymap. Not focusable. */
export class HelpFooter extends BaseComponent {
  constructor(private map: Record<string, string>) {
    super();
  }

  static from(map: Record<string, string>): HelpFooter {
    return new HelpFooter(map);
  }

  render(): string[] {
    return [formatKeys(this.map)];
  }

  inspect(): { role: string } {
    return { role: 'help' };
  }

  readonly focusable = false;
}

/** OSC 8 hyperlink. Renders as clickable text in supporting terminals. */
export class Hyperlink extends BaseComponent {
  constructor(
    private text: string,
    private uri: string,
  ) {
    super();
  }

  render(): string[] {
    return [this.text];
  }

  paintExtras(stream: { write(data: string): unknown }, x: number, y: number): void {
    stream.write(`\x1b[${y + 1};${x + 1}H${hyperlinkWrap(this.uri, this.text)}`);
  }

  inspect(): { role: string; name?: string; href?: string } {
    return { role: 'link', name: this.text, href: this.uri };
  }

  readonly focusable = false;
}
