import * as readline from 'node:readline';
import { KeyParser } from '@mudah-cli/terminal';

export interface PromptOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WritableStream;
  /** Bypasses the interactive UI entirely (tests and non-interactive runs). */
  forcedValue?: string;
}

/** What the caller gets back from an interactive select. */
export interface SelectResult {
  index: number;
  value: string;
}

interface RawSelectOptions extends PromptOptions {
  multi: boolean;
  defaultChecked?: number[];
}

/**
 * Interactive prompts.
 *
 * - Non-TTY (piped/CI) or `forcedValue` set: no raw mode is touched; answers
 *   come from defaults/forced values, and list prompts fall back to numbered
 *   menus over readline so piped scripts keep working.
 * - TTY: text uses readline; select/multiselect run a raw-mode arrow-key UI
 *   through {@link KeyParser} (↑↓ move, space toggles, enter submits).
 */
export class Prompts {
  private rl: readline.Interface | null = null;

  private makeReader(input?: NodeJS.ReadStream, output?: NodeJS.WritableStream): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: input ?? process.stdin,
        output: output ?? process.stdout,
        terminal: process.stdin.isTTY === true,
      });
    }
    return this.rl;
  }

  /** Ask a free-text question. Returns the default when the user presses enter. */
  async ask(question: string, options: PromptOptions & { defaultValue?: string } = {}): Promise<string> {
    if (options.forcedValue !== undefined) return options.forcedValue;
    const rl = this.makeReader(options.input, options.output);
    const suffix = options.defaultValue !== undefined ? ` (${options.defaultValue})` : '';
    return new Promise((resolve) => {
      rl.question(`${question}${suffix} `, (answer) => {
        resolve(answer.trim() === '' && options.defaultValue !== undefined ? options.defaultValue : answer.trim());
      });
    });
  }

  /** Ask a yes/no question. */
  async confirm(question: string, options: PromptOptions & { defaultValue?: boolean } = {}): Promise<boolean> {
    if (options.forcedValue !== undefined) {
      const value = options.forcedValue.trim().toLowerCase();
      return value === 'y' || value === 'yes' || value === 'true' || value === '1';
    }
    const def = options.defaultValue ?? false;
    const answer = await this.ask(`${question} [${def ? 'Y/n' : 'y/N'}]`, { ...options, defaultValue: undefined });
    if (answer === '') return def;
    return answer.toLowerCase().startsWith('y');
  }

  /**
   * Pick one choice. Arrow keys on a TTY; numbered menu otherwise.
   * `forcedValue` accepts a 1-based number.
   */
  async select(question: string, choices: string[], options: PromptOptions = {}): Promise<string> {
    const result = await this.selectIndex(question, choices, options);
    return result.value;
  }

  /** Like {@link select} but returns the chosen index as well. */
  async selectIndex(question: string, choices: string[], options: PromptOptions = {}): Promise<SelectResult> {
    if (choices.length === 0) throw new Error('[console] select() requires at least one choice.');
    if (options.forcedValue !== undefined) {
      const index = Number(options.forcedValue) - 1;
      const choice = choices[index];
      if (!choice) throw new Error(`[console] Forced select value "${options.forcedValue}" is out of range.`);
      return { index, value: choice };
    }

    // A caller-provided input stream decides interactivity (fake TTYs in
    // tests); plain process.stdin falls back to numbered menus when piped.
    const interactive = (options.input ?? process.stdin).isTTY === true;
    if (!interactive) {
      writeOut(options.output, `\n${question}\n`);
      choices.forEach((choice, i) => writeOut(options.output, `  ${i + 1}. ${choice}\n`));
      const answer = await this.ask('Choose', options);
      const index = Number(answer) - 1;
      const choice = choices[index];
      if (!choice) throw new Error(`[console] Invalid selection "${answer}".`);
      return { index, value: choice };
    }

    const result = await rawSelect(question, choices, { ...options, multi: false });
    return { index: result.index, value: result.value };
  }

  /**
   * Pick any number of choices (space toggles, enter submits). Returns
   * checked values in display order; comma-separated fallback when piped.
   */
  async multiselect(
    question: string,
    choices: string[],
    options: PromptOptions & { defaultChecked?: number[] } = {},
  ): Promise<string[]> {
    const indices = await this.multiSelectIndices(question, choices, options);
    return indices.map((i) => choices[i]!);
  }

  /** Like {@link multiselect} but returns selected indices. */
  async multiSelectIndices(
    question: string,
    choices: string[],
    options: PromptOptions & { defaultChecked?: number[] } = {},
  ): Promise<number[]> {
    if (choices.length === 0) throw new Error('[console] multiselect() requires at least one choice.');
    if (options.forcedValue !== undefined) {
      return parseNumberList(options.forcedValue, choices.length);
    }

    const interactive = (options.input ?? process.stdin).isTTY === true;
    if (!interactive) {
      writeOut(options.output, `\n${question}\n`);
      choices.forEach((choice, i) => writeOut(options.output, `  ${i + 1}. ${choice}\n`));
      const answer = await this.ask('Choose (comma-separated numbers)', options);
      return parseNumberList(answer, choices.length);
    }

    const result = await rawSelect(question, choices, { ...options, multi: true });
    return result.indices ?? [];
  }

  /** Masked free-text question. No local echo on TTYs; asterisk feedback only. */
  async password(question: string, options: PromptOptions = {}): Promise<string> {
    if (options.forcedValue !== undefined) return options.forcedValue;
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;

    writeOut(output, `${question} `);
    if (input.isTTY !== true) {
      const rl = this.makeReader(options.input, options.output);
      const answer = await new Promise<string>((resolve) => rl.question('', resolve));
      writeOut(output, '\n');
      return answer;
    }

    const wasRaw = (input as unknown as { isRaw?: boolean }).isRaw ?? false;
    input.setRawMode(true);
    input.resume();
    let value = '';
    try {
      await new Promise<void>((resolve) => {
        const parser = new KeyParser();
        const onKey = (chunk: Buffer | string): void => {
          for (const event of parser.feed(String(chunk))) {
            if (event.name === 'enter') {
              input.off('data', onKey);
              resolve();
              return;
            }
            if (event.name === 'backspace') {
              value = value.slice(0, -1);
            } else if (event.ch !== undefined && event.ch >= ' ') {
              value += event.ch;
              writeOut(output, '*');
            }
          }
        };
        input.on('data', onKey);
      });
    } finally {
      input.setRawMode(wasRaw);
      writeOut(output, '\n');
    }
    return value;
  }
}

