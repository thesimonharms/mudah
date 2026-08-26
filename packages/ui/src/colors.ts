import type { ColorLevel } from '@mudah-cli/terminal';

/** Strip ANSI escape sequences (for width measurement). */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');
}

export function visibleLength(text: string): number {
  // Conservative: treat CJK/fullwidth as 2 cells.
  let width = 0;
  for (const char of stripAnsi(text)) {
    width += /[\u1100-\u115f\u2e80-\u9fff\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/.test(char) ? 2 : 1;
  }
  return width;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const XTERM_256: [number, number, number][] = (() => {
  const palette: [number, number, number][] = [];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette.push([r * 51 - (r > 0 ? 10 : 0), g * 51 - (g > 0 ? 10 : 0), b * 51 - (b > 0 ? 10 : 0)]);
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    palette.push([v, v, v]);
  }
  return palette;
})();

function nearestXterm256(rgb: [number, number, number]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < XTERM_256.length; i++) {
    const [r, g, b] = XTERM_256[i]!;
    const dist = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return 16 + best;
}

/**
 * Paint `text` with a hex foreground color, honoring the terminal's color
 * level (0 = no color, 1/8 = nearest 256-color, 24 = truecolor).
 */
export function paint(hex: string, text: string, level: ColorLevel): string {
  if (level === 0) return text;
  const [r, g, b] = parseHex(hex);
  if (level === 24) {
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
  }
  return `\x1b[38;5;${nearestXterm256([r, g, b])}m${text}\x1b[39m`;
}

/** Paint `text` with a hex background color. */
export function paintBg(hex: string, text: string, level: ColorLevel): string {
  if (level === 0) return text;
  const [r, g, b] = parseHex(hex);
  if (level === 24) {
    return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
  }
  return `\x1b[48;5;${nearestXterm256([r, g, b])}m${text}\x1b[49m`;
}

export function dim(text: string, level: ColorLevel): string {
  return level === 0 ? text : `\x1b[2m${text}\x1b[22m`;
}

export function bold(text: string, level: ColorLevel): string {
  return level === 0 ? text : `\x1b[1m${text}\x1b[22m`;
}

export function italic(text: string, level: ColorLevel): string {
  return level === 0 ? text : `\x1b[3m${text}\x1b[23m`;
}

export function underline(text: string, level: ColorLevel): string {
  return level === 0 ? text : `\x1b[4m${text}\x1b[24m`;
}
