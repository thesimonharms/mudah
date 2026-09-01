/** Mudah JSON-RPC LSP: initialize, completion, hover, document sync. */

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
  documentation?: string;
}

export const MANIFEST_KEYS = [
  { label: 'name', detail: 'Application name' },
  { label: 'version', detail: 'Semver version' },
  { label: 'bin', detail: 'Binary name' },
  { label: 'description', detail: 'One-line description' },
  { label: 'ui', detail: 'Theme / motion / color' },
  { label: 'updates', detail: 'Update nudge (default true)' },
  { label: 'commands', detail: 'Extra command module paths' },
  { label: 'providers', detail: 'Extra provider module paths' },
  { label: 'telemetry', detail: 'Opt-in boot/perf telemetry' },
  { label: 'watch', detail: 'Declarative file watcher' },
] as const;

export const SIGNATURE_SNIPPETS: CompletionItem[] = [
  { label: '{name}', kind: 15, detail: 'required argument' },
  { label: '{name?}', kind: 15, detail: 'optional argument' },
  { label: '{name=default}', kind: 15, detail: 'argument with default' },
  { label: '{paths...}', kind: 15, detail: 'variadic argument' },
  { label: '[--flag]', kind: 15, detail: 'boolean option' },
  { label: '[--opt=]', kind: 15, detail: 'value option' },
];

const documents = new Map<string, string>();

export function initializeResult(): {
  capabilities: {
    textDocumentSync: number;
    completionProvider: { triggerCharacters: string[] };
    hoverProvider: boolean;
  };
  serverInfo: { name: string; version: string };
} {
  return {
    capabilities: {
      textDocumentSync: 1,
      completionProvider: { triggerCharacters: ['"', '{', '-', '.'] },
      hoverProvider: true,
    },
    serverInfo: { name: 'mudah-lsp', version: '0.8.0' },
  };
}

function uriOf(params: unknown): string {
  if (typeof params !== 'object' || params === null) return '';
  const doc = (params as { textDocument?: { uri?: string } }).textDocument;
  return doc?.uri ?? '';
}

function textOf(params: unknown): string | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const rec = params as { textDocument?: { text?: string }; contentChanges?: Array<{ text?: string }> };
  return rec.textDocument?.text ?? rec.contentChanges?.[0]?.text;
}

export function completionItems(params: unknown): CompletionItem[] {
  const uri = uriOf(params);
  if (uri.endsWith('mudah.json') || uri.includes('mudah.json')) {
    return MANIFEST_KEYS.map((entry) => ({
      label: entry.label,
      kind: 14,
      detail: entry.detail,
      documentation: `mudah.json field: ${entry.detail}`,
    }));
  }
  return SIGNATURE_SNIPPETS;
}

export function hoverContents(params: unknown): { kind: 'markdown'; value: string } | null {
  const uri = uriOf(params);
  if (!(uri.endsWith('mudah.json') || uri.includes('mudah.json'))) return null;
  const pos = (params as { position?: { line?: number; character?: number } }).position;
  const text = documents.get(uri) ?? '';
  const line = text.split('\n')[pos?.line ?? 0] ?? '';
  for (const entry of MANIFEST_KEYS) {
    if (line.includes(`"${entry.label}"`) || line.includes(`'${entry.label}'`)) {
      return { kind: 'markdown', value: `**${entry.label}** — ${entry.detail}` };
    }
  }
  return { kind: 'markdown', value: 'Mudah application manifest (`mudah.json`).' };
}

/** Handle one JSON-RPC request. Notifications (no id) may return undefined. */
export function handleLspMessage(msg: LspMessage): LspMessage | undefined {
  if (msg.method === 'initialize') {
    return { jsonrpc: '2.0', id: msg.id, result: initializeResult() };
  }
  if (msg.method === 'textDocument/didOpen' || msg.method === 'textDocument/didChange') {
    const uri = uriOf(msg.params);
    const text = textOf(msg.params);
    if (uri && text !== undefined) documents.set(uri, text);
    return undefined;
  }
  if (msg.method === 'textDocument/completion') {
    return { jsonrpc: '2.0', id: msg.id, result: completionItems(msg.params) };
  }
  if (msg.method === 'textDocument/hover') {
    return { jsonrpc: '2.0', id: msg.id, result: { contents: hoverContents(msg.params) } };
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

/** LSP Content-Length framing. */
export function encodeLspFrame(message: LspMessage): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

export function decodeLspFrames(buffer: string): { messages: LspMessage[]; rest: string } {
  const messages: LspMessage[] = [];
  let rest = buffer;
  while (true) {
    const crlf = rest.indexOf('\r\n\r\n');
    const lf = rest.indexOf('\n\n');
    let headerEnd = -1;
    let sepLen = 4;
    if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
      headerEnd = crlf;
      sepLen = 4;
    } else if (lf !== -1) {
      headerEnd = lf;
      sepLen = 2;
    }
    if (headerEnd === -1) {
      const line = rest.trim();
      if (line.startsWith('{')) {
        try {
          messages.push(JSON.parse(line) as LspMessage);
          return { messages, rest: '' };
        } catch {
          return { messages, rest };
        }
      }
      return { messages, rest };
    }
    const header = rest.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      rest = rest.slice(headerEnd + sepLen);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + sepLen;
    if (rest.length < bodyStart + length) return { messages, rest };
    const body = rest.slice(bodyStart, bodyStart + length);
    rest = rest.slice(bodyStart + length);
    messages.push(JSON.parse(body) as LspMessage);
  }
}
