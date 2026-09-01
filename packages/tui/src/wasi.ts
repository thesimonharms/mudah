import type { Component } from './component.js';
import { dumpTree } from './dump.js';

/**
 * WASI-safe widget render: no `process`, no stdout, no terminal I/O.
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
