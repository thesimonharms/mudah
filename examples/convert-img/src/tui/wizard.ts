import { BaseComponent, Container, Label, Program } from '@mudah-cli/mudah/tui';
import type { KeyEvent } from '@mudah-cli/mudah/terminal';
import type { Output } from '@mudah-cli/mudah/ui';
import { readdir, readFile } from "node:fs/promises";
import { sniffFormat, targetFormats, type ImageFormat } from '../image/pipeline.js';
import { convertBatch } from '../image/pipeline.js';

/** Image files in a directory (magic-byte verified, not extension). */
async function findImages(dir: string = '.'): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => (dir === '.' ? e.name : `${dir}/${e.name}`));
  const images: string[] = [];
  for (const file of files) {
    try {
      const head = new Uint8Array((await readFile(file)).subarray(0, 16));
      if (sniffFormat(head)) images.push(file);
    } catch {
      // unreadable: skip
    }
  }
  return images.sort();
}

type Stage = 'files' | 'format';

/**
 * The two-stage wizard as a single Component — dogfooding the custom-widget
 * contract. State: file checklist → format list. Enter advances; esc quits.
 */
class Wizard extends BaseComponent {
  readonly focusable = true;
  private stage: Stage = 'files';
  private cursor = 0;
  private readonly chosen = new Set<number>();
  private choice: WizardResult | undefined;

  constructor(
    private readonly images: string[],
    private onDone: (choice: WizardResult | undefined) => void,
  ) {
    super();
  }

  /** The resolved choice after enter, or undefined if cancelled. */
  get result(): WizardResult | undefined {
    return this.choice;
  }

  chosenCount(): number {
    return this.chosen.size;
  }

  atFilesStage(): boolean {
    return this.stage === 'files';
  }

  override render(): string[] {
    if (this.stage === 'files') {
      const lines = [`convert-img — select images (${this.chosen.size} chosen)`];
      this.images.forEach((image, i) => {
        const pointer = i === this.cursor ? '❯ ' : '  ';
        const box = this.chosen.has(i) ? '[x] ' : '[ ] ';
        lines.push(`${pointer}${box}${image}`);
      });
      lines.push('', 'space toggle · a select all · enter continue · esc quit');
      return lines;
    }
    const lines = ['convert-img — target format'];
    targetFormats.forEach((format, i) => {
      const pointer = i === this.cursor ? '❯ ' : '  ';
      lines.push(`${pointer}${format.toUpperCase()}`);
    });
    lines.push('', '↑↓ move · enter convert · esc quit');
    return lines;
  }

  override onKey(event: KeyEvent): boolean {
    const max = (this.stage === 'files' ? this.images.length : targetFormats.length) - 1;
    switch (event.name) {
      case 'up':
        this.cursor = Math.max(0, this.cursor - 1);
        return true;
      case 'down':
        this.cursor = Math.min(max, this.cursor + 1);
        return true;
      case 'space': {
        if (this.stage !== 'files') return true;
        if (this.chosen.has(this.cursor)) this.chosen.delete(this.cursor);
        else this.chosen.add(this.cursor);
        return true;
      }
      case 'a': {
        if (this.stage !== 'files') return true;
        if (this.chosen.size === this.images.length) this.chosen.clear();
        else this.images.forEach((_, i) => this.chosen.add(i));
        return true;
      }
      case 'enter': {
        if (this.stage === 'files') {
          if (this.chosen.size === 0) return true; // require a pick
          this.stage = 'format';
          this.cursor = 0;
        } else {
          const to = targetFormats[this.cursor];
          if (to) {
            const files = [...this.chosen].sort((a, b) => a - b).map((i) => this.images[i]!);
            this.choice = { files, to };
            const done = this.onDone;
            this.onDone = () => {};
            done(this.choice);
          }
        }
        return true;
      }
      case 'escape':
      case 'ctrl+c': {
        // Let Program handle quit; mark cancelled first.
        this.choice = undefined;
        const done = this.onDone;
        this.onDone = () => {};
        done(undefined);
        return false; // Program sees escape and quits with 0
      }
      default:
        return false;
    }
  }

  /** Mark the wizard cancelled (used by esc paths). */
  cancel(): void {
    this.choice = undefined;
  }
}

export interface WizardResult {
  files: string[];
  to: ImageFormat;
}

/**
 * Run the interactive wizard on the alternate screen. Resolves the chosen
 * files + format, or undefined when the user cancels.
 */
export async function pickWithWizard(images: string[]): Promise<WizardResult | undefined> {
  const program = new Program({ frameMs: 16 });
  const wizard = new Wizard(images, (choice) => program.quit());
  program.mount(new Container().add(wizard));

  const exitCode = await program.run();
  void exitCode;
  // Read the wizard's final state: if quit came from enter we already
  // captured the choice via the callback; escaping lands here with stage
  // still 'files' or no selection made.
  if (wizard.chosenCount() === 0 && wizard.atFilesStage()) return undefined;
  return wizard.result;
}

/**
 * Full wizard flow: discover images, pick, convert, report. Returns the
 * process exit code.
 */
export async function runWizard(output: Output): Promise<number> {
  if (process.stdout.isTTY !== true) {
    output.error('The wizard needs an interactive terminal.');
    output.hint('Use: convert-img convert <files...> --to=webp');
    return 2;
  }

  const images = await findImages();
  if (images.length === 0) {
    output.error('No images found in the current directory.');
    output.hint('Supported inputs: png, jpeg, webp, gif (plus heic/avif where tools exist).');
    return 1;
  }

  const choice = await pickWithWizard(images);
  if (!choice) {
    output.muted('Cancelled.');
    return 0;
  }

  const results = await convertBatch(choice.files, { to: choice.to, quality: 85 });
  for (const result of results) {
    if (result.ok) output.success(`${result.input} → ${result.output}  (${result.bytes ?? 0} bytes, ${result.ms ?? 0}ms)`);
    else output.error(`${result.input}: ${result.error}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  output.keyValue('converted', String(results.length - failed));
  if (failed > 0) output.keyValue('failed', String(failed));
  return failed > 0 ? 1 : 0;
}
