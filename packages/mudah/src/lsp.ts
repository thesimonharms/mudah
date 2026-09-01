/** Mudah JSON-RPC subset: `initialize` + `textDocument/completion`. */

export interface LspMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
}

export const MANIFEST_KEYS = [
  'name',
  'version',
  'bin',
  'description',
  'ui',
  'updates',
  'commands',
  'providers',
] as const;

export const SIGNATURE_SNIPPETS = [
  '{name}',
  '{name?}',
  '{name=default}',
  '{paths...}',
  '[--flag]',
  '[--opt=]',
] as const;

export function initializeResult(): {
  capabilities: { textDocumentSync: number; completionProvider: { triggerCharacters: string[] } };
  serverInfo: { name: string; version: string };
} {
  return {
    capabilities: {
      textDocumentSync: 1,
      completionProvider: { triggerCharacters: ['"', '{', '-', '.'] },
    },
    serverInfo: { name: 'mudah-lsp', version: '0.8.0' },
  };
}

function uriOf(params: unknown): string {
  if (typeof params !== 'object' || params === null) return '';
  const doc = (params as { textDocument?: { uri?: string } }).textDocument;
  return doc?.uri ?? '';
}

export function completionItems(params: unknown): CompletionItem[] {
  const uri = uriOf(params);
  if (uri.endsWith('mudah.json') || uri.includes('mudah.json')) {
    return MANIFEST_KEYS.map((label) => ({
      label,
      kind: 14,
      detail: 'mudah.json key',
    }));
  }
  return SIGNATURE_SNIPPETS.map((label) => ({
    label,
    kind: 15,
    detail: 'command signature',
  }));
}

/** Handle one JSON-RPC request. Notifications (no id) may return undefined. */
export function handleLspMessage(msg: LspMessage): LspMessage | undefined {
  if (msg.method === 'initialize') {
    return { jsonrpc: '2.0', id: msg.id, result: initializeResult() };
  }
  if (msg.method === 'textDocument/completion') {
    return { jsonrpc: '2.0', id: msg.id, result: completionItems(msg.params) };
  }
  if (msg.method === 'shutdown') {
    return { jsonrpc: '2.0', id: msg.id, result: null };
  }
  if (msg.method === 'initialized' || msg.method === 'exit') return undefined;
  if (msg.id !== undefined) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Method not found: ${msg.method ?? ''}` },
    };
  }
  return undefined;
}
