import type { Component } from './component.js';
import { dumpTree } from './dump.js';
import { ScreenBuffer } from './screen-buffer.js';
import { blitLines } from './blit.js';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * WASI / web-safe widget render: no `process`, no stdout, no terminal I/O.
 * Returns the component's drawable rows joined by newlines.
 */
export function renderWidgetToText(component: Component, width = 80, height = 24): string {
  component.resize?.(width, height);
  return component.render().join('\n');
}

/** WASI-safe inspect tree as JSON text (still no process / fs). */
export function renderWidgetTree(component: Component, width = 80, height = 24): string {
  component.resize?.(width, height);
  return JSON.stringify(dumpTree(component), null, 2);
}

/**
 * Browser-safe HTML: each cell is a span tagged with its blit style
 * (`mudah-accent`, `mudah-border`, `mudah-text`).
 */
export function renderWidgetToHtml(component: Component, width = 80, height = 24): string {
  component.resize?.(width, height);
  const buffer = new ScreenBuffer(width, height);
  blitLines(buffer, component.render());
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    let run = '';
    let style = '';
    const flush = (): void => {
      if (run.length === 0) return;
      const cls = style.length > 0 ? ` class="mudah-${escapeHtml(style)}"` : '';
      row += `<span${cls}>${escapeHtml(run)}</span>`;
      run = '';
    };
    for (let x = 0; x < width; x++) {
      const cell = buffer.getCell(x, y);
      if (cell.char === '') continue;
      if (cell.style !== style) {
        flush();
        style = cell.style;
      }
      run += cell.char;
    }
    flush();
    rows.push(row);
  }
  return `<pre class="mudah-widget">${rows.join('\n')}</pre>`;
}
