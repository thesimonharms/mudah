import type { ColorLevel } from '@mudah-cli/terminal';
import { bold, dim, italic, paint, underline } from './colors.js';
import { renderPanel } from './panel.js';
import { renderTable, type TableColumn } from './table.js';
import type { Theme } from './theme.js';
import { sleekDark } from './theme.js';

export interface RenderMarkdownOptions {
  level: ColorLevel;
  theme?: Theme;
  /** Use unicode box characters in rendered blocks (code panels). Default true. */
  unicode?: boolean;
}

/** A fenced code block: 3+ backticks, an optional language tag, then content. */
const FENCE_RE = /^(`{3,})[ \t]*(\w+)?[ \t]*$/;

function inline(text: string, level: ColorLevel, theme: Theme): string {
  let out = text;

  // Code spans first (protect from other rules by ordering).
  out = out.replace(/`([^`]+)`/g, (_, code: string) => paint(theme.colors.highlight, code, level));
  // Bold.
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, strong: string) => bold(strong, level));
  // Italic (single *).
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (_m, pre: string, em: string) => `${pre}${italic(em, level)}`);
  // Links: [text](url) -> dim url after text (OSC 8 hyperlinks in v0.2).
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label: string, url: string) => `${underline(label, level)} ${dim(`<${url}>`, level)}`,
  );
  return out;
}

/** A GFM pipe-table row: `| a | b |`. */
function isPipeTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length >= 3;
}

/** Separator under a header: `| --- |` / `| :--- |` / `| ---: |`. */
function isPipeTableSeparator(line: string): boolean {
  if (!isPipeTableRow(line)) return false;
  const cells = splitPipeRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitPipeRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith('|') ? t.slice(1) : t;
  const body = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return body.split('|').map((cell) => cell.trim());
}

function alignFromSeparator(cell: string): 'left' | 'right' {
  return cell.startsWith(':') === false && cell.endsWith(':') ? 'right' : 'left';
}

/**
 * A lightweight markdown renderer for CLI output: headings, bullets,
 * numbered lists, task lists, pipe tables, blockquotes, hr, bold/italic/code,
 * and fenced code blocks rendered as theme-aware panels. Not a full CommonMark
 * parser — just enough to read well in a terminal.
 */
export function renderMarkdown(source: string, options: RenderMarkdownOptions): string {
  const theme = options.theme ?? sleekDark;
  const { level } = options;
  const unicode = options.unicode ?? true;
  const lines = source.split('\n');
  const out: string[] = [];

  let inFence = false;
  let fenceLang: string | undefined;
  let fenceInner: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.replace(/\s+$/, '');

    const fence = FENCE_RE.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceLang = fence[2];
        fenceInner = [];
      } else {
        out.push(renderPanel(fenceLang, fenceInner, { level, unicode, theme }));
        inFence = false;
        fenceLang = undefined;
        fenceInner = [];
      }
      continue;
    }

    if (inFence) {
      // Preserve code lines verbatim, including blank and indented lines.
      fenceInner.push(rawLine);
      continue;
    }

    const next = (lines[i + 1] ?? '').replace(/\s+$/, '');
    if (isPipeTableRow(line) && isPipeTableSeparator(next)) {
      const headers = splitPipeRow(line);
      const aligns = splitPipeRow(next).map(alignFromSeparator);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const body = lines[i]!.replace(/\s+$/, '');
        if (!isPipeTableRow(body) || isPipeTableSeparator(body)) break;
        rows.push(splitPipeRow(body));
        i += 1;
      }
      i -= 1;
      const columns: TableColumn[] = headers.map((header, idx) => ({
        header,
        align: aligns[idx] === 'right' ? 'right' : 'left',
      }));
      out.push(renderTable(columns, rows, { level, unicode, theme }));
      continue;
    }

    if (line.trim() === '') {
      out.push('');
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1]!.length;
      const text = inline(heading[2]!, level, theme);
      const styled =
        depth <= 2 ? underline(bold(paint(theme.colors.accent, text, level), level), level) : bold(text, level);
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

    const task = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      const checked = task[1] !== ' ';
      const mark = unicode ? (checked ? '☑' : '☐') : checked ? '[x]' : '[ ]';
      out.push(`  ${mark} ${inline(task[2]!, level, theme)}`);
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

  // Unterminated fence: emit what was collected so content isn't lost.
  if (inFence) {
    out.push(renderPanel(fenceLang, fenceInner, { level, unicode, theme }));
  }

  return out.join('\n');
}
