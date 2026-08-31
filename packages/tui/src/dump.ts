import type { Component } from './component.js';
import { Layout, type ChildBounds } from './layout.js';

export interface TreeNode {
  role: string;
  name?: string;
  value?: unknown;
  href?: string;
  focused?: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
  children?: TreeNode[];
}

function roleOf(component: Component): string {
  const inspected = component.inspect?.();
  if (inspected?.role) return inspected.role;
  return component.constructor.name.replace(/Component$/, '') || 'component';
}

function nodeOf(component: Component, bounds: ChildBounds | undefined, focused: Component | undefined): TreeNode {
  const inspected = component.inspect?.();
  const node: TreeNode = { role: roleOf(component) };
  if (inspected?.name !== undefined) node.name = inspected.name;
  if (inspected?.value !== undefined) node.value = inspected.value;
  if (inspected?.href !== undefined) node.href = inspected.href;
  if (focused !== undefined && component === focused) node.focused = true;
  if (bounds) {
    node.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
  if (component instanceof Layout) {
    const kids = component.components.map((child, i) =>
      nodeOf(child, component.childBounds[i], focused),
    );
    if (kids.length > 0) node.children = kids;
  }
  return node;
}

/** JSON tree of a layout. This is the DOM for agents. */
export function dumpTree(root: Layout): TreeNode {
  root.render();
  return nodeOf(root, undefined, root.focused);
}
