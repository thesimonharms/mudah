import type { PluginInfo } from './plugins.js';

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface ProviderGraph {
  readonly nodes: string[];
  readonly edges: GraphEdge[];
}

/**
 * Build a DAG of plugin names (via `depends`) and the providers each
 * plugin registers. Extra node names (app-local providers) are included
 * as isolated vertices.
 */
export function pluginGraph(
  plugins: readonly PluginInfo[],
  extraNodes: readonly string[] = [],
): ProviderGraph {
  const nodes = new Set<string>(extraNodes);
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const plugin of plugins) {
    nodes.add(plugin.name);
    for (const dep of plugin.depends ?? []) {
      nodes.add(dep);
      const key = `${dep}\0${plugin.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: dep, to: plugin.name });
      }
    }
    for (const provider of plugin.providers) {
      nodes.add(provider.name);
      const key = `${plugin.name}\0${provider.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: plugin.name, to: provider.name });
      }
    }
  }

  return { nodes: [...nodes].sort(), edges };
}

/** Render a graph as ASCII `a -> b` lines or Graphviz DOT. */
export function formatGraph(graph: ProviderGraph, format: 'ascii' | 'dot' = 'ascii'): string {
  if (format === 'dot') {
    const lines = ['digraph {'];
    const connected = new Set<string>();
    for (const edge of graph.edges) {
      lines.push(`  "${edge.from}" -> "${edge.to}";`);
      connected.add(edge.from);
      connected.add(edge.to);
    }
    for (const node of graph.nodes) {
      if (!connected.has(node)) lines.push(`  "${node}";`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  if (graph.edges.length === 0) {
    return graph.nodes.length === 0 ? '(empty)' : graph.nodes.join('\n');
  }
  return graph.edges.map((edge) => `${edge.from} -> ${edge.to}`).join('\n');
}
