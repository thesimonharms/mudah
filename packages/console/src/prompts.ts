import * as readline from 'node:readline';

export interface PromptOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WritableStream;
  /** Bypasses the raw-mode UI entirely (used in tests and non-interactive runs). */
  forcedValue?: string;
}

/**
 * Minimal interactive prompts built on `node:readline` (text/confirm) and a
 * numbered fallback for selects. Raw-mode arrow-key selection lands in v0.2;
 * the interface is already designed for it.
 */
export class Prompts {
  private rl: readline.Interface | null = null;

  private makeReader(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
    }
    return this.rl;
  }

  /** Ask a free-text question. Returns the default when the user presses enter. */
  async ask(question: string, options: PromptOptions & { defaultValue?: string } = {}): Promise<string> {
    if (options.forcedValue !== undefined) return options.forcedValue;
    const rl = this.makeReader();
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

  /** Pick one of the choices by index (1-based). Returns the choice value. */
  async select(question: string, choices: string[], options: PromptOptions = {}): Promise<string> {
    if (options.forcedValue !== undefined) {
      const choice = choices[Number(options.forcedValue) - 1];
      if (!choice) throw new Error(`[console] Forced select value "${options.forcedValue}" is out of range.`);
      return choice;
    }
    process.stderr.write(`\n${question}\n`);
    choices.forEach((choice, i) => {
      process.stderr.write(`  ${i + 1}. ${choice}\n`);
    });
    const answer = await this.ask('Choose', options);
    const index = Number(answer) - 1;
    const choice = choices[index];
    if (!choice) {
      throw new Error(`[console] Invalid selection "${answer}".`);
    }
    return choice;
  }

  /** Close the underlying readline interface. */
  dispose(): void {
    this.rl?.close();
    this.rl = null;
  }
}
