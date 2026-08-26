import type { ColorLevel } from '@mudah-cli/terminal';
import { bold, paint, visibleLength } from './colors.js';
import type { Theme } from './theme.js';
import { sleekDark } from './theme.js';

export interface RenderPanelOptions {
  level: ColorLevel;
  unicode: boolean;
  theme?: Theme;
  /** Fixed inner width; defaults to the widest content line (or title). */
  width?: number;
}

/**
 * Render a titled box panel:
 *
 * ```
 * ╭─ Mudah ───────────────╮
 * │ line one              │
 * │ line two              │
 * ╰───────────────────────╯
 * ```
 */
export function renderPanel(
  title: string | undefined,
  body: string[],
  options: RenderPanelOptions,
): string {
  const theme = options.theme ?? sleekDark;
  const u = options.unicode;
  const border = (ch: string): string => paint(theme.colors.border, ch, options.level);

  const cornerTL = u ? '╭' : '+';
  const cornerTR = u ? '╮' : '+';
  const cornerBL = u ? '╰' : '+';
  const cornerBR = u ? '╯' : '+';
  const vBar = u ? '│' : '|';
  const hBar = u ? '─' : '-';

  const maxContent = Math.max(0, ...body.map((line) => visibleLength(line)));
  const minForTitle = title !== undefined ? visibleLength(title) + 2 : 0;
  const innerWidth = Math.max(options.width ?? 0, maxContent, minForTitle);
  const total = innerWidth + 4;

  const top =
    title !== undefined
      ? `${border(cornerTL)}${border(hBar)} ${paint(theme.colors.accent, bold(title, options.level), options.level)} ${border(
          hBar.repeat(Math.max(1, innerWidth - visibleLength(title) - 1)),
        )}${border(cornerTR)}`
      : `${border(cornerTL)}${border(hBar.repeat(total - 2))}${border(cornerTR)}`;

  const lines = [top];
  for (const content of body) {
    const padded = content + ' '.repeat(Math.max(0, innerWidth - visibleLength(content)));
    lines.push(`${border(vBar)} ${padded} ${border(vBar)}`);
  }
  lines.push(`${border(cornerBL)}${border(hBar.repeat(total - 2))}${border(cornerBR)}`);
  return lines.join('\n');
}
