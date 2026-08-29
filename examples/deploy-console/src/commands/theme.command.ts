import { Command } from '@mudah-cli/mudah';
import { detectTheme } from '@mudah-cli/mudah/ui';
import { queryTerminalTheme } from '@mudah-cli/mudah/terminal';

/**
 * Ask the terminal for its own colors (OSC 10/11) and report what Mudah
 * decided. This is the v0.2 runtime theme query in one command.
 */
export default class ThemeCommand extends Command {
  signature = 'theme';
  description = 'Show the resolved theme and the terminal colors behind it';

  async handle(): Promise<number> {
    const canQuery = process.stdin.isTTY === true && !this.output.isMachineReadable;
    const theme = await detectTheme({ name: 'auto', allowQuery: canQuery });

    this.output.section('Theme');
    this.output.raw(`  resolved   ${theme.name}\n`);
    this.output.raw(`  mode       ${theme.mode}\n`);
    this.output.raw(`  accent     ${theme.colors.accent}\n`);
    this.output.raw(`  text       ${theme.colors.text}\n`);

    if (!canQuery) {
      this.output.muted('No TTY — skipped OSC 10/11 query.');
      return 0;
    }

    // Show the raw query too, so a terminal that doesn't answer is obvious.
    const probe = await queryTerminalTheme({ timeoutMs: 80 });
    this.output.raw('\n');
    if (!probe.ok) {
      this.output.muted(`No answer from the terminal (${probe.reason ?? 'unknown'}) — using dark.`);
      return 0;
    }
    const hex = (rgb: { r: number; g: number; b: number }): string =>
      `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    if (probe.background !== undefined) {
      this.output.raw(`  background  ${hex(probe.background)}\n`);
    }
    if (probe.foreground !== undefined) {
      this.output.raw(`  foreground  ${hex(probe.foreground)}\n`);
    }
    return 0;
  }
}
