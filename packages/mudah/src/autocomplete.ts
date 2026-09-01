/** Shells that `--autocomplete` / `autocomplete` can emit a script for. */
export type AutocompleteShell = 'bash' | 'zsh' | 'fish';

export function normalizeAutocompleteShell(value: string | undefined): AutocompleteShell {
  if (value === 'zsh' || value === 'fish' || value === 'bash') return value;
  return 'bash';
}

/**
 * Emit a shell integration script that calls `<bin> complete` so the
 * kernel's {@link ConsoleKernel.complete} results drive tab completion.
 */
export function renderAutocompleteScript(bin: string, shell: AutocompleteShell = 'bash'): string {
  const name = bin.length > 0 ? bin : 'mudah';
  if (shell === 'zsh') {
    return `#compdef ${name}
# Mudah zsh completion — calls \`${name} complete\`
_${name}_complete() {
  local -a opts
  opts=(\${(f)"$(\${words[1]} complete -- \${words[2,-1]} 2>/dev/null)"})
  _describe 'commands' opts
}
_${name}_complete
`;
  }
  if (shell === 'fish') {
    return `# Mudah fish completion — calls \`${name} complete\`
complete -c ${name} -f -a '(${name} complete (commandline -opc)[2..-1])'
`;
  }
  return `# Mudah bash completion — calls \`${name} complete\`
_${name}_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local words
  words="$(\${COMP_WORDS[0]} complete -- "\${COMP_WORDS[@]:1}" 2>/dev/null)"
  COMPREPLY=($(compgen -W "\${words}" -- "\${cur}"))
}
complete -F _${name}_complete ${name}
`;
}
