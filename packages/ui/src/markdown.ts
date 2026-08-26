import type { ColorLevel } from '@mudah-cli/terminal';
import { bold, dim, italic, paint, underline } from './colors.js';
import type { Theme } from './theme.js';
import { sleekDark } from './theme.js';

export interface RenderMarkdownOptions {
  level: ColorLevel;
  theme?: Theme;
}

function inline(text: string, level: ColorLevel, theme: Theme): string {
  let out = text;

  // Code spans first (protect from other rules by ordering).
  out = out.replace(
    /`([^`]+)`/g,
    (_, code: string) => paint(theme.colors.highlight, code, level),
  );
  // Bold.
  out = out.replace(
    /\*\*([^*]+)\*\*/g,
    (_, strong: string) => bold(strong, level),
  );
  // Italic (single *).
  out = out.replace(
    /(^|[^*])\*([^*]+)\*(?!\*)/g,
    (_m, pre: string, em: string) => `${pre}${italic(em, level)}`,
  );
  // Links: [text](url) → dim url after text (OSC 8 hyperlinks in v0.2).
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label: string, url: string) => `${underline(label, level)} ${dim(`<${url}>`, level)}`,
  );
  return out;
}

/**
 * A lightweight markdown renderer for CLI output: headings, bullets,
 * numbered lists, blockquotes, hr, bold/italic/code, links. Not a full
 * CommonMark parser — just enough to read well in a terminal.
 */
export function renderMarkdown(source: string, options: RenderMarkdownOptions): string {
  const theme = options.theme ?? sleekDark;
  const { level } = options;
  const lines = source.split('\n');
  const out: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') {
      out.push('');
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1]!.length;
      const text = inline(heading[2]!, level, theme);
      const styled = depth <= 2 ? underline(bold(paint(theme.colors.accent, text, level), level), level) : bold(text, level);
      out.push(depth === 1 ? `\n${styled}\n` : `  ${' '.repeat((depth - 2) * 2)}${styled}`);
      continue;
    }

    const hr = /^(-{3,}|\*{3,})\s*$/.exec(line.trim());
    if (hr) {
      out.push(dim('─'.repeat(40), level));
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      out.push(dim(`│ ${inline(quote[1]!, level, theme)}`, level));
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push(`  ${dim('•', level)} ${inline(bullet[1]!, level, theme)}`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      const marker = line.slice(0, line.length - numbered[1]!.length).trim();
      out.push(`  ${dim(marker, level)} ${inline(numbered[1]!, level, theme)}`);
      continue;
    }

    out.push(inline(line, level, theme));
  }

  return out.join('\n');
}
