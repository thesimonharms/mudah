import { Command } from '@mudah-cli/console';
import { decodeLspFrames, encodeLspFrame, handleLspMessage, initializeResult, type LspMessage } from '../lsp.js';

/**
 * Built-in `lsp` command: stdio JSON-RPC (Content-Length framed, with a
 * newline-delimited fallback for probes).
 */
export default class LspCommand extends Command {
  signature = 'lsp [--stdio] [--probe]';
  description = 'Language server for mudah.json keys and command signatures';

  async handle(): Promise<number> {
    if (this.option('probe') === true) {
      const ready = initializeResult();
      this.output.raw(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: ready })}\n`);
      return 0;
    }
    if (this.option('stdio') === true) {
      return this.serveStdio();
    }
    this.output.success('mudah-lsp ready');
    this.output.muted('Pass --stdio to speak JSON-RPC on stdin/stdout, or --probe to print initialize.');
    return 0;
  }

  private serveStdio(): Promise<number> {
    return new Promise((resolve) => {
      let buffer = '';
      const write = (msg: LspMessage): void => {
        process.stdout.write(encodeLspFrame(msg));
      };
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk: string) => {
        buffer += chunk;
        const decoded = decodeLspFrames(buffer);
        buffer = decoded.rest;
        for (const msg of decoded.messages) {
          if (msg.method === 'exit') {
            resolve(0);
            return;
          }
          const reply = handleLspMessage(msg);
          if (reply !== undefined) write(reply);
          if (msg.method === 'shutdown') {
            resolve(0);
          }
        }
      });
      process.stdin.on('end', () => resolve(0));
    });
  }
}
