import { createInterface } from 'node:readline';
import { Command } from '@mudah-cli/console';
import { handleLspMessage, type LspMessage } from '../lsp.js';

/**
 * Built-in `lsp` command: a stdio JSON-RPC subset for Mudah apps.
 * Default (and `--probe`) prints ready and exits. `--stdio` speaks LSP.
 */
export default class LspCommand extends Command {
  signature = 'lsp [--stdio] [--probe]';
  description = 'Language server for mudah.json keys and command signatures';

  async handle(): Promise<number> {
    if (this.option('stdio') === true) {
      return this.serveStdio();
    }
    this.output.success('mudah-lsp ready');
    this.output.muted('Pass --stdio to speak JSON-RPC on stdin/stdout.');
    return 0;
  }

  private serveStdio(): Promise<number> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === '') return;
        let msg: LspMessage;
        try {
          msg = JSON.parse(trimmed) as LspMessage;
        } catch {
          return;
        }
        if (msg.method === 'exit') {
          rl.close();
          resolve(0);
          return;
        }
        const reply = handleLspMessage(msg);
        if (reply !== undefined) process.stdout.write(`${JSON.stringify(reply)}\n`);
        if (msg.method === 'shutdown') {
          rl.close();
          resolve(0);
        }
      });
      rl.on('close', () => resolve(0));
    });
  }
}
