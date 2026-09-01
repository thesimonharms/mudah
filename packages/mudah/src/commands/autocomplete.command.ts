import { Command } from '@mudah-cli/console';
import { normalizeAutocompleteShell, renderAutocompleteScript } from '../autocomplete.js';

/**
 * Built-in `autocomplete` — print a bash/zsh/fish completion script
 * that calls `<bin> complete`.
 */
export default class AutocompleteCommand extends Command {
  signature = 'autocomplete {shell=bash}';
  description = 'Emit a shell completion script';

  async handle() {
    const shell = normalizeAutocompleteShell(String(this.arg('shell') ?? 'bash'));
    this.output.raw(renderAutocompleteScript(this.app.manifest.bin, shell));
  }
}