/** The shared raw-mode arrow-key picker used by select/multiselect on TTYs. */
function rawSelect(
  question: string,
  choices: string[],
  options: RawSelectOptions & { multi: boolean },
): Promise<SelectResult & { indices?: number[] }> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  return new Promise((resolve) => {
    let cursor = 0;
    const checked = new Set<number>(options.multi ? (options.defaultChecked ?? []) : []);
    let frameHeight = 0;
    const parser = new KeyParser();

    const render = (): string[] => {
      const lines = [`${question}`];
      choices.forEach((choice, i) => {
        const pointer = i === cursor ? '❯ ' : '  ';
        const box = options.multi ? (checked.has(i) ? '[x] ' : '[ ] ') : '';
        lines.push(`${pointer}${box}${choice}`);
      });
      lines.push('', options.multi ? 'space toggle · ↑↓ move · enter submit' : '↑↓ move · enter choose · esc cancel');
      return lines;
    };

    const draw = (): void => {
      if (frameHeight > 0) {
        writeOut(output, `\x1b[${frameHeight}A\x1b[J`);
      }
      writeOut(output, `${render().join('\n')}\n`);
      frameHeight = render().length;
    };

    const cleanup = (result: SelectResult & { indices?: number[] }): void => {
      input.off('data', onData);
      if (input.isTTY) input.setRawMode(false);
      writeOut(output, `\x1b[${frameHeight}A\x1b[J`);
      resolve(result);
    };

    const onData = (chunk: Buffer | string): void => {
      // One parser across chunks so split sequences reassemble.
      for (const event of parser.feed(String(chunk))) {
        switch (event.name) {
          case 'up':
            cursor = Math.max(0, cursor - 1);
            break;
          case 'down':
            cursor = Math.min(choices.length - 1, cursor + 1);
            break;
          case 'space':
            if (options.multi) {
              if (checked.has(cursor)) checked.delete(cursor);
              else checked.add(cursor);
            }
            break;
          case 'enter': {
            const value = choices[cursor]!;
            cleanup(
              options.multi
                ? { index: cursor, value, indices: [...checked].sort((a, b) => a - b) }
                : { index: cursor, value },
            );
            return;
          }
          case 'escape':
          case 'ctrl+c':
            cleanup({ index: -1, value: '', indices: [] });
            return;
          default:
            break;
        }
      }
      draw();
    };

    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
    draw();
  });
}

function parseNumberList(answer: string, max: number): number[] {
  const parsed = answer
    .split(',')
    .map((part) => Number(part.trim()) - 1)
    .filter((index) => index >= 0 && index < max);
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function writeOut(stream: NodeJS.WritableStream | undefined, text: string): void {
  stream?.write(text);
}
