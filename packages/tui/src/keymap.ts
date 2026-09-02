/** Canonical keymaps. HelpFooter and StatusBar read these. Do not invent labels. */
export const keys = {
  list: { up: 'up', down: 'down', enter: 'select' },
  multi: { up: 'up', down: 'down', space: 'toggle', enter: 'submit' },
  table: { up: 'up', down: 'down', enter: 'select', n: 'insert', d: 'delete', left: 'group', right: 'group' },
  input: { enter: 'submit', 'left/right': 'caret' },
  viewport: { up: 'scroll', 'pgup/pgdn': 'page', home: 'top', end: 'bottom' },
  split: { drag: 'resize' },
  overlay: { 'ctrl+k': 'palette', escape: 'close' },
  form: { tab: 'next', enter: 'submit' },
  program: { escape: 'quit', 'ctrl+c': 'abort' },
} as const;

export function formatKeys(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([key, label]) => `${key} ${label}`)
    .join(' · ');
}
