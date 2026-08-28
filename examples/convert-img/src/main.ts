/**
 * The published entry point for @thesimonharms/convert-img.
 *
 * - Commands are registered explicitly (bundled apps can't rely on
 *   filesystem discovery of src/commands).
 * - The manifest is baked (no mudah.json needed in arbitrary cwds).
 * - Bare invocation maps to the TUI wizard; --help still shows the list.
 */
import { run } from '@mudah-cli/mudah';
import ConvertCommand from './commands/convert.command.js';
import FormatsCommand from './commands/formats.command.js';

const argv = process.argv.slice(2);
process.exitCode = await run({
  argv: argv.length > 0 ? argv : ['convert'],
  manifest: {
    name: 'convert-img',
    version: '0.1.0',
    bin: 'convert-img',
    description: 'The ultimate image converter — CLI + TUI, powered by Mudah.',
    ui: { theme: 'auto' },
  },
  commands: [
    { default: ConvertCommand },
    { default: FormatsCommand },
  ],
});
