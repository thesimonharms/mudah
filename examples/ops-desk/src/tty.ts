/** Return 2 when stdout is not a TTY. Hint names the flag form. */
export function requireTty(
  output: { error(message: string): void; hint(message: string): void },
  hint: string,
): number | undefined {
  if (process.stdout.isTTY === true) return undefined;
  output.error('This command needs an interactive terminal.');
  output.hint(hint);
  return 2;
}
